/**
 * Sieve string serialisation — the one chokepoint through which every
 * user-supplied value must pass before it lands in a script. Getting this
 * right is what prevents Sieve injection (a crafted mailbox name or header
 * value breaking out of its quotes and injecting commands).
 *
 * RFC 5228 §2.4.2:
 *   - A quoted-string may contain any octet except NUL; `\` and `"` are the
 *     only characters that must be escaped (`\x` for any other x is just `x`).
 *   - CR/LF inside a quoted-string is legal but unreadable, so for values that
 *     contain newlines we emit a multi-line literal (`text:` ... `.`) instead.
 */

/** Characters we refuse outright — they cannot be represented safely. */
function assertSafe(value: string): void {
  if (value.includes('\0')) {
    throw new Error('Sieve strings cannot contain a NUL byte');
  }
}

/** Serialise a single string as a Sieve quoted-string or multi-line literal. */
export function sieveString(value: string): string {
  assertSafe(value);
  if (/[\r\n]/.test(value)) return multiLine(value);
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** Serialise a list: a single value collapses to one quoted-string. */
export function sieveStringList(values: readonly string[]): string {
  if (values.length === 0) throw new Error('Sieve string list cannot be empty');
  if (values.length === 1) return sieveString(values[0]!);
  return `[${values.map(sieveString).join(', ')}]`;
}

/**
 * Multi-line literal with dot-stuffing (RFC 5228 §2.4.2.2). A line consisting
 * of a single "." terminates the literal, so any content line that begins with
 * "." is prefixed with an extra ".".
 */
function multiLine(value: string): string {
  const body = value
    .split(/\r\n|\r|\n/)
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
  return `text:\r\n${body}\r\n.\r\n`;
}
