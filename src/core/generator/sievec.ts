/**
 * Test-only helper: validate a generated script with Dovecot Pigeonhole's
 * `sievec` compiler. If `sievec` isn't installed, callers should skip rather
 * than fail, so the suite stays green on machines without it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function hasSievec(): boolean {
  const probe = spawnSync('sievec', ['-h'], { stdio: 'ignore' });
  return probe.error === undefined;
}

export interface SievecResult {
  ok: boolean;
  stderr: string;
}

/** Compile `script` with sievec; ok=true means it is valid Sieve. */
export function compileSieve(script: string): SievecResult {
  const dir = mkdtempSync(join(tmpdir(), 'sieve-builder-'));
  try {
    const file = join(dir, 'script.sieve');
    writeFileSync(file, script);
    const run = spawnSync('sievec', [file], { encoding: 'utf8' });
    return { ok: run.status === 0, stderr: run.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
