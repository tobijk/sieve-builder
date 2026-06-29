import type { ParseResult } from '../core/parser/parse.js';

export interface ParseSummary {
  kind: 'ok' | 'warn';
  ruleCount: number;
  /** A one-line, human-readable summary suitable for a status line. */
  text: string;
}

const plural = (n: number) => (n === 1 ? '' : 's');

/** Consistent wording for a parse outcome, shared by Import and the server panel. */
export function summarizeParse(result: ParseResult): ParseSummary {
  const ruleCount = result.model.rules.length;
  if (result.ok) {
    return { kind: 'ok', ruleCount, text: `${ruleCount} rule${plural(ruleCount)} recognized.` };
  }
  const dropped = result.issues.length;
  return {
    kind: 'warn',
    ruleCount,
    text: `${ruleCount} rule${plural(ruleCount)} recognized; ${dropped} part${plural(dropped)} weren’t editable and were dropped.`,
  };
}
