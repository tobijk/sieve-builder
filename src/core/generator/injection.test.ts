import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SieveModel } from '../model/types.js';
import { generate } from './generate.js';
import { compileSieve, hasSievec } from './sievec.js';
import { sieveString } from '../sieve/string.js';

const sievecSkip = hasSievec() ? false : 'sievec not installed (apt install dovecot-sieve)';

/** Strings crafted to break out of quotes, comments, or literals. */
const PAYLOADS = [
  '"; discard; #',
  '\n discard;',
  '\r\nif true { fileinto "Trap"; }',
  'a"b\\c',
  '*/ stop; /*',
  '${evil}',
  'oops] if true { discard; } #',
  'text:\r\nfoo\r\n.\r\nstop;',
  '.\n.\n.',
  "'; keep; '",
  'üñîçødé 😈',
];

/**
 * Reduce a script to its structural skeleton: string literals, comments and
 * numbers replaced by placeholders. Two models that differ only in field
 * *contents* must produce identical skeletons — otherwise a value injected
 * structure (a new command, test, or block), which is the failure we guard against.
 */
function skeleton(script: string): string {
  return script
    .replace(/text:\r?\n[\s\S]*?\r?\n\.\r?\n/g, 'S') // multi-line literals
    .replace(/"(?:\\.|[^"\\\n])*"/g, 'S') // quoted strings (single-line; escapes respected)
    .replace(/#[^\n]*/g, '') // comments
    .replace(/\b\d+\b/g, 'N') // numbers
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same rule shape every time; only the string/number fillers vary. */
function buildModel(fill: string, num: number): SieveModel {
  return {
    rules: [
      {
        id: 'r1',
        name: fill,
        enabled: true,
        root: {
          type: 'group',
          match: 'all',
          children: [
            { type: 'header', fields: [fill], match: 'contains', values: [fill] },
            { type: 'address', part: 'all', fields: ['From'], match: 'is', values: [fill] },
            { type: 'envelope', fields: ['from'], match: 'matches', values: [fill] },
            { type: 'exists', fields: [fill] },
            { type: 'size', over: true, limit: num },
            { type: 'body', transform: 'text', match: 'contains', values: [fill] },
            {
              type: 'group',
              match: 'any',
              children: [{ type: 'header', fields: ['X-Test'], match: 'contains', values: [fill] }],
            },
          ],
        },
        actions: [
          { type: 'fileinto', mailbox: fill, create: true },
          { type: 'addflag', flags: [fill] },
          { type: 'vacation', reason: fill, subject: fill, handle: fill, days: num },
          { type: 'keep' },
        ],
      },
    ],
  };
}

const BASELINE = skeleton(generate(buildModel('safe', 42)));

for (const payload of PAYLOADS) {
  const label = JSON.stringify(payload);

  test(`payload ${label} cannot alter script structure`, () => {
    const out = generate(buildModel(payload, NaN));
    assert.equal(
      skeleton(out),
      BASELINE,
      `payload escaped its quoting/comment context:\n${out}`,
    );
  });

  test(`payload ${label} still compiles`, { skip: sievecSkip }, () => {
    const result = compileSieve(generate(buildModel(payload, NaN)));
    assert.ok(result.ok, `sievec rejected the script:\n${result.stderr}`);
  });
}

test('a CR/LF in a rule name cannot escape its comment', () => {
  const out = generate({
    rules: [
      {
        id: 'c',
        name: 'evil\nif true { discard; }',
        enabled: true,
        root: {
          type: 'group',
          match: 'all',
          children: [{ type: 'header', fields: ['Subject'], match: 'is', values: ['x'] }],
        },
        actions: [{ type: 'keep' }],
      },
    ],
  });
  // The newline is folded to a space; the payload stays on the comment line.
  assert.match(out, /# rule:\[evil if true \{ discard; \}\]/);
  // No live line begins with the injected statement.
  assert.doesNotMatch(out, /^\s*if true \{ discard; \}/m);
});

test('numbers are coerced to safe integers', () => {
  const cases: Array<[number, RegExp]> = [
    [NaN, /size :over 0\b/],
    [-7, /size :over 0\b/],
    [1.9, /size :over 1\b/],
    [Infinity, /size :over 0\b/],
  ];
  for (const [limit, expected] of cases) {
    const out = generate({
      rules: [
        {
          id: 'n',
          name: 'n',
          enabled: true,
          root: { type: 'group', match: 'all', children: [{ type: 'size', over: true, limit }] },
          actions: [{ type: 'keep' }],
        },
      ],
    });
    assert.match(out, expected);
  }
});

test('NUL bytes are refused rather than silently mangled', () => {
  assert.throws(() => sieveString('a\0b'), /NUL/);
});
