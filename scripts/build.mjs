import * as esbuild from 'esbuild';
import { uiBuildOptions } from './esbuild.config.mjs';

await esbuild.build({ ...uiBuildOptions, minify: true, sourcemap: true });
console.log('Built UI to dist/');
