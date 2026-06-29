import { useMemo, useState } from 'preact/hooks';

import { generate } from '../core/generator/generate.js';
import type { Rule, SieveModel } from '../core/model/types.js';
import { isThunderbird } from '../platform/thunderbird/backend.js';
import { ImportDialog } from './components/ImportDialog.js';
import { Preview } from './components/Preview.js';
import { RuleCard } from './components/RuleCard.js';
import { ServerPanel } from './components/ServerPanel.js';
import { newRule, removeAt, uid, updateAt } from './model-ops.js';

const STARTER: SieveModel = {
  rules: [
    {
      id: uid(),
      name: 'Finance',
      enabled: true,
      root: {
        type: 'group',
        match: 'all',
        children: [
          { type: 'header', fields: ['Subject'], match: 'contains', values: ['statement'], comparator: 'i;octet' },
          {
            type: 'group',
            match: 'any',
            children: [
              { type: 'address', part: 'all', fields: ['From'], match: 'contains', values: ['@mybank.com'], comparator: 'i;octet' },
              { type: 'address', part: 'all', fields: ['From'], match: 'contains', values: ['@mybroker.com'], comparator: 'i;octet' },
            ],
          },
        ],
      },
      actions: [
        { type: 'fileinto', mailbox: 'INBOX/Finance', create: true },
        { type: 'stop' },
      ],
    },
  ],
};

export function App() {
  const [model, setModel] = useState<SieveModel>(STARTER);
  const [importing, setImporting] = useState(false);
  const script = useMemo(() => generate(model), [model]);

  const setRules = (rules: SieveModel['rules']) => setModel({ ...model, rules });

  const loadImported = (rules: Rule[]) => {
    setModel({ rules });
    setImporting(false);
  };

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="mark" aria-hidden="true" />
          <span class="title">Sieve Builder</span>
        </div>
        <button class="btn-ghost" onClick={() => setImporting(true)}>
          Import
        </button>
      </header>

      {importing && <ImportDialog onLoad={loadImported} onClose={() => setImporting(false)} />}

      <main class="layout">
        <section class="rules">
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
        </section>

        <aside class="side">
          {isThunderbird() && <ServerPanel script={script} onLoad={loadImported} />}
          <Preview script={script} />
        </aside>
      </main>
    </div>
  );
}
