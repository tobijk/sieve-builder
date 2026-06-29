import * as esbuild from 'esbuild';
import { uiBuildOptions } from './esbuild.config.mjs';

const ctx = await esbuild.context({ ...uiBuildOptions, sourcemap: true });
await ctx.watch();

const { port } = await ctx.serve({ servedir: '.', port: 8000 });
console.log(`\n  Sieve Builder — http://localhost:${port}\n`);
