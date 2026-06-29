/**
 * ManageSieve wire encoding/decoding helpers (RFC 5804). Pure string/byte
 * functions, no I/O — so they are trivially testable and shared by the client.
 */

export interface StatusLine {
  ok: boolean;
  status: 'OK' | 'NO' | 'BYE';
  code?: string;
  message?: string;
}

/** Encode a ManageSieve quoted-string (escaping `\` and `"`). */
export function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Decode a quoted-string, or return the input unchanged if it isn't quoted. */
function unquote(value: string): string {
  if (!value.startsWith('"')) return value;
  let out = '';
  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\') {
      i++;
      out += value[i] ?? '';
    } else if (ch === '"') {
      break;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Extract the sequence of quoted-string tokens from a line. */
function quotedTokens(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    let token = '';
    for (i++; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\') {
        i++;
        token += text[i] ?? '';
      } else if (ch === '"') {
        break;
      } else {
        token += ch;
      }
    }
    out.push(token);
  }
  return out;
}

/** True if a line's head begins a status response. */
export function isStatusHead(head: string): boolean {
  return /^(OK|NO|BYE)(\s|$)/.test(head);
}

/** Parse an OK/NO/BYE status line: `NO (QUOTA/MAXSCRIPTS) "message"`. */
export function parseStatus(text: string): StatusLine | null {
  const match = /^(OK|NO|BYE)\b/.exec(text);
  if (!match) return null;
  const status = match[1] as StatusLine['status'];
  let rest = text.slice(match[0].length).trimStart();

  let code: string | undefined;
  if (rest.startsWith('(')) {
    const end = rest.indexOf(')');
    if (end >= 0) {
      code = rest.slice(1, end);
      rest = rest.slice(end + 1).trimStart();
    }
  }

  const result: StatusLine = { ok: status === 'OK', status };
  if (code !== undefined) result.code = code;
  if (rest.length > 0) result.message = unquote(rest);
  return result;
}

/** Parse a capability line: `"NAME" "value"` (value optional). */
export function parseCapability(text: string): { name: string; value: string } | null {
  const tokens = quotedTokens(text);
  if (tokens.length === 0) return null;
  return { name: tokens[0]!.toUpperCase(), value: tokens[1] ?? '' };
}

/** Parse a LISTSCRIPTS line: `"name"` optionally followed by `ACTIVE`. */
export function parseListLine(text: string): { name: string; active: boolean } | null {
  const match = /^"((?:\\.|[^"\\])*)"\s*(ACTIVE)?\s*$/.exec(text);
  if (!match) return null;
  return { name: unquote(`"${match[1]}"`), active: match[2] === 'ACTIVE' };
}

/** Base64-encode bytes (works in browser, extension, and Node via global btoa). */
export function base64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode a base64 string to bytes. */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
