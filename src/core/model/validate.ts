/**
 * Completeness validation: finds rules that would generate valid-but-useless
 * Sieve because a required field was left blank (an empty match value, a
 * file-into with no folder, etc.). The generator still accepts these; this is a
 * product-level check so the UI can stop the user submitting unfinished rules.
 *
 * Disabled rules are skipped — they aren't emitted as live code.
 */
import type { Action, ConditionNode, SieveModel } from './types.js';

export interface ModelProblem {
  ruleId: string;
  ruleName: string;
  message: string;
}

const blank = (s: string) => s.trim() === '';

function nodeProblems(node: ConditionNode, add: (message: string) => void): void {
  if (node.type === 'group') {
    for (const child of node.children) nodeProblems(child, add);
    return;
  }
  switch (node.type) {
    case 'header':
    case 'address':
    case 'envelope':
      if (node.fields.some(blank)) add('a condition has an empty field name');
      if (node.values.some(blank)) add('a condition has an empty value');
      break;
    case 'body':
    case 'currentdate':
      if (node.values.some(blank)) add('a condition has an empty value');
      break;
    case 'exists':
      if (node.fields.some(blank)) add('an “exists” condition has an empty field name');
      break;
    case 'size':
      break;
  }
}

function actionProblems(action: Action, add: (message: string) => void): void {
  switch (action.type) {
    case 'fileinto':
      if (blank(action.mailbox)) add('a “file into” action has no folder');
      break;
    case 'redirect':
      if (blank(action.address)) add('a “redirect” action has no address');
      break;
    case 'vacation':
      if (blank(action.reason)) add('an “auto-reply” action has no message');
      break;
    case 'setflag':
    case 'addflag':
    case 'removeflag':
      if (action.flags.length === 0 || action.flags.every(blank)) add('a flag action has no flag');
      break;
  }
}

/** Returns one problem per incomplete field across all enabled rules. */
export function validateModel(model: SieveModel): ModelProblem[] {
  const problems: ModelProblem[] = [];
  for (const rule of model.rules) {
    if (!rule.enabled) continue;
    const add = (message: string) => problems.push({ ruleId: rule.id, ruleName: rule.name, message });
    nodeProblems(rule.root, add);
    for (const action of rule.actions) actionProblems(action, add);
  }
  return problems;
}
