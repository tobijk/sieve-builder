import type { ConditionGroup as Group, ConditionMatch } from '../../core/model/types.js';
import { newGroup, newTest, removeAt, updateAt } from '../model-ops.js';
import { ConditionRow } from './ConditionRow.js';

/** How deep nesting may go. Keeps the UI legible; the model itself is unbounded. */
const MAX_DEPTH = 2;

const MATCH_OPTIONS: ReadonlyArray<{ value: ConditionMatch; label: string }> = [
  { value: 'all', label: 'ALL (AND)' },
  { value: 'any', label: 'ANY (OR)' },
];

interface Props {
  group: Group;
  onChange: (group: Group) => void;
  /** Provided for nested groups; absent for the root. */
  onRemove?: () => void;
  depth: number;
}

export function ConditionGroup({ group, onChange, onRemove, depth }: Props) {
  const isRoot = depth === 0;

  const setChild = (i: number, node: Group['children'][number]) =>
    onChange({ ...group, children: updateAt(group.children, i, node) });

  const removeChild = (i: number) => {
    const children = removeAt(group.children, i);
    // A nested group that loses its last child removes itself, rather than
    // lingering as an empty box.
    if (children.length === 0 && onRemove) onRemove();
    else onChange({ ...group, children });
  };

  return (
    <div class={isRoot ? 'clause' : 'subgroup'}>
      <div class="clause-head">
        {isRoot && <span class="label">If</span>}
        <select
          class="control"
          value={group.match}
          onChange={(e) => onChange({ ...group, match: e.currentTarget.value as ConditionMatch })}
        >
          {MATCH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span class="hint">{isRoot ? 'of these conditions' : 'of'}</span>
        {onRemove && (
          <button class="icon-btn group-remove" title="Remove group" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>

      {group.children.map((child, i) =>
        child.type === 'group' ? (
          <ConditionGroup
            key={i}
            group={child}
            depth={depth + 1}
            onChange={(g) => setChild(i, g)}
            onRemove={() => removeChild(i)}
          />
        ) : (
          <ConditionRow
            key={i}
            test={child}
            canRemove={true}
            onChange={(t) => setChild(i, t)}
            onRemove={() => removeChild(i)}
          />
        ),
      )}

      <div class="group-actions">
        <button
          class="add-btn"
          onClick={() => onChange({ ...group, children: [...group.children, newTest()] })}
        >
          + Condition
        </button>
        {depth < MAX_DEPTH && (
          <button
            class="add-btn"
            onClick={() => onChange({ ...group, children: [...group.children, newGroup()] })}
          >
            + Group
          </button>
        )}
      </div>
    </div>
  );
}
