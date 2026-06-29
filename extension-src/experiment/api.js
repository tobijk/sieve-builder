/**
 * Privileged experiment API for Sieve Builder.
 *
 * Exposes `messenger.sieve.*` to the extension: enumerate IMAP accounts, fetch
 * their stored password, and run a raw TCP socket with a STARTTLS upgrade.
 * WebExtensions cannot do any of this directly, which is why a privileged
 * experiment API is required.
 *
 * IMPORTANT: this is the one part of the project that cannot be exercised
 * outside a real Thunderbird build. The XPCOM socket/STARTTLS surface has
 * shifted across Gecko versions, so verify against the target Thunderbird
 * (128 ESR+) and adjust the STARTTLS upgrade path if needed. TLS verification
 * (chain + hostname) and any user-approved certificate exceptions are handled
 * by Thunderbird's own socket stack, so this behaves like the IMAP connection.
 */

/* global Components, ChromeUtils, ExtensionCommon */

const { classes: Cc, interfaces: Ci } = Components;
const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
// `Services` is a global in the experiment parent scope.

const SOCKET_SERVICE = '@mozilla.org/network/socket-transport-service;1';
const BINARY_INPUT = '@mozilla.org/binaryinputstream;1';
const BINARY_OUTPUT = '@mozilla.org/binaryoutputstream;1';

/** id -> connection state */
const connections = new Map();
let nextId = 1;

function deliver(state, value) {
  if (state.pending) {
    const resolve = state.pending;
    state.pending = null;
    resolve(value);
  } else {
    state.queue.push(value);
  }
}

function armReader(state) {
  state.asyncIn.asyncWait(
    {
      onInputStreamReady(stream) {
        try {
          const available = stream.available();
          if (available === 0) {
            deliver(state, null); // EOF
            return;
          }
          const bytes = state.binaryIn.readByteArray(available);
          deliver(state, bytes);
          armReader(state);
        } catch (_e) {
          deliver(state, null); // closed / error
        }
      },
    },
    0,
    0,
    Services.tm.mainThread,
  );
}

function startTlsUpgrade(transport) {
  // Newer Gecko: nsISocketTransport.tlsSocketControl.asyncStartTLS().
  // Older Gecko: securityInfo QI to nsISSLSocketControl, then StartTLS().
  const control = transport.tlsSocketControl;
  if (control && typeof control.asyncStartTLS === 'function') {
    return control.asyncStartTLS();
  }
  const legacy = transport.securityInfo.QueryInterface(Ci.nsISSLSocketControl);
  legacy.StartTLS();
  return Promise.resolve();
}

var sieve = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return {
      sieve: {
        async listAccounts() {
          const accounts = [];
          for (const server of MailServices.accounts.allServers) {
            if (server.type !== 'imap' && server.type !== 'pop3') continue;
            accounts.push({
              key: server.key,
              name: server.prettyName,
              host: server.hostName,
              username: server.username,
              port: server.port,
              socketType: server.socketType,
              type: server.type,
            });
          }
          return accounts;
        },

        async getPassword(accountKey) {
          const server = MailServices.accounts.getIncomingServer(accountKey);
          if (server && server.password) return server.password;
          // Fall back to the login manager entry for the incoming server.
          try {
            const origin = `${server.localStoreType === 'imap' ? 'imap' : server.type}://${server.hostName}`;
            const logins = Services.logins.findLogins(origin, null, origin);
            const match = logins.find((l) => l.username === server.username) ?? logins[0];
            return match ? match.password : null;
          } catch (_e) {
            return null;
          }
        },

        async connect(host, port) {
          const sts = Cc[SOCKET_SERVICE].getService(Ci.nsISocketTransportService);
          // "starttls" socket: starts plaintext, upgradeable to TLS later.
          const transport = sts.createTransport(['starttls'], host, port, null, null);

          const out = transport.openOutputStream(0, 0, 0);
          const rawIn = transport.openInputStream(0, 0, 0);
          const asyncIn = rawIn.QueryInterface(Ci.nsIAsyncInputStream);
          const binaryIn = Cc[BINARY_INPUT].createInstance(Ci.nsIBinaryInputStream);
          binaryIn.setInputStream(asyncIn);
          const binaryOut = Cc[BINARY_OUTPUT].createInstance(Ci.nsIBinaryOutputStream);
          binaryOut.setOutputStream(out);

          const id = nextId++;
          const state = { transport, out, asyncIn, binaryIn, binaryOut, queue: [], pending: null };
          connections.set(id, state);
          armReader(state);
          return id;
        },

        async write(id, bytes) {
          const state = connections.get(id);
          if (!state) throw new Error(`unknown connection ${id}`);
          state.binaryOut.writeByteArray(bytes, bytes.length);
          state.binaryOut.flush();
        },

        async read(id) {
          const state = connections.get(id);
          if (!state) throw new Error(`unknown connection ${id}`);
          if (state.queue.length > 0) return state.queue.shift();
          return new Promise((resolve) => {
            state.pending = resolve;
          });
        },

        async startTls(id) {
          const state = connections.get(id);
          if (!state) throw new Error(`unknown connection ${id}`);
          await startTlsUpgrade(state.transport);
        },

        async close(id) {
          const state = connections.get(id);
          if (!state) return;
          connections.delete(id);
          try {
            state.binaryIn.close();
          } catch (_e) {
            /* ignore */
          }
          try {
            state.out.close();
          } catch (_e) {
            /* ignore */
          }
          state.transport.close(Components.results.NS_OK);
        },
      },
    };
  }
};
