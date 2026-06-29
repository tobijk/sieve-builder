// Shared esbuild options for the UI bundle. Kept in one place so dev and
// production builds stay identical apart from minify/serve.
export const uiBuildOptions = {
  entryPoints: ['src/ui/main.tsx'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  // Thunderbird 128 ESR is the floor (see manifest strict_min_version); the web
  // dev preview runs in modern browsers, so one baseline covers both.
  target: ['firefox128'],
  logLevel: 'info',
};
