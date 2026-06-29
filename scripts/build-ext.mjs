// Assemble the Thunderbird MailExtension into dist-ext/: copy the static
// package files (manifest, background, experiment, icon, host page) and bundle
// the UI into dist-ext/ui/.
import * as esbuild from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

const OUT = 'dist-ext';

rmSync(OUT, { recursive: true, force: true });
cpSync('extension-src', OUT, { recursive: true });

await esbuild.build({
  entryPoints: ['src/ui/main.tsx'],
  bundle: true,
  outdir: `${OUT}/ui`,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  target: ['firefox115'],
  minify: true,
  sourcemap: true,
});

console.log(`Built MailExtension into ${OUT}/ (load via about:debugging or zip it).`);
