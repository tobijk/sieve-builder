/** Small immutable helpers for editing the model from UI event handlers. */
import type { Action, ConditionGroup, Rule, Test } from '../core/model/types.js';

export function uid(): string {
  return crypto.randomUUID();
}

export function newTest(): Test {
  // Default to case-sensitive matching (i;octet); see ui/condition.ts.
  return { type: 'header', fields: ['Subject'], match: 'contains', values: [''], comparator: 'i;octet' };
}

/** A fresh sub-group defaults to OR — the usual reason to nest inside an AND. */
export function newGroup(): ConditionGroup {
  return { type: 'group', match: 'any', children: [newTest()] };
}

export function newRule(): Rule {
  return {
    id: uid(),
    name: 'New rule',
    enabled: true,
    root: { type: 'group', match: 'all', children: [newTest()] },
    actions: [defaultAction('fileinto')],
  };
}

export function defaultAction(type: Action['type']): Action {
  switch (type) {
    case 'fileinto':
      return { type: 'fileinto', mailbox: '', create: true };
    case 'redirect':
      return { type: 'redirect', address: '' };
    case 'keep':
      return { type: 'keep' };
    case 'discard':
      return { type: 'discard' };
    case 'stop':
      return { type: 'stop' };
    case 'setflag':
    case 'addflag':
    case 'removeflag':
      return { type: 'addflag', flags: ['\\Seen'] };
    case 'vacation':
      return { type: 'vacation', reason: '', days: 7 };
  }
}

export function updateAt<T>(arr: readonly T[], index: number, value: T): T[] {
  const next = arr.slice();
  next[index] = value;
  return next;
}

export function removeAt<T>(arr: readonly T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}
