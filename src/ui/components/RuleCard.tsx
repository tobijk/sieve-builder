import type { ConditionMatch, Rule, Test } from '../../core/model/types.js';
import { defaultAction, removeAt, updateAt } from '../model-ops.js';
import { ActionRow } from './ActionRow.js';
import { ConditionRow } from './ConditionRow.js';

interface Props {
  rule: Rule;
  onChange: (rule: Rule) => void;
  onRemove: () => void;
}

const NEW_TEST: Test = { type: 'header', fields: ['Subject'], match: 'contains', values: [''] };

export function RuleCard({ rule, onChange, onRemove }: Props) {
  const patch = (p: Partial<Rule>) => onChange({ ...rule, ...p });

  return (
    <article class={`rule${rule.enabled ? '' : ' disabled'}`}>
      <header class="rule-head">
        <label class="switch" title={rule.enabled ? 'Enabled' : 'Disabled'}>
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => patch({ enabled: e.currentTarget.checked })}
          />
          <span class="slider" />
        </label>

        <input
          class="rule-name"
          type="text"
          value={rule.name}
          placeholder="Rule name"
          onInput={(e) => patch({ name: e.currentTarget.value })}
        />

        <button class="icon-btn" title="Delete rule" onClick={onRemove}>
          🗑
        </button>
      </header>

      <div class="clause">
        <div class="clause-head">
          <span class="label">If</span>
          <select
            class="control"
            value={rule.match}
            onChange={(e) => patch({ match: e.currentTarget.value as ConditionMatch })}
          >
            <option value="all">all of</option>
            <option value="any">any of</option>
          </select>
          <span class="hint">these conditions</span>
        </div>

        {rule.tests.map((test, i) => (
          <ConditionRow
            key={i}
            test={test}
            canRemove={rule.tests.length > 1}
            onChange={(t) => patch({ tests: updateAt(rule.tests, i, t) })}
            onRemove={() => patch({ tests: removeAt(rule.tests, i) })}
          />
        ))}

        <button class="add-btn" onClick={() => patch({ tests: [...rule.tests, NEW_TEST] })}>
          + Condition
        </button>
      </div>

      <div class="clause">
        <div class="clause-head">
          <span class="label">Then</span>
        </div>

        {rule.actions.map((action, i) => (
          <ActionRow
            key={i}
            action={action}
            canRemove={rule.actions.length > 1}
            onChange={(a) => patch({ actions: updateAt(rule.actions, i, a) })}
            onRemove={() => patch({ actions: removeAt(rule.actions, i) })}
          />
        ))}

        <button
          class="add-btn"
          onClick={() => patch({ actions: [...rule.actions, defaultAction('fileinto')] })}
        >
          + Action
        </button>
      </div>
    </article>
  );
}
