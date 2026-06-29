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

// Deliver a chunk (or null for EOF) to a waiting read() or buffer it.
function deliver(state, value) {
  if (state.pending) {
    const { resolve } = state.pending;
    state.pending = null;
    resolve(value);
  } else {
    state.queue.push(value);
  }
}

// Surface a socket error to a waiting read() so EOF and failure are distinct.
function deliverError(state, error) {
  state.failure = error;
  if (state.pending) {
    const { reject } = state.pending;
    state.pending = null;
    reject(error);
  }
}

function armReader(state) {
  state.asyncIn.asyncWait(
    {
      onInputStreamReady(stream) {
        try {
          const available = stream.available();
          if (available === 0) {
            deliver(state, null); // clean EOF
            return;
          }
          const bytes = state.binaryIn.readByteArray(available);
          deliver(state, bytes);
          armReader(state);
        } catch (e) {
          deliverError(state, e instanceof Error ? e : new Error(String(e)));
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
            // ManageSieve is an IMAP-adjacent service; POP3 accounts have none.
            if (server.type !== 'imap') continue;
            accounts.push({
              key: server.key,
              name: server.prettyName,
              host: server.hostName,
              username: server.username,
              port: server.port,
              socketType: server.socketType,
              type: server.type,
              oauth: server.authMethod === Ci.nsMsgAuthMethod.OAuth2,
            });
          }
          return accounts;
        },

        // Get an OAuth2 bearer token for the account, for XOAUTH2 auth.
        // Uses Thunderbird's OAuth2 module (msgIOAuth2Module): initFromMail()
        // associates it with the account's stored OAuth credentials and
        // getAccessToken() returns a fresh token (refreshing if needed).
        // NOTE: verify the msgIOAuth2Module API against the target Thunderbird.
        async getOAuthToken(accountKey) {
          const server = MailServices.accounts.getIncomingServer(accountKey);
          const oauth = Cc['@mozilla.org/mail/oauth2-module;1'].createInstance(Ci.msgIOAuth2Module);
          if (!oauth.initFromMail(server)) {
            throw new Error('account is not configured for OAuth2');
          }
          return new Promise((resolve, reject) => {
            oauth.getAccessToken({
              onSuccess: (token) => resolve(token),
              onFailure: () => reject(new Error('OAuth2 token retrieval failed')),
            });
          });
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
          const state = {
            transport,
            out,
            asyncIn,
            binaryIn,
            binaryOut,
            queue: [],
            pending: null,
            failure: null,
          };
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
          if (state.failure) throw state.failure;
          return new Promise((resolve, reject) => {
            state.pending = { resolve, reject };
          });
        },

        async startTls(id) {
          const state = connections.get(id);
          if (!state) throw new Error(`unknown connection ${id}`);
          // STARTTLS injection defence: nothing should be buffered before the
          // handshake; data here would otherwise be read as post-TLS bytes.
          if (state.queue.length > 0) {
            throw new Error('unexpected data before TLS handshake (possible STARTTLS injection)');
          }
          await startTlsUpgrade(state.transport);
        },

        async close(id) {
          const state = connections.get(id);
          if (!state) return;
          connections.delete(id);
          // Unblock a read() still awaiting on this connection.
          if (state.pending) {
            const { resolve } = state.pending;
            state.pending = null;
            resolve(null);
          }
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
