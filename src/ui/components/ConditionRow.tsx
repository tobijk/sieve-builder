import type { Test } from '../../core/model/types.js';
import {
  CUSTOM,
  FIELD_OPTIONS,
  customName,
  fieldKey,
  matchKey,
  matchOptions,
  sizeMB,
  textValue,
  withCustomName,
  withField,
  withMatch,
  withSizeMB,
  withText,
  type MatchKey,
} from '../condition.js';

interface Props {
  test: Test;
  onChange: (test: Test) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function ConditionRow({ test, onChange, onRemove, canRemove }: Props) {
  const field = fieldKey(test);
  const isCustom = field === CUSTOM;

  return (
    <div class="row">
      <select
        class="control"
        value={field}
        onChange={(e) => onChange(withField(test, e.currentTarget.value))}
      >
        {FIELD_OPTIONS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
        <option value={CUSTOM}>Other header…</option>
      </select>

      {isCustom && (
        <input
          class="control"
          type="text"
          placeholder="Header name"
          value={customName(test)}
          onInput={(e) => onChange(withCustomName(test, e.currentTarget.value))}
        />
      )}

      <select
        class="control"
        value={matchKey(test)}
        onChange={(e) => onChange(withMatch(test, e.currentTarget.value as MatchKey))}
      >
        {matchOptions(test).map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>

      {test.type === 'size' ? (
        <span class="size-input">
          <input
            class="control"
            type="number"
            min="0"
            step="0.1"
            value={sizeMB(test)}
            onInput={(e) => onChange(withSizeMB(test, Number(e.currentTarget.value)))}
          />
          <span class="unit">MB</span>
        </span>
      ) : (
        <input
          class="control grow"
          type="text"
          placeholder="value"
          value={textValue(test)}
          onInput={(e) => onChange(withText(test, e.currentTarget.value))}
        />
      )}

      <button
        class="icon-btn"
        title="Remove condition"
        disabled={!canRemove}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
