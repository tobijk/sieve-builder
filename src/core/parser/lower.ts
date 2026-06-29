/**
 * Lower a generic Sieve AST into our rule model. Anything outside the supported
 * subset is recorded as an issue and the affected construct is dropped, so the
 * caller can detect a non-round-trippable script and avoid clobbering it.
 */
import type {
  Action,
  AddressPart,
  AddressTest,
  BodyTest,
  Comparator,
  ConditionGroup,
  ConditionNode,
  EnvelopeTest,
  HeaderTest,
  MatchType,
  RelationalOp,
  Rule,
  SieveModel,
  Test,
} from '../model/types.js';
import { ACTION_TYPES, ADDRESS_PARTS, KEYWORD_GROUP, MATCH_TYPES } from '../model/subset.js';
import type { AstArg, AstCommand, AstTest } from './grammar.js';
import type { Marker } from './lexer.js';

export interface ParseIssue {
  message: string;
}

const ACTION_NAMES: ReadonlySet<string> = new Set(ACTION_TYPES);
const MATCH_TAGS: ReadonlySet<string> = new Set(MATCH_TYPES);
const PART_TAGS: ReadonlySet<string> = new Set(ADDRESS_PARTS);

/** Walks a leaf test's argument list, separating tags from positional strings. */
interface LeafArgs {
  comparator?: Comparator;
  match?: MatchType;
  relation?: RelationalOp;
  part?: AddressPart;
  over?: boolean;
  limit?: number;
  transform?: 'raw' | 'text' | 'content';
  contentTypes?: string[];
  positional: string[][];
}

function readLeafArgs(args: AstArg[], fail: (m: string) => void): LeafArgs | null {
  const out: LeafArgs = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.kind === 'number') {
      out.limit = arg.value;
      continue;
    }
    if (arg.kind === 'strings') {
      out.positional.push(arg.value);
      continue;
    }
    const tag = arg.value;
    const takeString = (): string | null => {
      const next = args[++i];
      if (!next || next.kind !== 'strings' || next.value.length !== 1) {
        fail(`tag :${tag} expects a string argument`);
        return null;
      }
      return next.value[0]!;
    };
    if (tag === 'comparator') {
      const v = takeString();
      if (v === null) return null;
      out.comparator = v as Comparator;
    } else if (MATCH_TAGS.has(tag)) {
      out.match = tag as MatchType;
      if (tag === 'count' || tag === 'value') {
        const v = takeString();
        if (v === null) return null;
        out.relation = v as RelationalOp;
      }
    } else if (PART_TAGS.has(tag)) {
      out.part = tag as AddressPart;
    } else if (tag === 'over' || tag === 'under') {
      out.over = tag === 'over';
    } else if (tag === 'raw' || tag === 'text') {
      out.transform = tag;
    } else if (tag === 'content') {
      out.transform = 'content';
      const next = args[++i];
      if (!next || next.kind !== 'strings') {
        fail('tag :content expects a string list');
        return null;
      }
      out.contentTypes = next.value;
    } else {
      fail(`unsupported tag :${tag}`);
      return null;
    }
  }
  return out;
}

