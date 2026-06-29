// Lean test runner: discover every *.test.ts under src/ and hand them to
// Node's built-in test runner, transpiled on the fly by tsx. No Jest/Vitest.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(path));
    else if (entry.name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

const files = findTests('src');
if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

const result = spawnSync('node', ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
