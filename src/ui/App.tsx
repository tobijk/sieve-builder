import { useMemo, useState } from 'preact/hooks';

import { generate } from '../core/generator/generate.js';
import type { Rule, SieveModel } from '../core/model/types.js';
import { validateModel } from '../core/model/validate.js';
import { isThunderbird } from '../platform/thunderbird/backend.js';
import { ImportDialog } from './components/ImportDialog.js';
import { Preview } from './components/Preview.js';
import { RuleCard } from './components/RuleCard.js';
import { ServerPanel } from './components/ServerPanel.js';
import { newRule, removeAt, updateAt } from './model-ops.js';

export function App() {
  const [model, setModel] = useState<SieveModel>({ rules: [] });
  const [importing, setImporting] = useState(false);
  // Inside Thunderbird the user must load the current filters from the server
  // before editing, so we don't overwrite them blind. On the web there is no
  // server, so editing is always available.
  const [loaded, setLoaded] = useState(!isThunderbird());

  const script = useMemo(() => generate(model), [model]);
  const problems = useMemo(() => validateModel(model), [model]);

  const setRules = (rules: SieveModel['rules']) => setModel({ ...model, rules });

  const loadImported = (rules: Rule[]) => {
    setModel({ rules });
    setImporting(false);
    setLoaded(true);
  };

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="mark" aria-hidden="true" />
          <span class="title">Sieve Builder</span>
        </div>
        <button class="btn-ghost" disabled={!loaded} onClick={() => setImporting(true)}>
          Import
        </button>
      </header>

      {importing && <ImportDialog onLoad={loadImported} onClose={() => setImporting(false)} />}

      <main class="layout">
        <section class="rules">
          {!loaded ? (
            <p class="empty">
              Load your current filters from the server (right) before editing, so your changes
              build on what’s already there.
            </p>
          ) : (
            <>
              {problems.length > 0 && (
                <div class="banner" role="status">
                  {problems.length} incomplete {problems.length === 1 ? 'field' : 'fields'} — fill{' '}
                  {problems.length === 1 ? 'it' : 'them'} in before saving.
                </div>
              )}

              {model.rules.map((rule, i) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onChange={(r) => setRules(updateAt(model.rules, i, r))}
                  onRemove={() => setRules(removeAt(model.rules, i))}
                />
              ))}

              {model.rules.length === 0 && (
                <p class="empty">No rules yet. Add one to get started.</p>
              )}

              <button class="btn" onClick={() => setRules([...model.rules, newRule()])}>
                + Add rule
              </button>
            </>
          )}
        </section>

        <aside class="side">
          {isThunderbird() && (
            <ServerPanel model={model} onLoad={loadImported} incomplete={problems.length > 0} />
          )}
          <Preview script={script} />
        </aside>
      </main>
    </div>
  );
}
