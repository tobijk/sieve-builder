import type { StatusLine } from './protocol.js';

/** A wire/framing-level failure (closed connection, oversized data, garbage). */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

/** A NO/BYE response from the server. Carries the response code, if any. */
export class ManageSieveError extends Error {
  readonly status: 'NO' | 'BYE';
  readonly code: string | undefined;

  constructor(status: StatusLine) {
    const parts: string[] = [status.status];
    if (status.code) parts.push(`(${status.code})`);
    if (status.message) parts.push(status.message);
    super(parts.join(' '));
    this.name = 'ManageSieveError';
    this.status = status.status === 'BYE' ? 'BYE' : 'NO';
    this.code = status.code;
  }
}
