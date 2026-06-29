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
  /** True once filters have been loaded; reveals the save controls. */
  loaded: boolean;
}

type Status = { kind: 'ok' | 'info' | 'error'; text: string } | null;
/** What we knew about the saved script when we loaded it, for conflict checks. */
type Baseline = { name: string; version: number | null } | null;

export function ServerPanel({ model, onLoad, incomplete, loaded }: Props) {
  const [accounts, setAccounts] = useState<ImapAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [port, setPort] = useState(DEFAULT_SIEVE_PORT);
  const [password, setPassword] = useState('');

  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [baseline, setBaseline] = useState<Baseline>(null);
  const [saveName, setSaveName] = useState('sieve-builder');
  const [activate, setActivate] = useState(true);

  const [busy, setBusy] = useState(false);
  // Each card shows the status of actions triggered from it.
  const [serverStatus, setServerStatus] = useState<Status>(null);
  const [scriptStatus, setScriptStatus] = useState<Status>(null);

  useEffect(() => {
    listAccounts()
      .then((list) => {
        setAccounts(list);
        if (list[0]) setSelected(list[0].key);
      })
      .catch((e) => setServerStatus({ kind: 'error', text: String(e) }));
  }, []);

  const run = async (
    setter: (s: Status) => void,
    label: string,
    fn: () => Promise<Status | void>,
  ) => {
    // An action on one card clears the other card's stale status.
    (setter === setServerStatus ? setScriptStatus : setServerStatus)(null);
    setBusy(true);
    try {
      const result = await fn();
      if (result !== undefined) setter(result);
    } catch (e) {
      setter({ kind: 'error', text: `${label}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  // The connection is an implementation detail: open it, do one job, close it.
  async function withClient<T>(fn: (c: ManageSieveClient) => Promise<T>): Promise<T> {
    const account = accounts.find((a) => a.key === selected);
    if (!account) throw new Error('Select an account first.');
    const portOverride = Number.isFinite(port) && port > 0 ? port : DEFAULT_SIEVE_PORT;
    const c = await connect(account, async () => password.trim() || null, { port: portOverride });
    setPassword('');
    try {
      return await fn(c);
    } finally {
      await c.logout().catch(() => {}); // best-effort close
    }
  }

  /** Prefix a status with a warning when the connection wasn't encrypted. */
  const tlsNote = (c: ManageSieveClient, s: Status): Status =>
    s && s.kind !== 'error' && !c.isSecure
      ? { kind: 'info', text: `No TLS — credentials sent in the clear. ${s.text}` }
      : s;

  /** Confirm before throwing away unsaved edits. */
  const confirmReplace = (verb: string): boolean =>
    model.rules.length === 0 ||
    window.confirm(`${verb} will replace the rules in the editor. Unsaved changes will be lost. Continue?`);

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

  const doLoadFromServer = () =>
    run(setServerStatus, 'Load', async () => {
      if (!confirmReplace('Loading')) return;
      return withClient(async (c) => {
        const list = await c.listScripts();
        setScripts(list);
        const active = list.find((s) => s.active);
        if (active) return tlsNote(c, await loadInto(c, active.name));
        if (list.length === 0) {
          onLoad([]);
          setBaseline(null);
          setSaveName('');
          return tlsNote(c, { kind: 'info', text: 'No scripts on the server yet — add rules and Save.' });
        }
        return tlsNote(c, { kind: 'info', text: 'Choose a script to load below.' });
      });
    });

  const doLoadScript = (name: string) =>
    run(setScriptStatus, 'Load', async () => {
      if (!confirmReplace('Loading')) return;
      return withClient(async (c) => tlsNote(c, await loadInto(c, name)));
    });

  const doActivate = (name: string) =>
    run(setScriptStatus, 'Activate', () =>
      withClient(async (c) => {
        await c.setActive(name);
        setScripts(await c.listScripts());
        return { kind: 'ok', text: `"${name}" is now active.` } as Status;
      }),
    );

  const doDelete = (name: string) => {
    if (!window.confirm(`Delete "${name}" from the server? This can’t be undone.`)) return;
    run(setScriptStatus, 'Delete', () =>
      withClient(async (c) => {
        await c.deleteScript(name);
        setScripts(await c.listScripts());
        if (baseline?.name === name) setBaseline(null);
        return { kind: 'ok', text: `Deleted "${name}".` } as Status;
      }),
    );
  };

  const startNew = () => {
    if (!confirmReplace('Starting a new script')) return;
    onLoad([]);
    setBaseline(null);
    setSaveName('');
    setServerStatus(null);
    setScriptStatus({ kind: 'info', text: 'Started a new script. Name it, add rules, and Save.' });
  };

  const doSave = () =>
    run(setScriptStatus, 'Save', async () => {
      if (incomplete) return { kind: 'error', text: 'Finish the incomplete fields before saving.' };
      const name = saveName.trim();
      if (!name) return { kind: 'error', text: 'Enter a script name.' };

      return withClient(async (c) => {
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
        return tlsNote(c, {
          kind: 'ok',
          text: `Saved "${name}" (v${newVersion})${activate ? ' and activated it' : ''}.`,
        });
      });
    });

  const statusView = (s: Status) =>
    s ? <div class={`panel-status ${s.kind}`}>{s.text}</div> : null;

  return (
    <>
      <section class="panel">
        <div class="panel-head">
          <span class="label">Server</span>
        </div>

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
          Load
        </button>

        {statusView(serverStatus)}
      </section>

      {loaded && (
        <section class="panel">
          <div class="panel-head">
            <span class="label">Scripts</span>
          </div>

          {scripts.length > 0 && (
            <ul class="script-list">
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
                    <button
                      class="delete-btn"
                      disabled={busy || s.active}
                      title={s.active ? 'Activate another script first to delete this one' : `Delete ${s.name}`}
                      aria-label={`Delete ${s.name}`}
                      onClick={() => doDelete(s.name)}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button class="add-btn" disabled={busy} onClick={startNew}>
            + New script
          </button>

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

          {statusView(scriptStatus)}
        </section>
      )}
    </>
  );
}
