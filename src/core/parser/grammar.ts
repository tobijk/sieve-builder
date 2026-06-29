/**
 * Generic Sieve grammar parser (RFC 5228 §8.2): turns tokens into a faithful
 * tree of commands and tests, with no knowledge of which commands/tests we
 * support. The lowering step (lower.ts) interprets that tree. Keeping the parse
 * general means a structurally-valid foreign script still parses; the lowering
 * decides what is representable.
 */
import type { Token, TokenType } from './lexer.js';

export interface AstStrings {
  kind: 'strings';
  value: string[];
}
export interface AstNumber {
  kind: 'number';
  value: number;
}
export interface AstTag {
  kind: 'tag';
  value: string;
}
export type AstArg = AstStrings | AstNumber | AstTag;

export interface AstTest {
  name: string;
  args: AstArg[];
  /** Sub-tests for allof/anyof (the list) and not (a single child). */
  tests: AstTest[];
  pos: number;
}

export interface AstCommand {
  name: string;
  args: AstArg[];
  test?: AstTest;
  block?: AstCommand[];
  pos: number;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export function parseTokens(tokens: Token[]): AstCommand[] {
  let p = 0;
  const peek = () => tokens[p]!;
  const advance = () => tokens[p++]!;
  const expect = (type: TokenType): Token => {
    const t = advance();
    if (t.type !== type) throw new ParseError(`expected ${type}, got ${t.type} ${JSON.stringify(t.value)}`);
    return t;
  };

  function parseStringList(): string[] {
    const out: string[] = [];
    if (peek().type === 'rbracket') {
      advance();
      return out;
    }
    for (;;) {
      out.push(expect('string').value);
      const t = advance();
      if (t.type === 'comma') continue;
      if (t.type === 'rbracket') break;
      throw new ParseError(`expected ',' or ']' in string list, got ${t.type}`);
    }
    return out;
  }

  function parseArgs(): AstArg[] {
    const args: AstArg[] = [];
    for (;;) {
      const t = peek();
      if (t.type === 'string') {
        advance();
        args.push({ kind: 'strings', value: [t.value] });
      } else if (t.type === 'number') {
        advance();
        args.push({ kind: 'number', value: t.num });
      } else if (t.type === 'tag') {
        advance();
        args.push({ kind: 'tag', value: t.value });
      } else if (t.type === 'lbracket') {
        advance();
        args.push({ kind: 'strings', value: parseStringList() });
      } else {
        break;
      }
    }
    return args;
  }

  function parseTest(): AstTest {
    const id = expect('ident');
    const { value: name, pos } = id;

    if (name === 'allof' || name === 'anyof') {
      expect('lparen');
      const tests: AstTest[] = [];
      if (peek().type !== 'rparen') {
        for (;;) {
          tests.push(parseTest());
          const t = advance();
          if (t.type === 'comma') continue;
          if (t.type === 'rparen') break;
          throw new ParseError(`expected ',' or ')' in test list, got ${t.type}`);
        }
      } else {
        advance();
      }
      return { name, args: [], tests, pos };
    }

    if (name === 'not') {
      return { name, args: [], tests: [parseTest()], pos };
    }

    return { name, args: parseArgs(), tests: [], pos };
  }

  function parseBlock(): AstCommand[] {
    expect('lbrace');
    const cmds: AstCommand[] = [];
    while (peek().type !== 'rbrace') {
      if (peek().type === 'eof') throw new ParseError('unterminated block');
      cmds.push(parseCommand());
    }
    advance();
    return cmds;
  }

  function parseCommand(): AstCommand {
    const id = expect('ident');
    const { value: name, pos } = id;

    if (name === 'if' || name === 'elsif') {
      const test = parseTest();
      return { name, args: [], test, block: parseBlock(), pos };
    }
    if (name === 'else') {
      return { name, args: [], block: parseBlock(), pos };
    }

    const args = parseArgs();
    expect('semicolon');
    return { name, args, pos };
  }

  const commands: AstCommand[] = [];
  while (peek().type !== 'eof') commands.push(parseCommand());
  return commands;
}
