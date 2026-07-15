/**
 * Computes the exact set of Sieve extensions a model uses, so the generator can
 * emit a minimal, correct `require` line. Requiring too little makes the script
 * fail to compile; requiring too much is noise. We derive it from usage only.
 */

import type { Action, ConditionNode, SieveModel, Test } from '../model/types.js';

function nodeExtensions(node: ConditionNode, add: (ext: string) => void): void {
  if (node.type === 'group') {
    for (const child of node.children) nodeExtensions(child, add);
  } else {
    testExtensions(node, add);
  }
}

function testExtensions(test: Test, add: (ext: string) => void): void {
  switch (test.type) {
    case 'envelope':
      add('envelope');
      break;
    case 'body':
      add('body');
      break;
    case 'currentdate':
      add('date');
      break;
  }
  if ('match' in test) {
    if (test.match === 'regex') add('regex');
    if (test.match === 'count' || test.match === 'value') add('relational');
    if (test.comparator === 'i;ascii-numeric') add('comparator-i;ascii-numeric');
  }
}

function actionExtensions(action: Action, add: (ext: string) => void): void {
  switch (action.type) {
    case 'fileinto':
      add('fileinto');
      if (action.create) add('mailbox');
      if (action.copy) add('copy');
      break;
    case 'redirect':
      if (action.copy) add('copy');
      break;
    case 'setflag':
    case 'addflag':
    case 'removeflag':
      add('imap4flags');
      break;
    case 'vacation':
      add('vacation');
      break;
  }
}

export function requiredExtensions(model: SieveModel): string[] {
  const set = new Set<string>();
  const add = (ext: string) => set.add(ext);
  for (const rule of model.rules) {
    if (!rule.enabled) continue;
    nodeExtensions(rule.root, add);
    for (const action of rule.actions) actionExtensions(action, add);
  }
  // Deterministic ordering keeps generated scripts stable (clean diffs, stable tests).
  return [...set].sort();
}
