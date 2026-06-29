# Thunderbird MailExtension

Packaging of Sieve Builder as a Thunderbird MailExtension (128 ESR and newer).

## Build

```bash
npm run build:ext     # → dist-ext/  and  sieve-builder-<version>.xpi
```

This produces two things:

- `dist-ext/` — the unpacked extension, for the dev "Load Temporary Add-on" flow.
- `sieve-builder-<version>.xpi` — an installable package (a ZIP with
  `manifest.json` at the root; sourcemaps excluded).

`dist-ext/` contains:

```
manifest.json         MV2 MailExtension + experiment_apis
background.js         opens the builder in a tab from the toolbar button
index.html            hosts the UI
icon.svg
ui/main.js, main.css  the bundled editor (same code as the web build)
experiment/
  schema.json         the messenger.sieve API surface
  api.js              privileged XPCOM: TCP + STARTTLS, accounts, password
```

## Load it

**Temporary (recommended while developing) — no signing needed:**

1. Thunderbird → **Tools → Developer Tools → Debug Add-ons** (`about:debugging`).
2. **Load Temporary Add-on…** and pick `dist-ext/manifest.json`.
3. Click the **Sieve Builder** toolbar button to open the editor in a tab.

Temporary add-ons are removed when Thunderbird restarts.

**Install the .xpi (persistent):**

1. **Settings → Add-ons and Themes** → gear icon → **Install Add-on From File…**
2. Choose `sieve-builder-<version>.xpi`.

Note: Thunderbird only installs **signed** extensions by default. For an unsigned
local build, either keep using the temporary-add-on flow above, or set
`xpinstall.signatures.required` to `false` in **Settings → General → Config
Editor** (ESR/Developer builds), or sign the .xpi via addons.thunderbird.net.

## How it connects

The editor runs as a normal extension page. Server access is provided by the
`messenger.sieve` experiment:

- **Accounts** are read from Thunderbird; the ManageSieve host/username come from
  the IMAP account, the port defaults to **4190**, and STARTTLS is used when the
  IMAP account uses encryption (all overridable in code/UI).
- **Authentication always uses the account's own persisted credentials.**
  Password accounts reuse the stored password and use the strongest mechanism
  the server offers (SCRAM-SHA-256 > SCRAM-SHA-1 > PLAIN); **OAuth accounts** get
  a bearer token from Thunderbird's OAuth2 module and use XOAUTH2. There is no
  password field — if no credential is available, connecting reports an error
  asking you to save the account's password in Thunderbird.
- **TLS verification** (certificate chain + hostname) and any user-approved
  certificate exceptions come from Thunderbird's socket stack, so it behaves
  exactly like the IMAP connection.

The core ManageSieve client, generator, and parser are the same modules used and
tested elsewhere; only the transport and account/password lookup are
Thunderbird-specific.

## Verification status

Everything except the privileged socket code is covered by the automated test
suite (and validated against a real Dovecot over Docker). `experiment/api.js`
(raw TCP + STARTTLS + OAuth token retrieval via XPCOM) has been verified running
in Thunderbird. Note its APIs are Gecko-version-sensitive: if you target a
different Thunderbird major version, re-check the STARTTLS upgrade and the
`msgIOAuth2Module` calls. See the header comment in that file.
