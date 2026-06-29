/**
 * ManageSieve {@link Transport} backed by the `messenger.sieve` experiment API.
 * Bytes cross the experiment boundary as plain number arrays (structured-clone
 * friendly). The privileged side (experiment/api.js) owns the real socket and
 * the TLS upgrade; this is just a thin bridge, so the core client is reused as-is.
 */
import type { Transport } from '../../core/managesieve/transport.js';

interface SieveApi {
  connect(host: string, port: number): Promise<number>;
  write(id: number, bytes: number[]): Promise<void>;
  read(id: number): Promise<number[] | null>;
  startTls(id: number): Promise<void>;
  close(id: number): Promise<void>;
}

function api(): SieveApi {
  const m = (globalThis as { messenger?: { sieve?: SieveApi } }).messenger;
  if (!m?.sieve) throw new Error('messenger.sieve experiment API is unavailable');
  return m.sieve;
}

export class ExperimentTransport implements Transport {
  private constructor(private readonly id: number) {}

  static async connect(host: string, port: number): Promise<ExperimentTransport> {
    return new ExperimentTransport(await api().connect(host, port));
  }

  async write(data: Uint8Array): Promise<void> {
    await api().write(this.id, Array.from(data));
  }

  async read(): Promise<Uint8Array | null> {
    const bytes = await api().read(this.id);
    return bytes === null ? null : Uint8Array.from(bytes);
  }

  async startTls(): Promise<void> {
    await api().startTls(this.id);
  }

  async close(): Promise<void> {
    await api().close(this.id);
  }
}
