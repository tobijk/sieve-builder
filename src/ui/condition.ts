/**
 * Maps between the typed `Test` model and the friendly controls shown in a
 * condition row (a field, a match operator, a value). This keeps the model
 * precise while the UI stays approachable. All conversions are pure.
 */
import type { Comparator, MatchType, Test } from '../core/model/types.js';

/**
 * Case-sensitivity is a UI-layer policy. New text conditions default to the
 * `i;octet` comparator (case-sensitive); the alternative is `i;ascii-casemap`
 * (case-insensitive, Sieve's own default). The core generator stays neutral and
 * only emits a comparator when the model specifies one.
 */
const SENSITIVE: Comparator = 'i;octet';
const INSENSITIVE: Comparator = 'i;ascii-casemap';

export const ADDRESS_FIELDS = ['From', 'To', 'Cc', 'Reply-To', 'Sender'];
const HEADER_FIELDS = ['Subject', 'List-Id'];
export const CUSTOM = '__custom__';

/** Options for the field dropdown, in display order. */
export const FIELD_OPTIONS = [...ADDRESS_FIELDS, ...HEADER_FIELDS, 'Size', 'Date', 'Body'];

export type MatchKey =
  | 'contains'
  | 'not-contains'
  | 'is'
  | 'not-is'
  | 'matches'
  | 'regex'
  | 'over'
  | 'under'
  | 'on-or-after'
  | 'on-or-before';

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

/** "Date" is the delivery date (Sieve currentdate, evaluated when mail arrives). */
export const DATE_MATCHES: ReadonlyArray<{ key: MatchKey; label: string }> = [
  { key: 'on-or-after', label: 'is on or after' },
  { key: 'on-or-before', label: 'is on or before' },
  { key: 'is', label: 'is exactly' },
];

const MB = 1024 * 1024;

// --- Reads ------------------------------------------------------------------

/** The dropdown value for a test's field (CUSTOM for non-standard headers). */
export function fieldKey(test: Test): string {
  if (test.type === 'size') return 'Size';
  if (test.type === 'body') return 'Body';
  if (test.type === 'currentdate') return 'Date';
  const name = test.fields[0] ?? 'Subject';
  return FIELD_OPTIONS.includes(name) ? name : CUSTOM;
}

export function customName(test: Test): string {
  if (!('fields' in test)) return '';
  return test.fields[0] ?? '';
}

export function matchKey(test: Test): MatchKey {
  if (test.type === 'size') return test.over ? 'over' : 'under';
  if (test.type === 'currentdate') {
    if (test.match === 'value' && test.relation === 'ge') return 'on-or-after';
    if (test.match === 'value' && test.relation === 'le') return 'on-or-before';
    return 'is';
  }
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
  if (test.type === 'size') return SIZE_MATCHES;
  if (test.type === 'currentdate') return DATE_MATCHES;
  return TEXT_MATCHES;
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

/** The comparator carried by a test, defaulting to case-sensitive. */
function comparatorOf(test: Test): Comparator {
  return 'comparator' in test && test.comparator ? test.comparator : SENSITIVE;
}

function makeTextTest(
  field: string,
  key: MatchKey,
  value: string,
  comparator: Comparator = SENSITIVE,
): Test {
  const { match, negate } = decode(key);
  const common = { match, values: [value], comparator, ...(negate && { negate }) };
  if (field === 'Body') return { type: 'body', transform: 'text', ...common };
  if (ADDRESS_FIELDS.includes(field)) return { type: 'address', part: 'all', fields: [field], ...common };
  return { type: 'header', fields: [field], ...common };
}

/** A date test for the given match key; `is` compares the exact day. */
function makeDateTest(key: MatchKey, value: string): Test {
  const relation = key === 'on-or-after' ? 'ge' : key === 'on-or-before' ? 'le' : null;
  return relation
    ? { type: 'currentdate', datePart: 'date', match: 'value', relation, values: [value] }
    : { type: 'currentdate', datePart: 'date', match: 'is', values: [value] };
}

export function withField(test: Test, field: string): Test {
  if (field === 'Size') return { type: 'size', over: true, limit: MB };
  if (field === 'Date') return makeDateTest('on-or-after', '');
  const value = textValue(test);
  const key = matchKey(test);
  const textKey: MatchKey =
    key === 'over' || key === 'under' || key === 'on-or-after' || key === 'on-or-before'
      ? 'contains'
      : key;
  return makeTextTest(field === CUSTOM ? '' : field, textKey, value, comparatorOf(test));
}

export function withMatch(test: Test, key: MatchKey): Test {
  if (test.type === 'size') return { ...test, over: key === 'over' };
  if (test.type === 'currentdate') return makeDateTest(key, textValue(test));
  const field = fieldKey(test) === CUSTOM ? customName(test) : fieldKey(test);
  return makeTextTest(field, key, textValue(test), comparatorOf(test));
}

/** Case sensitivity only applies to text tests; size and date have no comparator. */
export function hasCaseToggle(test: Test): boolean {
  return test.type !== 'size' && test.type !== 'currentdate';
}

export function isCaseSensitive(test: Test): boolean {
  return comparatorOf(test) === SENSITIVE;
}

export function withCaseSensitive(test: Test, sensitive: boolean): Test {
  switch (test.type) {
    case 'header':
    case 'address':
    case 'envelope':
    case 'body':
      return { ...test, comparator: sensitive ? SENSITIVE : INSENSITIVE };
    default:
      return test;
  }
}

export function withCustomName(test: Test, name: string): Test {
  if (!('fields' in test)) return test;
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
