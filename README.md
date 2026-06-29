# sieve-builder

A graphical builder for [Sieve](https://datatracker.ietf.org/doc/html/rfc5228)
mail filters, targeting Dovecot. You compose rules from condition and action
blocks; the app generates valid Sieve scripts, stores them on the server over
[ManageSieve](https://datatracker.ietf.org/doc/html/rfc5804), and parses
existing scripts back into editable rules.

Primary target is a **Thunderbird MailExtension**, but the code is structured so
the same core can drive a standalone native app.

## Status

The model, generator, and graphical rule editor are in place; generated scripts
are validated against Dovecot's `sievec` compiler.

- [x] Rule model (`src/core/model`)
- [x] Generator: model → Sieve, with computed `require`s and injection-safe
      string handling (`src/core/generator`, `src/core/sieve`)
- [x] UI rule editor with live preview (`src/ui`, Preact)
- [x] ManageSieve client over an injected transport (`src/core/managesieve`),
      with a Node transport (`src/platform/node`); verified against Dovecot
- [x] Parser: Sieve → model (`src/core/parser`), round-trip property-tested,
      with graceful fallback; wired into the UI as Import
- [x] Thunderbird MailExtension (`extension-src`, `src/platform/thunderbird`):
      `npm run build:ext` → `dist-ext/`. See [docs/thunderbird.md](docs/thunderbird.md).
      The privileged TCP code needs verification in a real Thunderbird build.

## Architecture

```
src/
  core/        pure TypeScript — no DOM, no extension APIs (portable to native)
    model/     the rule data model (single source of truth)
    sieve/     Sieve serialisation primitives (string quoting/escaping)
    generator/ model → Sieve script
  ui/          Preact rule editor (depends only on core)          [planned]
  platform/    transport implementations for ManageSieve          [planned]
  extension/   MailExtension manifest + entry points              [planned]
```

The boundary that keeps the native option open: **`core/` imports nothing
platform-specific.** ManageSieve will take an injected transport, so Thunderbird
(experiment API) and a native shell (Node sockets) plug into the same client.

## Design principles

- **Lean.** Four runtime/dev dependencies: `typescript`, `esbuild`, `tsx`,
  `preact`. No bundler config sprawl, no test framework.
- **Safe by construction.** Every user-supplied value is serialised through
  `src/core/sieve/string.ts`; nothing is concatenated raw into a script.
- **Round-trippable.** Generated rules carry `# rule:[name]` metadata comments so
  the parser can reconstruct them losslessly.
- **Deterministic.** Stable ordering and spacing, so diffs and golden tests mean
  something.

## Development

```bash
npm install
npm run dev         # esbuild dev server → http://localhost:8000
npm run build       # production bundle → dist/
npm run typecheck   # tsc --noEmit
npm test            # node --test via tsx
```

The test suite validates generated scripts with Dovecot Pigeonhole's `sievec`
when it is installed (Debian/Ubuntu: `sudo apt install dovecot-sieve`); it skips
that check gracefully otherwise.

`npm run test:integration` exercises the ManageSieve client against a real
Dovecot server it starts in Docker (`docker/`), then tears it down. These tests
are excluded from `npm test`, which stays offline.

## License

MIT — see [LICENSE](LICENSE).
