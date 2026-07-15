import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generate } from '../core/generator/generate.js';
import type { Rule } from '../core/model/types.js';
import { parseSieve } from '../core/parser/parse.js';
import { DEFAULT_DAYS, isOooRule, readOoo, writeOoo } from './ooo.js';

const fresh = () => readOoo(null);

test('an empty card maps to no rule at all', () => {
  assert.equal(writeOoo(null, fresh()), null);
});

test('enabling creates a responder rule that reads back identically', () => {
  const rule = writeOoo(null, {
    ...fresh(),
    enabled: true,
    subject: 'Out of office',
    message: 'Back on July 28.',
    from: '2026-07-20',
    until: '2026-07-28',
  });
  assert.ok(rule);
  assert.ok(isOooRule(rule));
  assert.deepEqual(readOoo(rule), {
    enabled: true,
    subject: 'Out of office',
    message: 'Back on July 28.',
    days: DEFAULT_DAYS,
    from: '2026-07-20',
    until: '2026-07-28',
  });
});

test('the responder survives a generate/parse round-trip as the same shape', () => {
  const rule = writeOoo(null, { ...fresh(), enabled: true, message: 'Away.', until: '2026-08-01' })!;
  const result = parseSieve(generate({ rules: [rule] }));
  assert.ok(result.ok, JSON.stringify(result.issues));
  const back = result.model.rules[0]!;
  assert.ok(isOooRule(back));
  assert.deepEqual(readOoo(back), readOoo(rule));
});

test('switching off keeps the rule (disabled) while a message remains', () => {
  const on = writeOoo(null, { ...fresh(), enabled: true, message: 'Away.' })!;
  const off = writeOoo(on, { ...readOoo(on), enabled: false });
  assert.ok(off);
  assert.equal(off.enabled, false);
  assert.equal(off.id, on.id);
});

test('clearing everything while off removes the rule', () => {
  const on = writeOoo(null, { ...fresh(), enabled: true, message: 'Away.' })!;
  assert.equal(writeOoo(on, { ...fresh() }), null);
});

test('vacation extras the card does not edit are preserved', () => {
  const prev = writeOoo(null, { ...fresh(), enabled: true, message: 'Away.' })!;
  const vacation = prev.actions[0]!;
  assert.ok(vacation.type === 'vacation');
  prev.actions[0] = { ...vacation, addresses: ['me@example.com'], handle: 'ooo' };

  const next = writeOoo(prev, { ...readOoo(prev), message: 'Changed.' })!;
  const v = next.actions[0]!;
  assert.ok(v.type === 'vacation');
  assert.deepEqual(v.addresses, ['me@example.com']);
  assert.equal(v.handle, 'ooo');
  assert.equal(v.reason, 'Changed.');
});

test('days are clamped to a sane minimum', () => {
  const rule = writeOoo(null, { ...fresh(), enabled: true, message: 'Away.', days: 0 })!;
  const v = rule.actions[0]!;
  assert.equal(v.type === 'vacation' && v.days, 1);
});

const base: Rule = writeOoo(null, { ...fresh(), enabled: true, message: 'Away.', from: '2026-07-20' })!;

test('richer rules are not mistaken for the responder', () => {
  // A second action, a non-window condition, an anyof root, or a negated
  // bound each disqualify the rule — it must stay a generic rule card.
  assert.ok(isOooRule(base));
  assert.ok(!isOooRule({ ...base, actions: [...base.actions, { type: 'stop' }] }));
  assert.ok(
    !isOooRule({
      ...base,
      root: {
        type: 'group',
        match: 'all',
        children: [{ type: 'header', fields: ['From'], match: 'contains', values: ['@work'] }],
      },
    }),
  );
  assert.ok(!isOooRule({ ...base, root: { ...base.root, match: 'any' } }));
  assert.ok(
    !isOooRule({
      ...base,
      root: {
        type: 'group',
        match: 'all',
        children: [
          { type: 'currentdate', datePart: 'date', match: 'value', relation: 'ge', values: ['2026-07-20'], negate: true },
        ],
      },
    }),
  );
});
