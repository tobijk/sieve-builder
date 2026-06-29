import type { Action } from '../../core/model/types.js';
import { defaultAction } from '../model-ops.js';

interface Props {
  action: Action;
  onChange: (action: Action) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const ACTION_LABELS: ReadonlyArray<{ type: Action['type']; label: string }> = [
  { type: 'fileinto', label: 'File into' },
  { type: 'redirect', label: 'Redirect to' },
  { type: 'addflag', label: 'Mark as' },
  { type: 'keep', label: 'Keep in Inbox' },
  { type: 'discard', label: 'Delete' },
  { type: 'stop', label: 'Stop processing' },
  { type: 'vacation', label: 'Auto-reply' },
];

const FLAGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '\\Seen', label: 'Read' },
  { value: '\\Flagged', label: 'Flagged' },
  { value: '\\Answered', label: 'Answered' },
  { value: '\\Deleted', label: 'Deleted' },
];

export function ActionRow({ action, onChange, onRemove, canRemove }: Props) {
  return (
    <div class="row">
      <select
        class="control"
        value={action.type}
        onChange={(e) => onChange(defaultAction(e.currentTarget.value as Action['type']))}
      >
        {ACTION_LABELS.map((a) => (
          <option key={a.type} value={a.type}>
            {a.label}
          </option>
        ))}
      </select>

      {action.type === 'fileinto' && (
        <>
          <input
            class="control grow"
            type="text"
            required
            placeholder="Folder, e.g. INBOX/Lists"
            value={action.mailbox}
            onInput={(e) => onChange({ ...action, mailbox: e.currentTarget.value })}
          />
          <label class="check">
            <input
              type="checkbox"
              checked={action.create === true}
              onChange={(e) => onChange({ ...action, create: e.currentTarget.checked })}
            />
            create
          </label>
        </>
      )}

      {action.type === 'redirect' && (
        <>
          <input
            class="control grow"
            type="email"
            required
            placeholder="address@example.com"
            value={action.address}
            onInput={(e) => onChange({ ...action, address: e.currentTarget.value })}
          />
          <label class="check">
            <input
              type="checkbox"
              checked={action.copy === true}
              onChange={(e) => onChange({ ...action, copy: e.currentTarget.checked })}
            />
            keep copy
          </label>
        </>
      )}

      {(action.type === 'addflag' || action.type === 'setflag' || action.type === 'removeflag') && (
        <select
          class="control grow"
          value={action.flags[0] ?? '\\Seen'}
          onChange={(e) => onChange({ ...action, flags: [e.currentTarget.value] })}
        >
          {FLAGS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}

      {action.type === 'vacation' && (
        <>
          <input
            class="control grow"
            type="text"
            required
            placeholder="Reply message"
            value={action.reason}
            onInput={(e) => onChange({ ...action, reason: e.currentTarget.value })}
          />
          <span class="size-input">
            <input
              class="control"
              type="number"
              min="1"
              value={action.days ?? 7}
              onInput={(e) => onChange({ ...action, days: Number(e.currentTarget.value) })}
            />
            <span class="unit">days</span>
          </span>
        </>
      )}

      <button class="icon-btn" title="Remove action" aria-label="Remove action" disabled={!canRemove} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}
