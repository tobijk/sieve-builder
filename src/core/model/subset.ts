/**
 * The supported Sieve subset, defined once. The model types are derived from
 * these arrays, and the generator, parser, and extension detection all consume
 * them — so adding (or removing) a capability is a single edit here, and the
 * generator/parser cannot drift out of agreement.
 */

/** Match-type tags. `count`/`value` additionally take a relational operator. */
export const MATCH_TYPES = ['is', 'contains', 'matches', 'regex', 'count', 'value'] as const;

/** Match-types that carry a relational operator (require "relational"). */
export const RELATIONAL_MATCH_TYPES = ['count', 'value'] as const;

/** Comparators (RFC 4790 / RFC 5228). */
export const COMPARATORS = ['i;ascii-casemap', 'i;octet', 'i;ascii-numeric'] as const;

/** Relational operators (RFC 5231), used with the count/value match-types. */
export const RELATIONAL_OPS = ['lt', 'le', 'eq', 'ge', 'gt', 'ne'] as const;

/** Address parts (RFC 5228 §2.7.4). */
export const ADDRESS_PARTS = ['all', 'localpart', 'domain'] as const;

/** Body transforms (RFC 5173). */
export const BODY_TRANSFORMS = ['raw', 'text', 'content'] as const;

/**
 * Date-parts for the currentdate test (RFC 5260). Only the calendar date
 * ("YYYY-MM-DD", which also compares correctly as a plain string) is in the
 * subset — enough for scheduling, e.g. an out-of-office window.
 */
export const DATE_PARTS = ['date'] as const;

/** Supported action command names. */
export const ACTION_TYPES = [
  'fileinto',
  'redirect',
  'keep',
  'discard',
  'stop',
  'setflag',
  'addflag',
  'removeflag',
  'vacation',
] as const;

/** Maps a condition group's combinator to its Sieve test keyword and back. */
export const GROUP_KEYWORD = { all: 'allof', any: 'anyof' } as const;
export const KEYWORD_GROUP = { allof: 'all', anyof: 'any' } as const;
