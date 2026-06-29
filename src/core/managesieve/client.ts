/**
 * A ManageSieve client (RFC 5804) over an injected {@link Transport}.
 *
 * Security posture:
 *  - Credentials are never sent over a plaintext connection unless the caller
 *    explicitly opts out (`requireTls: false`, intended only for localhost
 *    testing). Call `startTls()` first in production.
 *  - Script literals are framed with their exact UTF-8 byte length, so
 *    multi-byte content is transmitted intact.
 *  - The reader bounds line and literal sizes to resist a hostile server.
 *  - Nothing here logs credentials.
 */
import { concat } from './bytes.js';
import { ManageSieveError, ProtocolError } from './errors.js';
import {
  base64,
  fromBase64,
  isStatusHead,
  parseCapability,
  parseListLine,
  parseStatus,
  quote,
  type StatusLine,
} from './protocol.js';
import {
  plainMechanism,
  scramMechanism,
  xoauth2Mechanism,
  type SaslMechanism,
} from './sasl.js';
import { ByteReader } from './reader.js';
import type { Transport } from './transport.js';

export interface ClientOptions {
  /** Require TLS before AUTHENTICATE. Default true. */
  requireTls?: boolean;
  /** Maximum accepted literal size in bytes (anti-DoS). */
  maxLiteral?: number;
}

export interface Capabilities {
  implementation: string;
  version: string;
  starttls: boolean;
  /** SASL mechanism names, upper-cased. */
  sasl: Set<string>;
  /** Supported Sieve extensions. */
  sieve: Set<string>;
}

export interface ScriptInfo {
  name: string;
  active: boolean;
}

export interface PutResult {
  warnings?: string;
}

function emptyCapabilities(): Capabilities {
  return { implementation: '', version: '', starttls: false, sasl: new Set(), sieve: new Set() };
}

export class ManageSieveClient {
  private readonly reader: ByteReader;
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder('utf-8');
  private secure = false;
  private caps: Capabilities = emptyCapabilities();
  /** Serialises commands so they never interleave on the shared reader. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly transport: Transport,
    private readonly options: ClientOptions = {},
  ) {
    this.reader = new ByteReader(transport, undefined, options.maxLiteral);
  }

  get capabilities(): Capabilities {
    return this.caps;
  }

  get isSecure(): boolean {
    return this.secure;
  }

  /** Read the server greeting and its advertised capabilities. */
  connect(): Promise<void> {
    return this.serialize(async () => {
      const { status, data } = await this.readResponse();
      if (!status.ok) throw new ManageSieveError(status);
      this.caps = this.parseCapabilities(data);
    });
  }

  /** Perform STARTTLS, upgrade the transport, and re-read capabilities. */
  startTls(): Promise<void> {
    return this.serialize(async () => {
      if (this.secure) return;
      if (!this.caps.starttls) throw new ProtocolError('server does not advertise STARTTLS');
      await this.send('STARTTLS');
      await this.expectOk();

      // STARTTLS injection defence: a well-behaved server sends nothing between
      // the STARTTLS OK and the TLS handshake. Any buffered plaintext here would
      // otherwise be read as if it were authenticated post-TLS data.
      const pending = this.reader.bufferedBytes() + (this.transport.bytesPending?.() ?? 0);
      if (pending > 0) {
        throw new ProtocolError('unexpected data before TLS handshake (possible STARTTLS injection)');
      }

      await this.transport.startTls();
      this.secure = true;
      const { status, data } = await this.readResponse();
      if (!status.ok) throw new ManageSieveError(status);
      this.caps = this.parseCapabilities(data);
    });
  }

  /**
   * Authenticate with a password, using the strongest mechanism the server
   * offers: SCRAM-SHA-256 > SCRAM-SHA-1 > PLAIN.
   */
  authenticate(username: string, password: string): Promise<void> {
    return this.serialize(async () => {
      this.assertSecureForAuth();
      await this.runSasl(this.pickPasswordMechanism(username, password));
    });
  }

  /** Authenticate with an OAuth2 bearer token via SASL XOAUTH2. */
  authenticateOAuth2(username: string, token: string): Promise<void> {
    return this.serialize(async () => {
      this.assertSecureForAuth();
      if (this.caps.sasl.size > 0 && !this.caps.sasl.has('XOAUTH2')) {
        throw new ProtocolError('server does not offer SASL XOAUTH2');
      }
      await this.runSasl(xoauth2Mechanism(username, token));
    });
  }

  /** List stored scripts and which one (if any) is active. */
  listScripts(): Promise<ScriptInfo[]> {
    return this.serialize(async () => {
      await this.send('LISTSCRIPTS');
      const { status, data } = await this.readResponse();
      if (!status.ok) throw new ManageSieveError(status);
      const scripts: ScriptInfo[] = [];
      for (const line of data) {
        const parsed = parseListLine(this.dec.decode(line));
        if (parsed) scripts.push(parsed);
      }
      return scripts;
    });
  }

  /** Fetch a script's source. */
  getScript(name: string): Promise<string> {
    return this.serialize(async () => {
      await this.send(`GETSCRIPT ${quote(name)}`);
      const { status, data } = await this.readResponse();
      if (!status.ok) throw new ManageSieveError(status);
      return data.length > 0 ? this.dec.decode(data[0]!) : '';
    });
  }

  /** Upload (create or replace) a script. Returns any server warnings. */
  putScript(name: string, content: string): Promise<PutResult> {
    return this.serialize(async () => {
      await this.sendLiteralCommand(`PUTSCRIPT ${quote(name)}`, content);
      return this.readPutResult();
    });
  }

