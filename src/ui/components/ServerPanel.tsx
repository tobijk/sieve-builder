import { useEffect, useState } from 'preact/hooks';

import { generate } from '../../core/generator/generate.js';
import { ManageSieveError, type ManageSieveClient, type ScriptInfo } from '../../core/managesieve/index.js';
import type { Rule, SieveModel } from '../../core/model/types.js';
import { parseSieve } from '../../core/parser/parse.js';
import { parseScriptVersion } from '../../core/script-version.js';
import { connect, listAccounts } from '../../platform/thunderbird/backend.js';
import { DEFAULT_SIEVE_PORT, type ImapAccount } from '../../platform/thunderbird/config.js';
import { summarizeParse } from '../parse-summary.js';

interface Props {
  /** The current rules, generated (with a version stamp) on save. */
  model: SieveModel;
  /** Replace the editor's rules with ones loaded from the server. */
  onLoad: (rules: Rule[]) => void;
  /** When true, the current rules have unfinished fields — saving is blocked. */
  incomplete: boolean;
}

type Status = { kind: 'ok' | 'info' | 'error'; text: string } | null;
/** What we knew about the saved script when we loaded it, for conflict checks. */
type Baseline = { name: string; version: number | null } | null;

export function ServerPanel({ model, onLoad, incomplete }: Props) {
  const [accounts, setAccounts] = useState<ImapAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [port, setPort] = useState(DEFAULT_SIEVE_PORT);
  const [password, setPassword] = useState('');

  const [client, setClient] = useState<ManageSieveClient | null>(null);
  const [insecure, setInsecure] = useState(false);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [baseline, setBaseline] = useState<Baseline>(null);
  const [saveName, setSaveName] = useState('sieve-builder');
  const [activate, setActivate] = useState(true);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    listAccounts()
      .then((list) => {
        setAccounts(list);
        if (list[0]) setSelected(list[0].key);
      })
      .catch((e) => setStatus({ kind: 'error', text: String(e) }));
  }, []);

  const run = async (label: string, fn: () => Promise<Status | void>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (result) setStatus(result);
    } catch (e) {
      setStatus({ kind: 'error', text: `${label}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  // Load and Save imply connect: open a session lazily on first use.
  async function ensureClient(): Promise<ManageSieveClient> {
    if (client) return client;
    const account = accounts.find((a) => a.key === selected);
    if (!account) throw new Error('Select an account first.');
    const portOverride = Number.isFinite(port) && port > 0 ? port : DEFAULT_SIEVE_PORT;
    const c = await connect(account, async () => password.trim() || null, { port: portOverride });
    setClient(c);
    setInsecure(!c.isSecure);
    setPassword('');
    return c;
  }

  async function loadInto(c: ManageSieveClient, name: string): Promise<Status> {
    const text = await c.getScript(name);
    const result = parseSieve(text);
    const summary = summarizeParse(result);
    if (summary.ruleCount === 0 && !result.ok) {
      return { kind: 'error', text: `"${name}" couldn’t be parsed into editable rules.` };
    }
    onLoad(result.model.rules);
    setBaseline({ name, version: parseScriptVersion(text) });
    setSaveName(name);
    return { kind: summary.kind === 'ok' ? 'ok' : 'info', text: `Loaded "${name}": ${summary.text}` };
  }

  function startNew(): void {
    onLoad([]);
    setBaseline(null);
    setSaveName('sieve-builder');
  }

  const doLoadFromServer = () =>
    run('Load', async () => {
      const c = await ensureClient();
      const list = await c.listScripts();
      setScripts(list);
      const active = list.find((s) => s.active);
      if (active) return loadInto(c, active.name);
      if (list.length === 0) {
        startNew();
        return { kind: 'info', text: 'No scripts on the server yet — start a new one, then Save.' };
      }
      return { kind: 'info', text: 'Connected. Choose a script to load below.' };
    });

  const doLoadScript = (name: string) =>
    run('Load', async () => loadInto(await ensureClient(), name));

  const doActivate = (name: string) =>
    run('Activate', async () => {
      const c = await ensureClient();
      await c.setActive(name);
      setScripts(await c.listScripts());
      return { kind: 'ok', text: `"${name}" is now active.` };
    });

  const doSave = () =>
    run('Save', async () => {
      if (incomplete) return { kind: 'error', text: 'Finish the incomplete fields before saving.' };
      const name = saveName.trim();
      if (!name) return { kind: 'error', text: 'Enter a script name.' };
      const c = await ensureClient();

      // Load-first conflict check: re-read the server copy and compare versions.
      let exists = false;
      let serverVersion: number | null = null;
      try {
        serverVersion = parseScriptVersion(await c.getScript(name));
        exists = true;
      } catch (e) {
        if (!(e instanceof ManageSieveError)) throw e; // genuine error, not "no such script"
      }
      const base = baseline && baseline.name === name ? baseline : null;
      if (exists && !base) {
        return {
          kind: 'error',
          text: `"${name}" already exists on the server but wasn’t loaded here — load it first to avoid overwriting it.`,
        };
      }
      if (exists && base && serverVersion !== base.version) {
        return {
          kind: 'error',
          text: `"${name}" changed on the server (now v${serverVersion ?? '?'}, you have v${base.version ?? '?'}). Reload before saving.`,
        };
      }

      const newVersion = (base?.version ?? 0) + 1;
      const out = generate(model, { version: newVersion });
      await c.checkScript(out); // server-side validation; throws on a compile error
      await c.putScript(name, out);
      if (activate) await c.setActive(name);
      setBaseline({ name, version: newVersion });
      setScripts(await c.listScripts());
      return { kind: 'ok', text: `Saved "${name}" (v${newVersion})${activate ? ' and activated it' : ''}.` };
    });

  const doDisconnect = () =>
    run('Disconnect', async () => {
      await client?.logout();
      setClient(null);
      setInsecure(false);
      setScripts([]);
      return { kind: 'info', text: 'Disconnected.' };
    });

  return (
    <section class="panel">
      <div class="panel-head">
        <span class="label">Server</span>
        {client && (
          <button class="btn-ghost" disabled={busy} onClick={doDisconnect}>
            Disconnect
          </button>
        )}
      </div>

      {!client ? (
        <div class="connect">
          <select
            class="control"
            value={selected}
            disabled={busy || accounts.length === 0}
            onChange={(e) => setSelected(e.currentTarget.value)}
          >
            {accounts.length === 0 && <option value="">No mail accounts found</option>}
            {accounts.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name} ({a.host})
              </option>
            ))}
          </select>
          <div class="row">
            <span class="size-input">
              <input
                class="control"
                type="number"
                min="1"
                max="65535"
                value={port}
                disabled={busy}
                aria-label="ManageSieve port"
                onInput={(e) => setPort(Number(e.currentTarget.value))}
              />
              <span class="unit">port</span>
            </span>
            <input
              class="control grow"
              type="password"
              autocomplete="current-password"
              placeholder="Password (only if not saved)"
              value={password}
              disabled={busy}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </div>
          <button class="btn" disabled={busy || !selected} onClick={doLoadFromServer}>
            Load from server
          </button>
        </div>
      ) : (
        <>
          {insecure && (
            <div class="panel-status error">No TLS — credentials were sent in the clear.</div>
          )}

          <ul class="script-list">
            {scripts.length === 0 && <li class="muted">No scripts on the server yet.</li>}
            {scripts.map((s) => (
              <li key={s.name}>
                <span class="script-name">
                  {s.name}
                  {s.active && <span class="badge">active</span>}
                </span>
                <span class="script-actions">
                  <button class="btn-ghost" disabled={busy} onClick={() => doLoadScript(s.name)}>
                    Load
                  </button>
                  {!s.active && (
                    <button class="btn-ghost" disabled={busy} onClick={() => doActivate(s.name)}>
                      Activate
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div class="row">
            <button class="add-btn" disabled={busy} onClick={startNew}>
              + New script
            </button>
            <button class="add-btn" disabled={busy} onClick={doLoadFromServer}>
              ↻ Reload
            </button>
          </div>

          <div class="row save-row">
            <input
              class="control grow"
              type="text"
              placeholder="Script name"
              value={saveName}
              onInput={(e) => setSaveName(e.currentTarget.value)}
            />
            <label class="check">
              <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.currentTarget.checked)} />
              activate
            </label>
            <button
              class="btn"
              disabled={busy || incomplete}
              title={incomplete ? 'Finish the incomplete fields first' : undefined}
              onClick={doSave}
            >
              Save
            </button>
          </div>
        </>
      )}

      {status && <div class={`panel-status ${status.kind}`}>{status.text}</div>}
    </section>
  );
}
