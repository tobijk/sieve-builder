import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generate } from './generator/generate.js';
import type { SieveModel } from './model/types.js';
import { parseSieve } from './parser/parse.js';
import { parseScriptVersion } from './script-version.js';

const model: SieveModel = {
  rules: [
    {
      id: 'a',
      name: 'R',
      enabled: true,
      root: { type: 'group', match: 'all', children: [{ type: 'header', fields: ['Subject'], match: 'is', values: ['x'], comparator: 'i;octet' }] },
      actions: [{ type: 'keep' }],
    },
  ],
};

test('no version comment unless requested', () => {
  assert.equal(parseScriptVersion(generate(model)), null);
});

test('a requested version is stamped and parsed back', () => {
  const script = generate(model, { version: 7 });
  assert.match(script, /^# sieve-builder-version: 7$/m);
  assert.equal(parseScriptVersion(script), 7);
});

test('the version comment does not disturb rule parsing', () => {
  const result = parseSieve(generate(model, { version: 2 }));
  assert.ok(result.ok);
  assert.equal(result.model.rules.length, 1);
  assert.equal(result.model.rules[0]!.name, 'R');
});

test('parseScriptVersion ignores unrelated comments', () => {
  assert.equal(parseScriptVersion('# just a comment\nkeep;\n'), null);
});
