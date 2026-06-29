import * as esbuild from 'esbuild';
import { uiBuildOptions } from './esbuild.config.mjs';

const ctx = await esbuild.context({ ...uiBuildOptions, sourcemap: true });
await ctx.watch();

// Honor $PORT, otherwise start at 8000 and roll forward if it's taken
// (e.g. a stale dev server) so `npm run dev` never dies on a busy port.
const start = Number(process.env.PORT) || 8000;
let port = start;

for (let attempt = 0; attempt < 20; attempt++) {
  try {
    await ctx.serve({ servedir: '.', port });
    console.log(`\n  Sieve Builder — http://localhost:${port}\n`);
    break;
  } catch (err) {
    if (err?.message?.includes('address already in use')) {
      port += 1;
      continue;
    }
    await ctx.dispose();
    throw err;
  }
}
