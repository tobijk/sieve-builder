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

/**
 * Characters we refuse outright — they cannot be represented safely.
 *
 * Sieve scripts are UTF-8 (RFC 5228 §2.7.2), so any Unicode content is fine as
 * long as it encodes cleanly. JS strings are UTF-16, though, and can hold an
 * unpaired surrogate; that has no UTF-8 encoding (TextEncoder substitutes
 * U+FFFD), so we reject it rather than silently corrupt the script. NUL is
 * disallowed outright.
 */
function assertSafe(value: string): void {
  if (value.includes('\0')) {
    throw new Error('Sieve strings cannot contain a NUL byte');
  }
  // `for...of` iterates by code point: a valid surrogate pair yields one
  // code point above U+FFFF, so anything still in the surrogate range is lone.
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) {
      throw new Error('Sieve strings cannot contain an unpaired surrogate');
    }
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
