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
  isStatusHead,
  parseCapability,
  parseListLine,
  parseStatus,
  quote,
  type StatusLine,
} from './protocol.js';
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
  async connect(): Promise<void> {
    const { status, data } = await this.readResponse();
    if (!status.ok) throw new ManageSieveError(status);
    this.caps = this.parseCapabilities(data);
  }

  /** Perform STARTTLS, upgrade the transport, and re-read capabilities. */
  async startTls(): Promise<void> {
    if (this.secure) return;
    if (!this.caps.starttls) throw new ProtocolError('server does not advertise STARTTLS');
    await this.send('STARTTLS');
    await this.expectOk();
    await this.transport.startTls();
    this.secure = true;
    const { status, data } = await this.readResponse();
    if (!status.ok) throw new ManageSieveError(status);
    this.caps = this.parseCapabilities(data);
  }

  /** Authenticate with SASL PLAIN. */
  async authenticate(username: string, password: string): Promise<void> {
    if (this.options.requireTls !== false && !this.secure) {
      throw new ProtocolError(
        'refusing to send credentials over an insecure connection; call startTls() first',
      );
    }
    if (this.caps.sasl.size > 0 && !this.caps.sasl.has('PLAIN')) {
      throw new ProtocolError('server does not offer SASL PLAIN');
    }
    // SASL PLAIN = authzid <NUL> authcid <NUL> passwd, with an empty authzid.
    const NUL = String.fromCharCode(0);
    const credentials = this.enc.encode(`${NUL}${username}${NUL}${password}`);
    await this.send(`AUTHENTICATE "PLAIN" ${quote(base64(credentials))}`);
    const { status, data } = await this.readResponse();
    if (!status.ok) throw new ManageSieveError(status);
    if (data.length > 0) this.caps = this.parseCapabilities(data); // some servers re-issue caps
  }

  /** List stored scripts and which one (if any) is active. */
  async listScripts(): Promise<ScriptInfo[]> {
    await this.send('LISTSCRIPTS');
    const { status, data } = await this.readResponse();
    if (!status.ok) throw new ManageSieveError(status);
    const scripts: ScriptInfo[] = [];
    for (const line of data) {
      const parsed = parseListLine(this.dec.decode(line));
      if (parsed) scripts.push(parsed);
    }
    return scripts;
  }

  /** Fetch a script's source. */
  async getScript(name: string): Promise<string> {
    await this.send(`GETSCRIPT ${quote(name)}`);
    const { status, data } = await this.readResponse();
    if (!status.ok) throw new ManageSieveError(status);
    return data.length > 0 ? this.dec.decode(data[0]!) : '';
  }

  /** Upload (create or replace) a script. Returns any server warnings. */
  async putScript(name: string, content: string): Promise<PutResult> {
    await this.sendLiteralCommand(`PUTSCRIPT ${quote(name)}`, content);
    return this.readPutResult();
  }

  /** Validate a script without storing it. Throws on a compile error. */
  async checkScript(content: string): Promise<PutResult> {
    await this.sendLiteralCommand('CHECKSCRIPT', content);
    return this.readPutResult();
  }

  /** Set the active script, or pass `null` to deactivate all scripts. */
  async setActive(name: string | null): Promise<void> {
    await this.send(`SETACTIVE ${quote(name ?? '')}`);
    await this.expectOk();
  }

  async deleteScript(name: string): Promise<void> {
    await this.send(`DELETESCRIPT ${quote(name)}`);
    await this.expectOk();
  }

  async renameScript(from: string, to: string): Promise<void> {
    await this.send(`RENAMESCRIPT ${quote(from)} ${quote(to)}`);
    await this.expectOk();
  }

  async noop(): Promise<void> {
    await this.send('NOOP');
    await this.expectOk();
  }

  /** Log out and close the connection. */
  async logout(): Promise<void> {
    await this.send('LOGOUT');
    try {
      await this.expectOk();
    } catch {
      // The server may simply drop the connection after LOGOUT.
    }
    await this.transport.close();
  }

  // --- internals ------------------------------------------------------------

  private async send(command: string): Promise<void> {
    await this.transport.write(this.enc.encode(`${command}\r\n`));
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
