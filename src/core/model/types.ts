/**
 * The rule model — the single source of truth shared by the generator, the
 * parser, and the UI. It is intentionally a plain, serialisable data model:
 * no behaviour, no platform types. Anything that can appear in a generated
 * script must be representable here, and vice versa, so that the round-trip
 * `model -> sieve -> model` stays an identity for our supported subset.
 *
 * References: RFC 5228 (Sieve), RFC 5231 (relational), RFC 5232 (imap4flags),
 * RFC 5230 (vacation), RFC 5173 (body).
 */

/** How the value of a test is compared. Maps to Sieve match-type tags. */
export type MatchType =
  | 'is' // :is
  | 'contains' // :contains
  | 'matches' // :matches  (shell-style wildcards * ?)
  | 'regex' // :regex     (requires "regex")
  | 'count' // :count     (requires "relational")
  | 'value'; // :value    (requires "relational")

/** Comparator used for the match (RFC 4790). */
export type Comparator = 'i;ascii-casemap' | 'i;octet' | 'i;ascii-numeric';

/** Relational operator, used only with `count` / `value` match types. */
export type RelationalOp = 'lt' | 'le' | 'eq' | 'ge' | 'gt' | 'ne';

/** Which part of an address to test (RFC 5228 §2.7.4). */
export type AddressPart = 'all' | 'localpart' | 'domain';

// --- Tests (conditions) -----------------------------------------------------

interface TestBase {
  /** Wrap this single test in `not(...)`. */
  negate?: boolean;
}

interface ContentMatch {
  match: MatchType;
  values: string[];
  comparator?: Comparator;
  /** Required when `match` is `count` or `value`. */
  relation?: RelationalOp;
}

export interface HeaderTest extends TestBase, ContentMatch {
  type: 'header';
  /** Header field name(s), e.g. ["Subject"] or ["From", "To"]. */
  fields: string[];
}

export interface AddressTest extends TestBase, ContentMatch {
  type: 'address';
  fields: string[];
  part?: AddressPart;
}

/** Tests the SMTP envelope rather than the message header. Needs "envelope". */
export interface EnvelopeTest extends TestBase, ContentMatch {
  type: 'envelope';
  fields: string[];
  part?: AddressPart;
}

export interface SizeTest extends TestBase {
  type: 'size';
  /** true => `:over`, false => `:under`. */
  over: boolean;
  /** Limit in bytes. */
  limit: number;
}

export interface ExistsTest extends TestBase {
  type: 'exists';
  fields: string[];
}

/** Tests the message body. Needs "body". */
export interface BodyTest extends TestBase, ContentMatch {
  type: 'body';
  transform?: 'raw' | 'text' | 'content';
  /** Content types when `transform` is `content`, e.g. ["text/plain"]. */
  contentTypes?: string[];
}

export type Test =
  | HeaderTest
  | AddressTest
  | EnvelopeTest
  | SizeTest
  | ExistsTest
  | BodyTest;

// --- Actions ----------------------------------------------------------------

export interface FileIntoAction {
  type: 'fileinto';
  mailbox: string;
  /** Create the mailbox if missing. Needs "mailbox". */
  create?: boolean;
  /** Keep a copy in INBOX too. Needs "copy". */
  copy?: boolean;
}

export interface RedirectAction {
  type: 'redirect';
  address: string;
  copy?: boolean;
}

export interface KeepAction {
  type: 'keep';
}
export interface DiscardAction {
  type: 'discard';
}
export interface StopAction {
  type: 'stop';
}

/** Set/add/remove IMAP flags. Needs "imap4flags". */
export interface FlagAction {
  type: 'setflag' | 'addflag' | 'removeflag';
  /** Flags such as "\\Seen", "\\Flagged", or keywords. */
  flags: string[];
}

/** Auto-reply. Needs "vacation". */
export interface VacationAction {
  type: 'vacation';
  reason: string;
  days?: number;
  subject?: string;
  from?: string;
  addresses?: string[];
  /** Stable handle so distinct vacation responses are tracked separately. */
  handle?: string;
}

export type Action =
  | FileIntoAction
  | RedirectAction
  | KeepAction
  | DiscardAction
  | StopAction
  | FlagAction
  | VacationAction;

// --- Rules & script ---------------------------------------------------------

/** How a group's children are combined: `all` => allof, `any` => anyof. */
export type ConditionMatch = 'all' | 'any';

/**
 * A boolean grouping of conditions. Groups nest arbitrarily, which mirrors
 * Sieve's own `allof`/`anyof` nesting and lets a rule express mixed logic such
 * as `(A or B) and C`. A group with no children is unconditional.
 */
export interface ConditionGroup {
  type: 'group';
  match: ConditionMatch;
  /** Negate the whole group: `not allof(...)`. */
  negate?: boolean;
  children: ConditionNode[];
}

/** A node in a rule's condition tree: either a leaf test or a sub-group. */
export type ConditionNode = Test | ConditionGroup;

export interface Rule {
  /** Stable identifier (UI keys, reordering). Not emitted to Sieve. */
  id: string;
  /** Human label, preserved via a `# rule:[name]` metadata comment. */
  name: string;
  enabled: boolean;
  /** The condition tree. An empty root => the rule is unconditional. */
  root: ConditionGroup;
  actions: Action[];
}

export interface SieveModel {
  rules: Rule[];
}
