import { useMemo, useState } from 'preact/hooks';

import { generate } from '../core/generator/generate.js';
import type { Rule, SieveModel } from '../core/model/types.js';
import { validateModel } from '../core/model/validate.js';
import { isThunderbird } from '../platform/thunderbird/backend.js';
import { ImportDialog } from './components/ImportDialog.js';
import { OutOfOffice } from './components/OutOfOffice.js';
import { Preview } from './components/Preview.js';
import { RuleCard } from './components/RuleCard.js';
import { ServerPanel } from './components/ServerPanel.js';
import { newRule, removeAt, updateAt } from './model-ops.js';
import { isOooRule } from './ooo.js';

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

  // The out-of-office responder is the first rule of the recognized shape; it
  // renders as the dedicated card and is skipped in the generic rule list.
  const oooIndex = model.rules.findIndex(isOooRule);
  const ruleCount = model.rules.length - (oooIndex >= 0 ? 1 : 0);

  const setOoo = (r: Rule | null) => {
    if (oooIndex >= 0) {
      setRules(r ? updateAt(model.rules, oooIndex, r) : removeAt(model.rules, oooIndex));
    } else if (r) {
      // New responder goes first, so a later rule's `stop` can't silence it.
      setRules([r, ...model.rules]);
    }
  };

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id="brandMark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#4f46e5" />
                <stop offset="1" stop-color="#ec4899" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#brandMark)" />
            <path d="M18 22 h28 l-11 13 v9 l-6 3 v-12 z" fill="#fff" fill-opacity="0.95" />
          </svg>
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

              <OutOfOffice rule={oooIndex >= 0 ? model.rules[oooIndex]! : null} onChange={setOoo} />

              {model.rules.map((rule, i) =>
                i === oooIndex ? null : (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onChange={(r) => setRules(updateAt(model.rules, i, r))}
                    onRemove={() => setRules(removeAt(model.rules, i))}
                  />
                ),
              )}

              {ruleCount === 0 && (
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
            <ServerPanel
              model={model}
              onLoad={loadImported}
              incomplete={problems.length > 0}
              loaded={loaded}
            />
          )}
          {loaded && <Preview script={script} />}
        </aside>
      </main>
    </div>
  );
}
