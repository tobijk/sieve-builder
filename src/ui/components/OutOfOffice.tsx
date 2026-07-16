import type { Rule } from '../../core/model/types.js';
import { readOoo, writeOoo, type OooSettings } from '../ooo.js';

interface Props {
  /** The rule backing the responder, or null when none exists yet. */
  rule: Rule | null;
  /** null asks the parent to remove the rule (responder off and empty). */
  onChange: (rule: Rule | null) => void;
}

export function OutOfOffice({ rule, onChange }: Props) {
  const s = readOoo(rule);
  const patch = (p: Partial<OooSettings>) => onChange(writeOoo(rule, { ...s, ...p }));

  return (
    <article class={`rule ooo${s.enabled ? ' on' : ''}`}>
      <header class="rule-head">
        <label class="switch" title={s.enabled ? 'Turn auto-reply off' : 'Turn auto-reply on'}>
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => patch({ enabled: e.currentTarget.checked })}
          />
          <span class="slider" />
        </label>

        <div class="ooo-title">
          <span class="ooo-name">Out of office</span>
          <span class="ooo-sub">
            {rule !== null && !s.enabled
              ? 'Off — your message is kept'
              : 'Automatically answer mail while you’re away'}
          </span>
        </div>

        {s.enabled && <span class="badge">Active</span>}
      </header>

      {/* Slim while off: the switch reveals the form (and creates the rule). */}
      {s.enabled && (
      <div class="ooo-body">
        <label class="ooo-field">
          <span class="label">Subject</span>
          <input
            class="control"
            type="text"
            placeholder="Auto: (the original subject)"
            value={s.subject}
            onInput={(e) => patch({ subject: e.currentTarget.value })}
          />
        </label>

        <label class="ooo-field">
          <span class="label">Message</span>
          <textarea
            class="control ooo-message"
            required={s.enabled}
            rows={4}
            placeholder="I’m away and will reply when I’m back. For urgent matters, contact …"
            value={s.message}
            onInput={(e) => patch({ message: e.currentTarget.value })}
          />
        </label>

        <div class="row ooo-opts">
          <span class="ooo-opt">
            <span class="label">From</span>
            <input
              class="control"
              type="date"
              max={s.until || undefined}
              value={s.from}
              onInput={(e) => patch({ from: e.currentTarget.value })}
            />
          </span>
          <span class="ooo-opt">
            <span class="label">Until</span>
            <input
              class="control"
              type="date"
              min={s.from || undefined}
              value={s.until}
              onInput={(e) => patch({ until: e.currentTarget.value })}
            />
          </span>
          <span class="ooo-opt ooo-days">
            <span class="label">Reply every</span>
            <input
              class="control"
              type="number"
              min="1"
              value={s.days}
              onInput={(e) => patch({ days: Number(e.currentTarget.value) })}
            />
            <span class="unit">days per sender</span>
          </span>
        </div>

        <p class="hint">
          Dates are optional — leave them empty and use the switch. Mailing lists and automated
          mail are never answered.
        </p>
      </div>
      )}
    </article>
  );
}