function lowerLeaf(test: AstTest, issues: ParseIssue[]): Test | null {
  const fail = (m: string) => issues.push({ message: m });
  const a = readLeafArgs(test.args, fail);
  if (!a) return null;
  const match = a.match ?? 'is';

  switch (test.name) {
    case 'header': {
      if (a.positional.length < 2) return (fail('header test needs field and value lists'), null);
      const t: HeaderTest = {
        type: 'header',
        fields: a.positional[0]!,
        match,
        values: a.positional[1]!,
        ...(a.comparator ? { comparator: a.comparator } : {}),
        ...(a.relation ? { relation: a.relation } : {}),
      };
      return t;
    }
    case 'address':
    case 'envelope': {
      if (a.positional.length < 2) return (fail(`${test.name} test needs field and value lists`), null);
      const base = {
        fields: a.positional[0]!,
        match,
        values: a.positional[1]!,
        ...(a.part ? { part: a.part } : {}),
        ...(a.comparator ? { comparator: a.comparator } : {}),
        ...(a.relation ? { relation: a.relation } : {}),
      };
      return test.name === 'address'
        ? ({ type: 'address', ...base } satisfies AddressTest)
        : ({ type: 'envelope', ...base } satisfies EnvelopeTest);
    }
    case 'exists': {
      if (a.positional.length < 1) return (fail('exists test needs a field list'), null);
      return { type: 'exists', fields: a.positional[0]! };
    }
    case 'size': {
      if (a.limit === undefined) return (fail('size test needs a number'), null);
      return { type: 'size', over: a.over ?? true, limit: a.limit };
    }
    case 'body': {
      if (a.positional.length < 1) return (fail('body test needs a value list'), null);
      const t: BodyTest = {
        type: 'body',
        match,
        values: a.positional[0]!,
        ...(a.transform ? { transform: a.transform } : {}),
        ...(a.contentTypes ? { contentTypes: a.contentTypes } : {}),
        ...(a.comparator ? { comparator: a.comparator } : {}),
      };
      return t;
    }
    default:
      fail(`unsupported test '${test.name}'`);
      return null;
  }
}

function negated(node: ConditionNode, issues: ParseIssue[]): ConditionNode | null {
  if (node.type === 'group') {
    if (node.negate) return (issues.push({ message: 'double negation is unsupported' }), null);
    return { ...node, negate: true };
  }
  if (node.type === 'size') return (issues.push({ message: 'negated size is unsupported' }), null);
  if (node.negate) return (issues.push({ message: 'double negation is unsupported' }), null);
  return { ...node, negate: true };
}

function lowerNode(test: AstTest, issues: ParseIssue[]): ConditionNode | null {
  if (test.name === 'allof' || test.name === 'anyof') {
    const children: ConditionNode[] = [];
    for (const child of test.tests) {
      const node = lowerNode(child, issues);
      if (!node) return null;
      children.push(node);
    }
    return { type: 'group', match: KEYWORD_GROUP[test.name], children };
  }
  if (test.name === 'not') {
    const inner = lowerNode(test.tests[0]!, issues);
    return inner ? negated(inner, issues) : null;
  }
  return lowerLeaf(test, issues);
}

/** The root condition must be a group; wrap a bare leaf as a single-child group. */
function lowerRoot(test: AstTest, issues: ParseIssue[]): ConditionGroup | null {
  const node = lowerNode(test, issues);
  if (!node) return null;
  return node.type === 'group' ? node : { type: 'group', match: 'all', children: [node] };
}

function lowerAction(cmd: AstCommand, issues: ParseIssue[]): Action | null {
  const fail = (m: string) => issues.push({ message: m });
  const a = cmd.args;
  const firstString = (): string | null => {
    const s = a.find((x): x is Extract<AstArg, { kind: 'strings' }> => x.kind === 'strings');
    return s && s.value.length > 0 ? s.value[0]! : null;
  };

  switch (cmd.name) {
    case 'keep':
      return { type: 'keep' };
    case 'discard':
      return { type: 'discard' };
    case 'stop':
      return { type: 'stop' };
    case 'fileinto': {
      const mailbox = firstString();
      if (mailbox === null) return (fail('fileinto needs a mailbox'), null);
      const copy = a.some((x) => x.kind === 'tag' && x.value === 'copy');
      const create = a.some((x) => x.kind === 'tag' && x.value === 'create');
      return { type: 'fileinto', mailbox, ...(create ? { create } : {}), ...(copy ? { copy } : {}) };
    }
    case 'redirect': {
      const address = firstString();
      if (address === null) return (fail('redirect needs an address'), null);
      const copy = a.some((x) => x.kind === 'tag' && x.value === 'copy');
      return { type: 'redirect', address, ...(copy ? { copy } : {}) };
    }
    case 'setflag':
    case 'addflag':
    case 'removeflag': {
      const flags = a.find((x): x is Extract<AstArg, { kind: 'strings' }> => x.kind === 'strings');
      if (!flags) return (fail(`${cmd.name} needs flags`), null);
      return { type: cmd.name, flags: flags.value };
    }
    case 'vacation':
      return lowerVacation(a, fail);
    default:
      fail(`unsupported action '${cmd.name}'`);
      return null;
  }
}

