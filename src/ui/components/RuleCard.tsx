import type { Rule } from '../../core/model/types.js';
import { defaultAction, removeAt, updateAt } from '../model-ops.js';
import { ActionRow } from './ActionRow.js';
import { ConditionGroup } from './ConditionGroup.js';

interface Props {
  rule: Rule;
  onChange: (rule: Rule) => void;
  onRemove: () => void;
}

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

      <ConditionGroup
        group={rule.root}
        depth={0}
        onChange={(root) => patch({ root })}
      />

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
