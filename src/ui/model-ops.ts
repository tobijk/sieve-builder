/** Small immutable helpers for editing the model from UI event handlers. */
import type { Action, Rule } from '../core/model/types.js';

export function uid(): string {
  return crypto.randomUUID();
}

export function newRule(): Rule {
  return {
    id: uid(),
    name: 'New rule',
    enabled: true,
    match: 'all',
    tests: [{ type: 'header', fields: ['Subject'], match: 'contains', values: [''] }],
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
