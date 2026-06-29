import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Rule, SieveModel } from './types.js';
import { validateModel } from './validate.js';

function model(rule: Partial<Rule>): SieveModel {
  return {
    rules: [
      {
        id: 'r1',
        name: 'R',
        enabled: true,
        root: { type: 'group', match: 'all', children: [] },
        actions: [],
        ...rule,
      },
    ],
  };
}

test('a fully-filled rule has no problems', () => {
  const m = model({
    root: {
      type: 'group',
      match: 'all',
      children: [{ type: 'header', fields: ['Subject'], match: 'contains', values: ['x'], comparator: 'i;octet' }],
    },
    actions: [{ type: 'fileinto', mailbox: 'INBOX/X' }],
  });
  assert.deepEqual(validateModel(m), []);
});

test('flags an empty condition value', () => {
  const m = model({
    root: {
      type: 'group',
      match: 'all',
      children: [{ type: 'header', fields: ['Subject'], match: 'contains', values: ['  '] }],
    },
    actions: [{ type: 'keep' }],
  });
  assert.equal(validateModel(m).length, 1);
  assert.match(validateModel(m)[0]!.message, /empty value/);
});

test('flags an empty file-into folder and empty custom header', () => {
  const m = model({
    root: {
      type: 'group',
      match: 'all',
      children: [{ type: 'header', fields: [''], match: 'is', values: ['x'] }],
    },
    actions: [{ type: 'fileinto', mailbox: '' }],
  });
  const problems = validateModel(m);
  assert.equal(problems.length, 2);
});

test('flags a nested-group condition too', () => {
  const m = model({
    root: {
      type: 'group',
      match: 'all',
      children: [
        { type: 'group', match: 'any', children: [{ type: 'address', part: 'all', fields: ['From'], match: 'is', values: [''] }] },
      ],
    },
    actions: [{ type: 'keep' }],
  });
  assert.equal(validateModel(m).length, 1);
});

test('disabled rules are not validated', () => {
  const m = model({
    enabled: false,
    actions: [{ type: 'fileinto', mailbox: '' }],
  });
  assert.deepEqual(validateModel(m), []);
});
