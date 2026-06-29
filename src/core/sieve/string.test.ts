import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sieveString, sieveStringList } from './string.js';

test('plain strings are quoted', () => {
  assert.equal(sieveString('hello'), '"hello"');
});

test('quotes and backslashes are escaped', () => {
  assert.equal(sieveString('a"b\\c'), '"a\\"b\\\\c"');
});

test('a value cannot break out of its quotes', () => {
  // The closing quote is escaped, so the trailing tokens stay data.
  assert.equal(sieveString('"; discard;'), '"\\"; discard;"');
});

test('NUL bytes are rejected', () => {
  assert.throws(() => sieveString('a\0b'), /NUL/);
});

test('valid Unicode, including astral characters, is allowed verbatim', () => {
  assert.equal(sieveString('Müller café 😈'), '"Müller café 😈"');
});

test('unpaired surrogates are rejected (would be invalid UTF-8)', () => {
  assert.throws(() => sieveString('a\uD800b'), /surrogate/);
  assert.throws(() => sieveString('\uDC00'), /surrogate/);
});

test('newlines switch to a dot-stuffed multi-line literal', () => {
  const out = sieveString('line1\n.line2');
  assert.equal(out, 'text:\r\nline1\r\n..line2\r\n.\r\n');
});

test('single-element lists collapse to one string', () => {
  assert.equal(sieveStringList(['only']), '"only"');
});

test('multi-element lists use bracket syntax', () => {
  assert.equal(sieveStringList(['a', 'b']), '["a", "b"]');
});

test('empty lists are rejected', () => {
  assert.throws(() => sieveStringList([]), /empty/);
});