  /** Validate a script without storing it. Throws on a compile error. */
  checkScript(content: string): Promise<PutResult> {
    return this.serialize(async () => {
      await this.sendLiteralCommand('CHECKSCRIPT', content);
      return this.readPutResult();
    });
  }

  /** Set the active script, or pass `null` to deactivate all scripts. */
  setActive(name: string | null): Promise<void> {
    return this.serialize(async () => {
      await this.send(`SETACTIVE ${quote(name ?? '')}`);
      await this.expectOk();
    });
  }

  deleteScript(name: string): Promise<void> {
    return this.serialize(async () => {
      await this.send(`DELETESCRIPT ${quote(name)}`);
      await this.expectOk();
    });
  }

  renameScript(from: string, to: string): Promise<void> {
    return this.serialize(async () => {
      await this.send(`RENAMESCRIPT ${quote(from)} ${quote(to)}`);
      await this.expectOk();
    });
  }

  noop(): Promise<void> {
    return this.serialize(async () => {
      await this.send('NOOP');
      await this.expectOk();
    });
  }

  /** Log out and close the connection. */
  async logout(): Promise<void> {
    try {
      await this.serialize(async () => {
        await this.send('LOGOUT');
        try {
          await this.expectOk();
        } catch {
          // The server may simply drop the connection after LOGOUT.
        }
      });
    } finally {
      await this.transport.close();
    }
  }

  /** Close the transport immediately, without LOGOUT — for error cleanup. */
  async close(): Promise<void> {
    await this.transport.close();
  }

  // --- internals ------------------------------------------------------------

  /** Run `op` after all previously-queued commands, success or failure. */
  private serialize<T>(op: () => Promise<T>): Promise<T> {
    const result = this.chain.then(op, op);
    const swallow = () => undefined;
    this.chain = result.then(swallow, swallow); // keep the chain alive, no unhandled rejections
    return result;
  }

  private async send(command: string): Promise<void> {
    await this.transport.write(this.enc.encode(`${command}\r\n`));
  }

  private assertSecureForAuth(): void {
    if (this.options.requireTls !== false && !this.secure) {
      throw new ProtocolError(
        'refusing to send credentials over an insecure connection; call startTls() first',
      );
    }
  }

  private pickPasswordMechanism(username: string, password: string): SaslMechanism {
    const sasl = this.caps.sasl;
    if (sasl.has('SCRAM-SHA-256')) return scramMechanism(username, password, 'SHA-256');
    if (sasl.has('SCRAM-SHA-1')) return scramMechanism(username, password, 'SHA-1');
    if (sasl.size === 0 || sasl.has('PLAIN')) return plainMechanism(username, password);
    throw new ProtocolError('server offers no supported password mechanism (PLAIN or SCRAM)');
  }

  /** Drive a SASL exchange: initial response, then challenge/response until OK/NO. */
  private async runSasl(mechanism: SaslMechanism): Promise<void> {
    const initial = await mechanism.start();
    let command = `AUTHENTICATE ${quote(mechanism.name)}`;
    if (initial !== null) command += ` ${quote(base64(initial))}`;
    await this.send(command);

    for (;;) {
      const { bytes, head } = await this.reader.readLine();
      if (isStatusHead(head)) {
        const status = parseStatus(this.dec.decode(bytes));
        if (!status) throw new ProtocolError('malformed status line during authentication');
        if (!status.ok) throw new ManageSieveError(status);
        return;
      }
      // Server challenge: a base64 string, sent quoted or as a literal.
      const text = this.dec.decode(bytes);
      const challengeB64 = text.startsWith('"') ? text.replace(/^"|"$/g, '') : text;
      const response = await mechanism.next(fromBase64(challengeB64));
      await this.send(quote(base64(response)));
    }
  }

  private async sendLiteralCommand(prefix: string, content: string): Promise<void> {
    const payload = this.enc.encode(content); // measure & send UTF-8 bytes
    const header = this.enc.encode(`${prefix} {${payload.length}+}\r\n`);
    await this.transport.write(concat(header, payload, this.enc.encode('\r\n')));
  }

  private async readResponse(): Promise<{ status: StatusLine; data: Uint8Array[] }> {
    const data: Uint8Array[] = [];
    for (;;) {
      const { bytes, head } = await this.reader.readLine();
      if (isStatusHead(head)) {
        const status = parseStatus(this.dec.decode(bytes));
        if (!status) throw new ProtocolError(`malformed status line: ${this.dec.decode(bytes)}`);
        return { status, data };
      }
      data.push(bytes);
    }
  }

  private async expectOk(): Promise<StatusLine> {
    const { status } = await this.readResponse();
    if (!status.ok) throw new ManageSieveError(status);
    return status;
  }

  private async readPutResult(): Promise<PutResult> {
    const status = await this.expectOk();
    return status.code === 'WARNINGS' && status.message ? { warnings: status.message } : {};
  }

  private parseCapabilities(lines: Uint8Array[]): Capabilities {
    const caps = emptyCapabilities();
    for (const line of lines) {
      const cap = parseCapability(this.dec.decode(line));
      if (!cap) continue;
      switch (cap.name) {
        case 'IMPLEMENTATION':
          caps.implementation = cap.value;
          break;
        case 'VERSION':
          caps.version = cap.value;
          break;
        case 'STARTTLS':
          caps.starttls = true;
          break;
        case 'SASL':
          for (const m of cap.value.split(/\s+/).filter(Boolean)) caps.sasl.add(m.toUpperCase());
          break;
        case 'SIEVE':
          for (const e of cap.value.split(/\s+/).filter(Boolean)) caps.sieve.add(e);
          break;
      }
    }
    return caps;
  }
}
