import { useMemo, useState } from 'preact/hooks';

import type { Rule } from '../../core/model/types.js';
import { parseSieve } from '../../core/parser/parse.js';
import { summarizeParse } from '../parse-summary.js';

interface Props {
  onLoad: (rules: Rule[]) => void;
  onClose: () => void;
}

export function ImportDialog({ onLoad, onClose }: Props) {
  const [text, setText] = useState('');
  const result = useMemo(() => (text.trim() ? parseSieve(text) : null), [text]);

  const summary = result ? summarizeParse(result) : null;
  const ruleCount = summary?.ruleCount ?? 0;
  const canLoad = ruleCount > 0;

  return (
    <div class="overlay" onClick={onClose}>
      <div class="dialog" onClick={(e) => e.stopPropagation()}>
        <header class="dialog-head">
          <span class="title">Import Sieve script</span>
          <button class="icon-btn" title="Close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <textarea
          class="import-area"
          placeholder={'Paste a Sieve script here…'}
          spellcheck={false}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />

        {result && (
          <div class={`import-status${result.ok ? ' ok' : ' warn'}`}>
            {result.ok ? (
              <span>✓ {summary!.text}</span>
            ) : (
              <div>
                <strong>Some parts weren’t recognized</strong> — loading will keep only the{' '}
                {ruleCount} rule{ruleCount === 1 ? '' : 's'} below and drop the rest:
                <ul>
                  {result.issues.slice(0, 6).map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                  {result.issues.length > 6 && <li>…and {result.issues.length - 6} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <footer class="dialog-foot">
          <button class="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            class="btn"
            disabled={!canLoad}
            onClick={() => result && onLoad(result.model.rules)}
          >
            {result && !result.ok ? `Load ${ruleCount} recognized` : 'Load'}
          </button>
        </footer>
      </div>
    </div>
  );
}