function lowerVacation(args: AstArg[], fail: (m: string) => void): Action | null {
  let days: number | undefined;
  let subject: string | undefined;
  let from: string | undefined;
  let handle: string | undefined;
  let addresses: string[] | undefined;
  let reason: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.kind === 'strings') {
      reason = arg.value[0] ?? '';
      continue;
    }
    if (arg.kind === 'number') {
      fail('unexpected number in vacation');
      return null;
    }
    const tag = arg.value;
    const next = args[i + 1];
    if (tag === 'days') {
      if (!next || next.kind !== 'number') return (fail('vacation :days expects a number'), null);
      days = next.value;
      i++;
    } else if (tag === 'subject' || tag === 'from' || tag === 'handle') {
      if (!next || next.kind !== 'strings' || next.value.length !== 1) {
        return (fail(`vacation :${tag} expects a string`), null);
      }
      const v = next.value[0]!;
      if (tag === 'subject') subject = v;
      else if (tag === 'from') from = v;
      else handle = v;
      i++;
    } else if (tag === 'addresses') {
      if (!next || next.kind !== 'strings') return (fail('vacation :addresses expects a list'), null);
      addresses = next.value;
      i++;
    } else {
      fail(`unsupported vacation tag :${tag}`);
      return null;
    }
  }

  if (reason === undefined) return (fail('vacation needs a reason'), null);
  return {
    type: 'vacation',
    reason,
    ...(days !== undefined ? { days } : {}),
    ...(subject !== undefined ? { subject } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(addresses !== undefined ? { addresses } : {}),
    ...(handle !== undefined ? { handle } : {}),
  };
}

type Item = { pos: number } & (
  | { kind: 'marker'; marker: Marker }
  | { kind: 'cmd'; cmd: AstCommand }
);

export function lower(commands: AstCommand[], markers: Marker[]): { model: SieveModel; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const rules: Rule[] = [];
  let counter = 0;
  const nextId = () => `r${++counter}`;

  const items: Item[] = [
    ...markers.map((m) => ({ pos: m.pos, kind: 'marker' as const, marker: m })),
    ...commands.map((c) => ({ pos: c.pos, kind: 'cmd' as const, cmd: c })),
  ].sort((a, b) => a.pos - b.pos);

  let pendingName: string | null = null;
  let unconditional: Rule | null = null;
  const flush = () => {
    if (unconditional) {
      rules.push(unconditional);
      unconditional = null;
    }
  };

  for (const item of items) {
    if (item.kind === 'marker') {
      flush();
      if (item.marker.disabled) {
        rules.push({
          id: nextId(),
          name: item.marker.name,
          enabled: false,
          root: { type: 'group', match: 'all', children: [] },
          actions: [],
        });
        pendingName = null;
      } else {
        pendingName = item.marker.name;
      }
      continue;
    }

    const cmd = item.cmd;
    if (cmd.name === 'require') continue; // recomputed by the generator

    if (cmd.name === 'if') {
      flush();
      const root = lowerRoot(cmd.test!, issues);
      const actions: Action[] = [];
      for (const c of cmd.block ?? []) {
        const action = lowerAction(c, issues);
        if (action) actions.push(action);
      }
      rules.push({
        id: nextId(),
        name: pendingName ?? 'Rule',
        enabled: true,
        root: root ?? { type: 'group', match: 'all', children: [] },
        actions,
      });
      pendingName = null;
      continue;
    }

    if (ACTION_NAMES.has(cmd.name)) {
      if (!unconditional) {
        unconditional = {
          id: nextId(),
          name: pendingName ?? 'Rule',
          enabled: true,
          root: { type: 'group', match: 'all', children: [] },
          actions: [],
        };
        pendingName = null;
      }
      const action = lowerAction(cmd, issues);
      if (action) unconditional.actions.push(action);
      continue;
    }

    flush();
    issues.push({ message: `unsupported command '${cmd.name}'` });
  }

  flush();
  return { model: { rules }, issues };
}
