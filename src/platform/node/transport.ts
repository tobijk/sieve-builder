/**
 * Node implementation of the ManageSieve {@link Transport}, backed by a
 * `net.Socket` that can be upgraded in place to TLS via STARTTLS. Used by the
 * standalone/native shell and by integration tests; the Thunderbird shell will
 * supply its own transport over the TCP experiment API.
 */
import net from 'node:net';
import tls from 'node:tls';

import type { Transport } from '../../core/managesieve/transport.js';

export interface ConnectOptions {
  host: string;
  port?: number;
  /** TLS options applied during startTls() (e.g. servername, ca). */
  tls?: tls.ConnectionOptions;
}

export class NodeTransport implements Transport {
  private socket: net.Socket;
  private readonly host: string;
  private readonly tlsOptions: tls.ConnectionOptions;

  private queue: Uint8Array[] = [];
  private waiters: Array<(v: Uint8Array | null) => void> = [];
  private ended = false;
  private failure: Error | null = null;

  private constructor(socket: net.Socket, host: string, tlsOptions: tls.ConnectionOptions) {
    this.host = host;
    this.tlsOptions = tlsOptions;
    this.socket = socket;
    this.attach(socket);
  }

  static connect(options: ConnectOptions): Promise<NodeTransport> {
    const port = options.port ?? 4190;
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: options.host, port });
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.removeListener('error', reject);
        resolve(new NodeTransport(socket, options.host, options.tls ?? {}));
      });
    });
  }

  private attach(socket: net.Socket): void {
    socket.on('data', (chunk: Buffer) => {
      const bytes = new Uint8Array(chunk);
      const waiter = this.waiters.shift();
      if (waiter) waiter(bytes);
      else this.queue.push(bytes);
    });
    socket.on('end', () => this.finish(null));
    socket.on('close', () => this.finish(null));
    socket.on('error', (err) => this.finish(err));
  }

  private finish(err: Error | null): void {
    if (this.ended) return;
    this.ended = true;
    if (err) this.failure = err;
    for (const waiter of this.waiters.splice(0)) waiter(null);
  }

  async read(): Promise<Uint8Array | null> {
    const queued = this.queue.shift();
    if (queued) return queued;
    if (this.ended) {
      if (this.failure) throw this.failure;
      return null;
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  write(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err) => (err ? reject(err) : resolve()));
    });
  }

  startTls(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Detach our listeners; tls.connect adopts the underlying socket.
      this.socket.removeAllListeners('data');
      this.socket.removeAllListeners('end');
      this.socket.removeAllListeners('close');
      this.socket.removeAllListeners('error');

      const secure = tls.connect({ ...this.tlsOptions, socket: this.socket, servername: this.host });
      secure.once('error', reject);
      secure.once('secureConnect', () => {
        secure.removeListener('error', reject);
        this.socket = secure;
        this.attach(secure);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.socket.end();
  }
}
