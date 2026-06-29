import { concat } from './bytes.js';
import { ProtocolError } from './errors.js';
import type { Transport } from './transport.js';

const CR = 13;
const LF = 10;

/** A logical protocol line, with literal contents (`{n}`) spliced inline. */
export interface Line {
  /** The full line: text plus any inlined literal bytes. */
  bytes: Uint8Array;
  /** The first raw segment, decoded — enough to detect an OK/NO/BYE status. */
  head: string;
}

/** Matches a `{123}` / `{123+}` literal specifier anchored at end of a line. */
function literalSuffix(bytes: Uint8Array, decoder: TextDecoder): { n: number; specLen: number } | null {
  const tailLen = Math.min(bytes.length, 24);
  const tail = decoder.decode(bytes.subarray(bytes.length - tailLen));
  const match = /\{(\d+)\+?\}$/.exec(tail);
  if (!match) return null;
  return { n: Number(match[1]), specLen: match[0].length };
}

/**
 * Buffered reader over a {@link Transport}. Turns an arbitrary byte stream into
 * ManageSieve lines, resolving `{n}` literals (which may carry binary script
 * data containing CRLFs). Bounded line and literal sizes guard against a
 * hostile or buggy server exhausting memory.
 */
export class ByteReader {
  private buf: Uint8Array = new Uint8Array(0);
  private eof = false;
  private readonly decoder = new TextDecoder('utf-8');

  constructor(
    private readonly transport: Transport,
    private readonly maxLine = 64 * 1024,
    private readonly maxLiteral = 10 * 1024 * 1024,
  ) {}

  /** Bytes already read from the transport but not yet consumed. */
  bufferedBytes(): number {
    return this.buf.length;
  }

  private async fill(): Promise<void> {
    if (this.eof) throw new ProtocolError('connection closed by server');
    const chunk = await this.transport.read();
    if (!chunk || chunk.length === 0) {
      this.eof = true;
      throw new ProtocolError('connection closed by server');
    }
    this.buf = concat(this.buf, chunk);
  }

  /** Read exactly `n` bytes. */
  private async readExact(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) await this.fill();
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }

  /** Read up to and consume the next CRLF; return the bytes before it. */
  private async readRawLine(): Promise<Uint8Array> {
    let i = 1;
    for (;;) {
      for (; i < this.buf.length; i++) {
        if (this.buf[i] === LF && this.buf[i - 1] === CR) {
          const line = this.buf.slice(0, i - 1);
          this.buf = this.buf.slice(i + 1);
          return line;
        }
      }
      if (this.buf.length > this.maxLine) {
        throw new ProtocolError('response line exceeds maximum length');
      }
      i = Math.max(1, this.buf.length); // re-check the boundary byte for a split CRLF
      await this.fill();
    }
  }

  /** Read one logical line, splicing in any trailing `{n}` literal content. */
  async readLine(): Promise<Line> {
    const first = await this.readRawLine();
    let bytes = first;
    let raw = first;

    for (;;) {
      const lit = literalSuffix(raw, this.decoder);
      if (!lit) break;
      if (lit.n > this.maxLiteral) {
        throw new ProtocolError('literal exceeds maximum length');
      }
      const content = await this.readExact(lit.n);
      const continuation = await this.readRawLine();
      bytes = concat(bytes.slice(0, bytes.length - lit.specLen), content, continuation);
      raw = continuation;
    }

    return { bytes, head: this.decoder.decode(first) };
  }
}
