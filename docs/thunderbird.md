# Thunderbird MailExtension

Packaging of Sieve Builder as a Thunderbird MailExtension (128 ESR and newer).

## Build

```bash
npm run build:ext     # → dist-ext/
```

`dist-ext/` is a complete, loadable extension:

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

## Load it (temporary)

1. Thunderbird → **Tools → Developer Tools → Debug Add-ons** (`about:debugging`).
2. **Load Temporary Add-on…** and pick `dist-ext/manifest.json`.
3. Click the **Sieve Builder** toolbar button to open the editor in a tab.

To distribute, zip the *contents* of `dist-ext/` (manifest at the zip root).

## How it connects

The editor runs as a normal extension page. Server access is provided by the
`messenger.sieve` experiment:

- **Accounts** are read from Thunderbird; the ManageSieve host/username come from
  the IMAP account, the port defaults to **4190**, and STARTTLS is used when the
  IMAP account uses encryption (all overridable in code/UI).
- The **password** is taken from Thunderbird's own store (reusing the IMAP
  credentials); you are only prompted if it can't be retrieved (e.g. OAuth
  accounts, or no stored password).
- **TLS verification** (certificate chain + hostname) and any user-approved
  certificate exceptions come from Thunderbird's socket stack, so it behaves
  exactly like the IMAP connection.

The core ManageSieve client, generator, and parser are the same modules used and
tested elsewhere; only the transport and account/password lookup are
Thunderbird-specific.

## Verification status

Everything except the privileged socket code is covered by the automated test
suite. `experiment/api.js` (raw TCP + STARTTLS via XPCOM) **must be verified in a
real Thunderbird build** — the XPCOM socket/STARTTLS surface has changed across
Gecko versions, so the STARTTLS upgrade path in particular may need adjustment
for your target version. See the header comment in that file.
