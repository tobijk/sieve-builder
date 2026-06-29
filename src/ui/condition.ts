/**
 * Maps between the typed `Test` model and the friendly controls shown in a
 * condition row (a field, a match operator, a value). This keeps the model
 * precise while the UI stays approachable. All conversions are pure.
 */
import type { MatchType, Test } from '../core/model/types.js';

export const ADDRESS_FIELDS = ['From', 'To', 'Cc', 'Reply-To', 'Sender'];
const HEADER_FIELDS = ['Subject', 'List-Id'];
export const CUSTOM = '__custom__';

/** Options for the field dropdown, in display order. */
export const FIELD_OPTIONS = [...ADDRESS_FIELDS, ...HEADER_FIELDS, 'Size', 'Body'];

export type MatchKey =
  | 'contains'
  | 'not-contains'
  | 'is'
  | 'not-is'
  | 'matches'
  | 'regex'
  | 'over'
  | 'under';

export const TEXT_MATCHES: ReadonlyArray<{ key: MatchKey; label: string }> = [
  { key: 'contains', label: 'contains' },
  { key: 'not-contains', label: 'does not contain' },
  { key: 'is', label: 'is exactly' },
  { key: 'not-is', label: 'is not' },
  { key: 'matches', label: 'matches (wildcards)' },
  { key: 'regex', label: 'matches regex' },
];

export const SIZE_MATCHES: ReadonlyArray<{ key: MatchKey; label: string }> = [
  { key: 'over', label: 'is larger than' },
  { key: 'under', label: 'is smaller than' },
];

const MB = 1024 * 1024;

// --- Reads ------------------------------------------------------------------

/** The dropdown value for a test's field (CUSTOM for non-standard headers). */
export function fieldKey(test: Test): string {
  if (test.type === 'size') return 'Size';
  if (test.type === 'body') return 'Body';
  const name = test.fields[0] ?? 'Subject';
  return FIELD_OPTIONS.includes(name) ? name : CUSTOM;
}

export function customName(test: Test): string {
  if (test.type === 'size' || test.type === 'body') return '';
  return test.fields[0] ?? '';
}

export function matchKey(test: Test): MatchKey {
  if (test.type === 'size') return test.over ? 'over' : 'under';
  if (!('match' in test)) return 'contains';
  const negate = 'negate' in test && test.negate === true;
  switch (test.match) {
    case 'is':
      return negate ? 'not-is' : 'is';
    case 'contains':
      return negate ? 'not-contains' : 'contains';
    case 'matches':
      return 'matches';
    case 'regex':
      return 'regex';
    default:
      return 'contains';
  }
}

export function matchOptions(test: Test): ReadonlyArray<{ key: MatchKey; label: string }> {
  return test.type === 'size' ? SIZE_MATCHES : TEXT_MATCHES;
}

export function textValue(test: Test): string {
  return 'values' in test ? (test.values[0] ?? '') : '';
}

export function sizeMB(test: Test): number {
  return test.type === 'size' ? Math.round((test.limit / MB) * 100) / 100 : 0;
}

// --- Writes -----------------------------------------------------------------

function decode(key: MatchKey): { match: MatchType; negate: boolean } {
  switch (key) {
    case 'is':
      return { match: 'is', negate: false };
    case 'not-is':
      return { match: 'is', negate: true };
    case 'not-contains':
      return { match: 'contains', negate: true };
    case 'matches':
      return { match: 'matches', negate: false };
    case 'regex':
      return { match: 'regex', negate: false };
    default:
      return { match: 'contains', negate: false };
  }
}

function makeTextTest(field: string, key: MatchKey, value: string): Test {
  const { match, negate } = decode(key);
  if (field === 'Body') {
    return { type: 'body', transform: 'text', match, values: [value], ...(negate && { negate }) };
  }
  if (ADDRESS_FIELDS.includes(field)) {
    return { type: 'address', part: 'all', fields: [field], match, values: [value], ...(negate && { negate }) };
  }
  return { type: 'header', fields: [field], match, values: [value], ...(negate && { negate }) };
}

export function withField(test: Test, field: string): Test {
  if (field === 'Size') return { type: 'size', over: true, limit: MB };
  const value = textValue(test);
  const key = matchKey(test);
  const textKey: MatchKey = key === 'over' || key === 'under' ? 'contains' : key;
  return makeTextTest(field === CUSTOM ? '' : field, textKey, value);
}

export function withMatch(test: Test, key: MatchKey): Test {
  if (test.type === 'size') return { ...test, over: key === 'over' };
  const field = fieldKey(test) === CUSTOM ? customName(test) : fieldKey(test);
  return makeTextTest(field, key, textValue(test));
}

export function withCustomName(test: Test, name: string): Test {
  if (test.type === 'size' || test.type === 'body') return test;
  return { ...test, fields: [name] };
}

export function withText(test: Test, value: string): Test {
  if (!('values' in test)) return test;
  return { ...test, values: [value] };
}

export function withSizeMB(test: Test, mb: number): Test {
  if (test.type !== 'size') return test;
  return { ...test, limit: Math.max(0, Math.round(mb * MB)) };
}
