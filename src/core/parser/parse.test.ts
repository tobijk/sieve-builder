import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generate } from '../generator/generate.js';
import type { SieveModel } from '../model/types.js';
import { parseSieve } from './parse.js';

/** Models covering the supported surface; used for the round-trip property. */
const MODELS: Record<string, SieveModel> = {
  simple: {
    rules: [
      {
        id: 'a',
        name: 'Newsletters',
        enabled: true,
        root: {
          type: 'group',
          match: 'any',
          children: [
            { type: 'header', fields: ['List-Id'], match: 'contains', values: ['.list.'], comparator: 'i;octet' },
            { type: 'address', part: 'all', fields: ['From'], match: 'is', values: ['n@x'], comparator: 'i;ascii-casemap' },
          ],
        },
        actions: [
          { type: 'fileinto', mailbox: 'INBOX/News', create: true },
          { type: 'stop' },
        ],
      },
    ],
  },
  nested: {
    rules: [
      {
        id: 'a',
        name: 'Finance',
        enabled: true,
        root: {
          type: 'group',
          match: 'all',
          children: [
            { type: 'header', fields: ['Subject'], match: 'contains', values: ['statement'], comparator: 'i;octet' },
            {
              type: 'group',
              match: 'any',
              children: [
                { type: 'address', part: 'all', fields: ['From'], match: 'is', values: ['bank@x'], comparator: 'i;octet' },
                { type: 'address', part: 'all', fields: ['From'], match: 'is', values: ['broker@y'], comparator: 'i;octet' },
              ],
            },
          ],
        },
        actions: [{ type: 'keep' }],
      },
    ],
  },
  negatedGroup: {
    rules: [
      {
        id: 'a',
        name: 'Not bulk',
        enabled: true,
        root: {
          type: 'group',
          match: 'all',
          negate: true,
          children: [
            { type: 'exists', fields: ['X-Loop'] },
            { type: 'header', fields: ['Precedence'], match: 'is', values: ['bulk'], comparator: 'i;octet' },
          ],
        },
        actions: [{ type: 'discard' }],
      },
    ],
  },
  negatedLeaf: {
    rules: [
      {
        id: 'a',
        name: 'Not re',
        enabled: true,
        root: {
          type: 'group',
          match: 'all',
          children: [{ type: 'header', negate: true, fields: ['Subject'], match: 'matches', values: ['Re:*'], comparator: 'i;octet' }],
        },
        actions: [{ type: 'keep' }],
      },
    ],
  },
  richActions: {
    rules: [
      {
        id: 'a',
        name: 'Rich',
        enabled: true,
        root: {
          type: 'group',
          match: 'all',
          children: [
            { type: 'size', over: true, limit: 5_000_000 },
            { type: 'header', fields: ['X-Priority'], match: 'value', relation: 'le', comparator: 'i;ascii-numeric', values: ['2'] },
            { type: 'body', transform: 'text', match: 'contains', values: ['lottery'], comparator: 'i;octet' },
          ],
        },
        actions: [
          { type: 'fileinto', mailbox: 'Junk', create: true, copy: true },
          { type: 'addflag', flags: ['\\Seen', '\\Flagged'] },
          { type: 'redirect', copy: true, address: 'a@b' },
          { type: 'vacation', days: 7, subject: 'Away', addresses: ['me@x'], reason: 'On holiday\nback soon' },
        ],
      },
    ],
  },
  unconditional: {
    rules: [
      { id: 'a', name: 'Catch-all', enabled: true, root: { type: 'group', match: 'all', children: [] }, actions: [{ type: 'keep' }, { type: 'stop' }] },
    ],
  },
  disabled: {
    rules: [
      { id: 'a', name: 'Off', enabled: false, root: { type: 'group', match: 'all', children: [] }, actions: [] },
      { id: 'b', name: 'On', enabled: true, root: { type: 'group', match: 'all', children: [{ type: 'header', fields: ['Subject'], match: 'is', values: ['x'], comparator: 'i;octet' }] }, actions: [{ type: 'keep' }] },
    ],
  },
};

for (const [name, model] of Object.entries(MODELS)) {
  test(`round-trip: ${name}`, () => {
    const script = generate(model);
    const result = parseSieve(script);
    assert.ok(result.ok, `not fully recognized: ${JSON.stringify(result.issues)}`);
    // generate is a left inverse of parse on our own output.
    assert.equal(generate(result.model), script);
  });
}

test('preserves rule names, order, and enabled state', () => {
  const result = parseSieve(generate(MODELS.disabled!));
  assert.deepEqual(
    result.model.rules.map((r) => [r.name, r.enabled]),
    [['Off', false], ['On', true]],
  );
});

test('round-trips a rule name containing a bracket', () => {
  const model: SieveModel = {
    rules: [{ id: 'a', name: 'weird] name', enabled: true, root: { type: 'group', match: 'all', children: [{ type: 'header', fields: ['Subject'], match: 'is', values: ['x'], comparator: 'i;octet' }] }, actions: [{ type: 'keep' }] }],
  };
  const result = parseSieve(generate(model));
  assert.ok(result.ok);
  assert.equal(result.model.rules[0]!.name, 'weird] name');
});

test('parses a hand-written foreign script (no markers, no comparator)', () => {
  const result = parseSieve('require "fileinto";\nif header :contains "Subject" "sale" {\n  fileinto "Promotions";\n}\n');
  assert.ok(result.ok, JSON.stringify(result.issues));
  const rule = result.model.rules[0]!;
  assert.equal(rule.name, 'Rule');
  assert.equal(rule.root.children.length, 1);
  assert.deepEqual(rule.actions, [{ type: 'fileinto', mailbox: 'Promotions' }]);
});

test('size suffixes (K/M/G) are honoured', () => {
  const result = parseSieve('if size :over 2M { discard; }\n');
  assert.ok(result.ok);
  const test0 = result.model.rules[0]!.root.children[0]!;
  assert.deepEqual(test0, { type: 'size', over: true, limit: 2 * 1024 * 1024 });
});

test('an unsupported command degrades gracefully (ok=false)', () => {
  const result = parseSieve('if header :is "Subject" "x" {\n  notify "mailto:a@b";\n}\n');
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => /notify/.test(i.message)));
});

test('elsif is reported as unsupported, not silently dropped', () => {
  const result = parseSieve('if size :over 1 { keep; } elsif size :over 2 { discard; }\n');
  assert.equal(result.ok, false);
});

test('malformed input fails closed rather than throwing', () => {
  const result = parseSieve('if header :is "Subject" "x" {  keep; '); // missing }
  assert.equal(result.ok, false);
  assert.deepEqual(result.model, { rules: [] });
});

test('multi-line string values round-trip', () => {
  const model: SieveModel = {
    rules: [{ id: 'a', name: 'V', enabled: true, root: { type: 'group', match: 'all', children: [] }, actions: [{ type: 'vacation', reason: 'line one\nline two\n.dotted' }] }],
  };
  const result = parseSieve(generate(model));
  assert.ok(result.ok, JSON.stringify(result.issues));
  const action = result.model.rules[0]!.actions[0]!;
  assert.equal(action.type === 'vacation' && action.reason, 'line one\nline two\n.dotted');
});
