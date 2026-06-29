import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Test } from '../core/model/types.js';
import {
  CUSTOM,
  fieldKey,
  matchKey,
  sizeMB,
  textValue,
  withCustomName,
  withField,
  withMatch,
  withSizeMB,
  withText,
} from './condition.js';

const header: Test = { type: 'header', fields: ['Subject'], match: 'contains', values: ['hi'] };

test('reads a header test into control values', () => {
  assert.equal(fieldKey(header), 'Subject');
  assert.equal(matchKey(header), 'contains');
  assert.equal(textValue(header), 'hi');
});

test('switching to an address field preserves match and value', () => {
  const t = withField(header, 'From');
  assert.equal(t.type, 'address');
  assert.equal(fieldKey(t), 'From');
  assert.equal(matchKey(t), 'contains');
  assert.equal(textValue(t), 'hi');
});

test('negated operators round-trip through the model', () => {
  const t = withMatch(header, 'not-contains');
  assert.equal(t.type === 'header' && t.match, 'contains');
  assert.equal(t.type === 'header' && t.negate, true);
  assert.equal(matchKey(t), 'not-contains');
});

test('positive operators carry no negate flag', () => {
  const t = withMatch(header, 'regex');
  assert.equal('negate' in t, false);
  assert.equal(matchKey(t), 'regex');
});

test('custom headers report CUSTOM and keep their name', () => {
  const blank = withField(header, CUSTOM);
  assert.equal(fieldKey(blank), CUSTOM);
  const named = withCustomName(blank, 'X-Foo');
  assert.equal(fieldKey(named), CUSTOM);
  assert.equal(named.type === 'header' && named.fields[0], 'X-Foo');
});

test('size conversions are stable in MB', () => {
  const size = withField(header, 'Size');
  assert.equal(size.type, 'size');
  assert.equal(matchKey(size), 'over');
  assert.equal(sizeMB(size), 1);

  const bigger = withSizeMB(size, 5);
  assert.equal(sizeMB(bigger), 5);
  assert.equal(matchKey(withMatch(bigger, 'under')), 'under');
});

test('withText updates only the value', () => {
  const t = withText(header, 'changed');
  assert.equal(textValue(t), 'changed');
  assert.equal(fieldKey(t), 'Subject');
});
