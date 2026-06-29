# CLAUDE.md

Operational notes for working on this repo. User-facing docs are in `README.md`
and `docs/thunderbird.md`; this file is the "how to work on it" companion.

## Commands

```bash
npm run dev            # esbuild dev server for the UI (browser, no Thunderbird)
npm run build          # web bundle -> dist/
npm run build:ext      # MailExtension -> dist-ext/ + sieve-builder-<ver>.xpi
npm run typecheck      # tsc --noEmit  (run after every change)
npm test               # offline unit tests (node --test via tsx)
npm run test:integration  # starts Dovecot in Docker, runs RFC-5804 tests, tears down
```

Always run `npm run typecheck` and `npm test` before committing.

## Architecture

- `src/core/` — **pure TypeScript, no DOM, no platform APIs.** Portable; the
  whole reason a native shell is still possible.
  - `model/` — the rule model + `subset.ts` (the single source of truth for the
    supported Sieve subset; model types are derived from it). `validate.ts` =
    completeness check.
  - `generator/` — model -> Sieve. `parser/` — Sieve -> model.
  - `sieve/string.ts` — the escaping chokepoint (anti-injection).
  - `managesieve/` — RFC 5804 client over an injected `Transport`; `sasl.ts`
    has PLAIN/XOAUTH2/SCRAM.
- `src/ui/` — Preact editor; depends only on `core`.
- `src/platform/node/` — Node `Transport` (tests, native shell).
- `src/platform/thunderbird/` — `Transport` + account/token resolver over the
  experiment API.
- `extension-src/` — MailExtension manifest, background, and `experiment/api.js`
  (privileged XPCOM), copied verbatim into the build.

## Invariants — don't break these

- **Generator and parser are inverses.** Property test: `generate(parse(
  generate(m))) === generate(m)`. Both must agree via `model/subset.ts` — add a
  capability there, not ad hoc in each.
- **All user strings go through `sieve/string.ts`.** Never concatenate user data
  into a script. Numbers/comments/tags have their own guards in `generator/`.
- **`core` imports nothing platform-specific.** Keep it pure.
- **Parser `ok` flag is honest:** if anything isn't representable, push an issue
  (so `ok` is false) — never silently drop.
- ManageSieve `requireTls` defaults true; credentials never go over plaintext.

## Gotchas (learned the hard way)

- **ManageSieve literals are framed by UTF-8 *byte* length** (`Buffer.byteLength`
  / encoded length), not `string.length`. Scripts contain multi-byte Unicode.
- **No raw control bytes in source.** SASL needs NUL / `^A` separators — build
  them with `String.fromCharCode` / named consts (`NUL`, `SOH`), not literal
  bytes. The Read tool renders control bytes as spaces, which hides them and
  breaks Edit matching.
- **SCRAM uses Web Crypto** (PBKDF2/HMAC/SHA), which exists in the extension and
  in Node — so it's dependency-free and testable. **No md5** (not in Web Crypto;
  don't add a hash lib — compare content directly).
- **`extension-src/experiment/api.js` cannot be tested here.** It's privileged
  XPCOM (TCP, STARTTLS, OAuth via `msgIOAuth2Module`) and is Gecko-version
  sensitive. Verify in a real Thunderbird after touching it.
- TS is strict with `exactOptionalPropertyTypes` + `verbatimModuleSyntax`: build
  optional fields with `...(x ? { x } : {})`, and `import type` for type-only.
- Web Crypto lib types want ArrayBuffer-backed views; see the `bs()` cast in
  `sasl.ts`.

## Testing approach

- Offline `npm test` must stay offline and fast. Integration tests live under
  `test/` (not `src/`) so the unit runner skips them; they self-skip if no
  server is reachable.
- Generated Sieve is validated with `sievec` (Debian `dovecot-sieve`) when
  present; the ManageSieve client is validated against a Docker Dovecot
  (`docker/`), which has SCRAM enabled so integration auth runs over SCRAM-256.

## Conventions

- Lean: keep dependencies minimal (typescript, esbuild, tsx, preact, @types/node).
- Match surrounding style; comments explain *why*, not *what*.
- Commit messages end with the project's Co-Authored-By trailer.
- Do **not** reference or copy any third-party Sieve add-on; all code is original
  (project is MIT).
