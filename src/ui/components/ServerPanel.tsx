import { useEffect, useState } from 'preact/hooks';

import type { ManageSieveClient, ScriptInfo } from '../../core/managesieve/index.js';
import type { Rule } from '../../core/model/types.js';
import { parseSieve } from '../../core/parser/parse.js';
import { connect, listAccounts } from '../../platform/thunderbird/backend.js';
import type { ImapAccount } from '../../platform/thunderbird/config.js';

interface Props {
  /** The current generated script, for saving. */
  script: string;
  /** Replace the editor's rules with ones loaded from the server. */
  onLoad: (rules: Rule[]) => void;
}

type Status = { kind: 'ok' | 'info' | 'error'; text: string } | null;

export function ServerPanel({ script, onLoad }: Props) {
  const [accounts, setAccounts] = useState<ImapAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [client, setClient] = useState<ManageSieveClient | null>(null);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
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

  const refresh = async (c: ManageSieveClient) => setScripts(await c.listScripts());

  const doConnect = () =>
    run('Connect', async () => {
      const account = accounts.find((a) => a.key === selected);
      if (!account) return { kind: 'error', text: 'Select an account first.' };
      const c = await connect(account, async () => window.prompt(`Password for ${account.username}`));
      setClient(c);
      await refresh(c);
      return { kind: 'ok', text: `Connected to ${account.host}.` };
    });

  const doDisconnect = () =>
    run('Disconnect', async () => {
      await client?.logout();
      setClient(null);
      setScripts([]);
      return { kind: 'info', text: 'Disconnected.' };
    });

  const doLoad = (name: string) =>
    run('Load', async () => {
      if (!client) return;
      const result = parseSieve(await client.getScript(name));
      onLoad(result.model.rules);
      setSaveName(name);
      return result.ok
        ? { kind: 'ok', text: `Loaded "${name}".` }
        : { kind: 'info', text: `Loaded "${name}" — ${result.issues.length} part(s) weren’t editable and were dropped.` };
    });

  const doActivate = (name: string) =>
    run('Activate', async () => {
      if (!client) return;
      await client.setActive(name);
      await refresh(client);
      return { kind: 'ok', text: `"${name}" is now active.` };
    });

  const doSave = () =>
    run('Save', async () => {
      if (!client) return;
      const name = saveName.trim();
      if (!name) return { kind: 'error', text: 'Enter a script name.' };
      await client.checkScript(script); // server-side validation; throws on error
      await client.putScript(name, script);
      if (activate) await client.setActive(name);
      await refresh(client);
      return { kind: 'ok', text: `Saved "${name}"${activate ? ' and activated it' : ''}.` };
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
        <div class="row">
          <select
            class="control grow"
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
          <button class="btn" disabled={busy || !selected} onClick={doConnect}>
            Connect
          </button>
        </div>
      ) : (
        <>
          <ul class="script-list">
            {scripts.length === 0 && <li class="muted">No scripts on the server yet.</li>}
            {scripts.map((s) => (
              <li key={s.name}>
                <span class="script-name">
                  {s.name}
                  {s.active && <span class="badge">active</span>}
                </span>
                <span class="script-actions">
                  <button class="btn-ghost" disabled={busy} onClick={() => doLoad(s.name)}>
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
            <button class="btn" disabled={busy} onClick={doSave}>
              Save
            </button>
          </div>
        </>
      )}

      {status && <div class={`panel-status ${status.kind}`}>{status.text}</div>}
    </section>
  );
}
