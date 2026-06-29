// Assemble the Thunderbird MailExtension into dist-ext/: copy the static
// package files (manifest, background, experiment, icon, host page) and bundle
// the UI into dist-ext/ui/.
import * as esbuild from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
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

console.log(`Built MailExtension into ${OUT}/ (load via about:debugging or zip it).`);
