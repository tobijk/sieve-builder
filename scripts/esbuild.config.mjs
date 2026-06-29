// Shared esbuild options for the UI bundle. Kept in one place so dev and
// production builds stay identical apart from minify/serve.
export const uiBuildOptions = {
  entryPoints: ['src/ui/main.tsx'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  target: ['es2022'],
  logLevel: 'info',
};
