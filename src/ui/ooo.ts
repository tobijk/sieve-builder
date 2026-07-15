/**
 * Maps between the rule model and the dedicated "Out of office" card. The
 * responder is not a separate concept in the model or the script — it is an
 * ordinary rule (one vacation action, optionally guarded by a currentdate
 * window), so it round-trips through generate/parse like any other rule. The
 * card recognizes exactly that shape; anything richer (extra actions, other
 * conditions) stays a generic rule card and is never clobbered.
 */
import type { ConditionNode, Rule, VacationAction } from '../core/model/types.js';
import { uid } from './model-ops.js';

export interface OooSettings {
  enabled: boolean;
  /** Reply subject; empty = server default ("Auto: <original subject>"). */
  subject: string;
  message: string;
  /** Days before the same sender is answered again (RFC 5230 :days, >= 1). */
  days: number;
  /** Window bounds as "YYYY-MM-DD"; empty = unbounded on that side. */
  from: string;
  until: string;
}

export const DEFAULT_DAYS = 7;

/** Reads a window bound (`currentdate value ge/le "date" [d]`), else null. */
function windowBound(node: ConditionNode): { relation: 'ge' | 'le'; value: string } | null {
  if (
    node.type !== 'currentdate' ||
    node.datePart !== 'date' ||
    node.negate ||
    node.match !== 'value' ||
    (node.relation !== 'ge' && node.relation !== 'le') ||
    node.values.length !== 1
  ) {
    return null;
  }
  return { relation: node.relation, value: node.values[0]! };
}

/** True when a rule is exactly the shape the out-of-office card edits. */
export function isOooRule(rule: Rule): boolean {
  if (rule.actions.length !== 1 || rule.actions[0]!.type !== 'vacation') return false;
  const root = rule.root;
  if (root.match !== 'all' || root.negate) return false;
  const bounds = root.children.map(windowBound);
  if (bounds.some((b) => b === null)) return false;
  const count = (rel: string) => bounds.filter((b) => b!.relation === rel).length;
  return count('ge') <= 1 && count('le') <= 1;
}

function vacationOf(rule: Rule): VacationAction {
  return rule.actions[0] as VacationAction;
}

/** The card's view of a rule (or of "no responder yet"). */
export function readOoo(rule: Rule | null): OooSettings {
  if (!rule) {
    return { enabled: false, subject: '', message: '', days: DEFAULT_DAYS, from: '', until: '' };
  }
  const v = vacationOf(rule);
  const bound = (rel: 'ge' | 'le') =>
    rule.root.children.map(windowBound).find((b) => b?.relation === rel)?.value ?? '';
  return {
    enabled: rule.enabled,
    subject: v.subject ?? '',
    message: v.reason,
    days: v.days ?? DEFAULT_DAYS,
    from: bound('ge'),
    until: bound('le'),
  };
}

/**
 * Builds the rule for the card's state, preserving the previous rule's
 * identity and any vacation extras (:addresses, :handle, :from) the card
 * doesn't edit. Returns null — "remove the rule" — when the responder is off
 * and empty, so an untouched card leaves no trace in the script.
 */
export function writeOoo(prev: Rule | null, s: OooSettings): Rule | null {
  const blank = !s.message.trim() && !s.subject.trim() && !s.from && !s.until;
  if (!s.enabled && blank) return null;

  const children: ConditionNode[] = [];
  if (s.from) {
    children.push({ type: 'currentdate', datePart: 'date', match: 'value', relation: 'ge', values: [s.from] });
  }
  if (s.until) {
    children.push({ type: 'currentdate', datePart: 'date', match: 'value', relation: 'le', values: [s.until] });
  }

  const prevVacation = prev ? vacationOf(prev) : null;
  const days = Number.isFinite(s.days) ? Math.max(1, Math.trunc(s.days)) : DEFAULT_DAYS;
  const action: VacationAction = {
    type: 'vacation',
    reason: s.message,
    days,
    ...(s.subject.trim() !== '' ? { subject: s.subject } : {}),
    ...(prevVacation?.from !== undefined ? { from: prevVacation.from } : {}),
    ...(prevVacation?.addresses ? { addresses: prevVacation.addresses } : {}),
    ...(prevVacation?.handle !== undefined ? { handle: prevVacation.handle } : {}),
  };

  return {
    id: prev?.id ?? uid(),
    name: prev?.name ?? 'Out of office',
    enabled: s.enabled,
    root: { type: 'group', match: 'all', children },
    actions: [action],
  };
}
