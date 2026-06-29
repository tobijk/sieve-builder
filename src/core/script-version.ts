/**
 * A document-level version stamp embedded as a Sieve comment. It is metadata
 * about the stored script (not part of the rule model), used for optimistic
 * concurrency: each save writes an incremented version, and before overwriting
 * we re-read the server copy and refuse if its version moved — catching another
 * client's intervening change instead of silently clobbering it.
 */
const VERSION_RE = /^#\s*sieve-builder-version:\s*(\d+)\s*$/m;

export function versionComment(version: number): string {
  return `# sieve-builder-version: ${version}`;
}

/** The version stamped in a script, or null if it has none (foreign/legacy). */
export function parseScriptVersion(text: string): number | null {
  const match = VERSION_RE.exec(text);
  return match ? Number(match[1]) : null;
}
