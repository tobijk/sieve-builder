/**
 * Sieve lexer (RFC 5228 §8.1). Produces a token stream plus the `# rule:[name]`
 * metadata comments (with source positions) that let the lowering step recover
 * rule names and disabled state. Ordinary comments and whitespace are skipped.
 */

export type TokenType =
  | 'ident'
  | 'tag'
  | 'number'
  | 'string'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'semicolon'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  /** Numeric value for `number` tokens (with K/M/G applied); 0 otherwise. */
  num: number;
  pos: number;
}

export interface Marker {
  name: string;
  disabled: boolean;
  pos: number;
}

export interface LexResult {
  tokens: Token[];
  markers: Marker[];
}

export class LexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LexError';
  }
}

// `(.*)` is greedy so a name containing `]` keeps everything up to the last `]`.
const RULE_MARKER = /^#\s*rule:\[(.*)\](?:\s*\(disabled\))?\s*$/;
const DISABLED = /\(disabled\)\s*$/;

const PUNCT: Record<string, TokenType> = {
  '(': 'lparen',
  ')': 'rparen',
  '{': 'lbrace',
  '}': 'rbrace',
  '[': 'lbracket',
  ']': 'rbracket',
  ',': 'comma',
  ';': 'semicolon',
};

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

export function lex(src: string): LexResult {
  const tokens: Token[] = [];
  const markers: Marker[] = [];
  const n = src.length;
  let i = 0;

  // Read from j to end of line; return the line text and the index past the EOL.
  function readLine(j: number): { line: string; next: number } {
    let k = j;
    while (k < n && src[k] !== '\n' && src[k] !== '\r') k++;
    const line = src.slice(j, k);
    if (k < n && src[k] === '\r') k++;
    if (k < n && src[k] === '\n') k++;
    return { line, next: k };
  }

  while (i < n) {
    const c = src[i]!;

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++;
      continue;
    }

    if (c === '#') {
      const { line, next } = readLine(i);
      const m = RULE_MARKER.exec(line);
      if (m) markers.push({ name: m[1] ?? '', disabled: DISABLED.test(line), pos: i });
      i = next;
      continue;
    }

    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      if (i >= n) throw new LexError('unterminated bracket comment');
      i += 2;
      continue;
    }

    if (c === '"') {
      const start = i;
      i++;
      let s = '';
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\') {
          i++;
          s += src[i] ?? '';
          i++;
        } else if (src[i] === '\r' || src[i] === '\n') {
          throw new LexError('newline inside quoted string');
        } else {
          s += src[i];
          i++;
        }
      }
      if (i >= n) throw new LexError('unterminated quoted string');
      i++;
      tokens.push({ type: 'string', value: s, num: 0, pos: start });
      continue;
    }

    if (c === ':') {
      const start = i;
      i++;
      let name = '';
      while (i < n && isIdent(src[i]!)) {
        name += src[i];
        i++;
      }
      if (name === '') throw new LexError('empty tag');
      tokens.push({ type: 'tag', value: name, num: 0, pos: start });
      continue;
    }

    if (isDigit(c)) {
      const start = i;
      let digits = '';
      while (i < n && isDigit(src[i]!)) {
        digits += src[i];
        i++;
      }
      let mult = 1;
      const q = src[i];
      if (q === 'K' || q === 'k') (mult = 1024), i++;
      else if (q === 'M' || q === 'm') (mult = 1024 * 1024), i++;
      else if (q === 'G' || q === 'g') (mult = 1024 * 1024 * 1024), i++;
      tokens.push({ type: 'number', value: digits, num: Number(digits) * mult, pos: start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      let name = '';
      while (i < n && isIdent(src[i]!)) {
        name += src[i];
        i++;
      }

      // Multi-line string literal: `text:` <rest of line> CRLF ... CRLF "." CRLF
      if (name === 'text' && src[i] === ':') {
        i = readLine(i + 1).next; // skip ':' and the remainder of the line
        const lines: string[] = [];
        for (;;) {
          if (i >= n) throw new LexError('unterminated multi-line string');
          const r = readLine(i);
          i = r.next;
          if (r.line === '.') break;
          lines.push(r.line.startsWith('.') ? r.line.slice(1) : r.line); // de-dot-stuff
        }
        tokens.push({ type: 'string', value: lines.join('\n'), num: 0, pos: start });
        continue;
      }

      tokens.push({ type: 'ident', value: name, num: 0, pos: start });
      continue;
    }

    const punct = PUNCT[c];
    if (punct) {
      tokens.push({ type: punct, value: c, num: 0, pos: i });
      i++;
      continue;
    }

    throw new LexError(`unexpected character ${JSON.stringify(c)} at offset ${i}`);
  }

  tokens.push({ type: 'eof', value: '', num: 0, pos: n });
  return { tokens, markers };
}
