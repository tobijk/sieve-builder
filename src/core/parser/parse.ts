/**
 * Top-level parse entry point: Sieve text -> rule model.
 *
 * `ok` is true only when the entire script maps cleanly to our model — meaning
 * it is safe to edit visually and regenerate. When false, `issues` explains
 * what wasn't recognized and the caller should preserve the original script
 * rather than overwrite it from a partial model.
 */
import type { SieveModel } from '../model/types.js';
import { parseTokens } from './grammar.js';
import { lex } from './lexer.js';
import { lower, type ParseIssue } from './lower.js';

export interface ParseResult {
  model: SieveModel;
  ok: boolean;
  issues: ParseIssue[];
}

export function parseSieve(text: string): ParseResult {
  try {
    const { tokens, markers } = lex(text);
    const commands = parseTokens(tokens);
    const { model, issues } = lower(commands, markers);
    return { model, ok: issues.length === 0, issues };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { model: { rules: [] }, ok: false, issues: [{ message }] };
  }
}
