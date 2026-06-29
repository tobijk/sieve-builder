import { useState } from 'preact/hooks';

interface Props {
  script: string;
}

export function Preview({ script }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail quietly.
    }
  };

  return (
    <section class="preview">
      <div class="preview-head">
        <span class="label">Sieve script</span>
        <button class="btn-ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre class="code">
        <code>{script}</code>
      </pre>
    </section>
  );
}
