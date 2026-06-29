# Reviewer packet — Sieve Builder

Notes for the addons.thunderbird.net (ATN) review. This add-on includes an
**Experiment API**, so this document explains what it does, why the privileged
access is necessary, how to reproduce the shipped build, and how user data is
handled. A short version suitable for the "Notes to Reviewers" field is at the
bottom.

- **Add-on:** Sieve Builder (`sieve-builder@tobijk`), version 0.1.3
- **Min Thunderbird:** 128.0
- **License:** MIT (all code original; no third-party add-on code is included)
- **Source:** this repository

## What it does

A graphical editor for [Sieve](https://datatracker.ietf.org/doc/html/rfc5228)
mail filters. The user builds rules from condition/action blocks; the add-on
generates a Sieve script and stores it on the user's own mail server over
[ManageSieve](https://datatracker.ietf.org/doc/html/rfc5804) (RFC 5804). It can
also fetch and parse existing scripts back into editable rules.

It opens in a normal extension tab via the toolbar button.

## Why an Experiment is required

ManageSieve runs over a **raw TCP connection (port 4190, STARTTLS)**. There is
no built-in WebExtension API in Thunderbird for opening a TCP socket, so this
cannot be done from a plain MailExtension. The Experiment exists **only** to
provide that socket (plus reuse of the account's existing credentials). It is a
thin bridge: **all application logic — rule modelling, Sieve generation, parsing,
and the ManageSieve protocol itself — lives in the sandboxed WebExtension code**
(`src/core`, `src/ui`), not in the Experiment.

### Exactly what the Experiment does (`experiment/api.js`)

Surface is defined in `experiment/schema.json` (namespace `sieve`):

| Function | Privileged operation | Why |
| --- | --- | --- |
| `listAccounts()` | reads incoming IMAP servers via `MailServices.accounts` | populate the account picker (host/username/port/socket type) |
| `getPassword(key)` | `server.password` / `Services.logins` for the IMAP origin | reuse the account's stored password (no separate credential) |
| `getOAuthToken(key)` | `msgIOAuth2Module` (`initFromMail` + `getAccessToken`) | reuse the account's OAuth2 login for XOAUTH2 |
| `connect/write/read/startTls/close` | `nsISocketTransportService` socket + STARTTLS | the TCP transport for ManageSieve |

TLS is performed by Thunderbird's own socket stack (certificate validation and
any user-approved certificate exceptions are inherited), so it behaves like the
account's IMAP connection.

## Privacy / data handling

- **No external services, no analytics, no telemetry.** The add-on connects
  **only** to the ManageSieve server derived from the user's own configured mail
  account (host/port overridable by the user).
- **No credential storage by the add-on.** It reads the account's existing
  password/OAuth token at connect time and uses it for that connection; it never
  persists credentials. (There is no `storage` permission.)
- Filter scripts live on the user's own server. Nothing is sent anywhere else.

## Permissions

The add-on requests **no WebExtension permissions** — all privileged access is
through the Experiment (`experiment_apis.sieve`), the TCP/credentials bridge
described above. Account details are read inside the Experiment via
`MailServices`, so no `accountsRead` permission is needed.

## Validation note

The linter reports one warning: *"Unsafe assignment to innerHTML"* in
`ui/main.js`. This is inside the bundled **Preact** runtime (its support for
`dangerouslySetInnerHTML` and node clearing), **not** application code. The
project never uses `dangerouslySetInnerHTML` and never assigns user data to
`innerHTML` (verifiable by grepping `src/`); all dynamic content is rendered as
escaped text/JSX. Generated Sieve is additionally escaped at a single chokepoint
(`src/core/sieve/string.ts`).

## Reproducible build

The UI is bundled and minified by esbuild, so the source differs from the
shipped `ui/main.js`. To reproduce the exact package:

```bash
npm ci
npm run build:ext      # → dist-ext/  and  sieve-builder-<version>.xpi
```

Toolchain: Node 20+, dependencies `typescript`, `esbuild`, `tsx`, `preact`
(see `package.json`). The non-bundled files (`manifest.json`, `background.js`,
`experiment/`, `icon.svg`, `index.html`) are copied verbatim from
`extension-src/` and can be compared directly against the `.xpi`.

## Where to look in the source

- `extension-src/` — manifest, background, the Experiment (`experiment/api.js`).
- `src/core/` — rule model, Sieve generator/parser, ManageSieve client (pure,
  no privileged access). Heavily unit-tested (`npm test`) and validated against a
  real Dovecot server (`npm run test:integration`).
- `src/platform/thunderbird/` — the glue that calls the Experiment.
- `src/ui/` — the Preact editor.

## Maintenance

The author understands Experiments must track Thunderbird's release cadence; the
Experiment's XPCOM touchpoints (STARTTLS upgrade, `msgIOAuth2Module`) are
isolated in `experiment/api.js` for that purpose and will be updated as needed.

---

## Notes to Reviewers (short version to paste into ATN)

> Sieve Builder edits Dovecot Sieve mail filters and stores them on the user's
> own server over ManageSieve (RFC 5804). ManageSieve needs a raw TCP socket
> (port 4190 + STARTTLS), for which Thunderbird has no built-in WebExtension API
> — that is the sole purpose of the Experiment (`experiment/api.js`): it provides
> the socket and reuses the account's existing password/OAuth credentials. All
> application logic (rule model, Sieve generation, parsing, the ManageSieve
> protocol) is in the sandboxed WebExtension code; the Experiment is a thin
> bridge. No external servers, no analytics, no credential storage — it talks
> only to the user's configured mail server. The UI is esbuild-bundled; rebuild
> with `npm ci && npm run build:ext`.
