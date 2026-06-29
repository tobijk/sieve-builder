// Assemble the Thunderbird MailExtension into dist-ext/: copy the static
// package files (manifest, background, experiment, icon, host page) and bundle
// the UI into dist-ext/ui/.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, cpSync } from 'node:fs';
import * as esbuild from 'esbuild';
import { uiBuildOptions } from './esbuild.config.mjs';

const OUT = 'dist-ext';

rmSync(OUT, { recursive: true, force: true });
cpSync('extension-src', OUT, { recursive: true });

await esbuild.build({
  ...uiBuildOptions,
  outdir: `${OUT}/ui`,
  minify: true,
  sourcemap: true,
});

// Package an installable .xpi (a ZIP with manifest.json at the root). Run from
// inside OUT so paths are relative to the archive root; drop dev sourcemaps.
const version = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8')).version;
const xpi = `sieve-builder-${version}.xpi`;
rmSync(xpi, { force: true });
const zip = spawnSync('zip', ['-r', '-X', '-FS', `../${xpi}`, '.', '-x', '*.map'], {
  cwd: OUT,
  stdio: 'inherit',
});
if (zip.status !== 0) {
  console.error('Failed to create the .xpi (is the `zip` tool installed?).');
  process.exit(zip.status ?? 1);
}

console.log(`\nBuilt:\n  ${OUT}/    (Load Temporary Add-on → manifest.json)\n  ${xpi}    (installable package)`);
