// Orchestrates the ManageSieve integration tests: start Dovecot in Docker,
// wait for it, run the gated tests, then tear the container down.
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const NAME = 'sb-dovecot';
const IMAGE = 'dovecot/dovecot:2.3-latest';
const cwd = process.cwd();

const docker = (args, opts = {}) => spawnSync('docker', args, { stdio: 'inherit', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.setTimeout(1000);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

docker(['rm', '-f', NAME], { stdio: 'ignore' });

const run = docker([
  'run', '-d', '--name', NAME, '-p', '4190:4190',
  '-v', `${cwd}/docker/dovecot.conf:/etc/dovecot/dovecot.conf:ro`,
  '-v', `${cwd}/docker/users:/etc/dovecot/users:ro`,
  IMAGE,
]);
if (run.status !== 0) {
  console.error('Could not start the Dovecot container (is Docker running?).');
  process.exit(1);
}

let exitCode = 1;
try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await portOpen(4190);
    if (!ready) await sleep(500);
  }
  if (!ready) {
    console.error('Dovecot did not start listening on 4190 in time.');
    docker(['logs', NAME]);
  } else {
    await sleep(1000); // let the login service settle
    const result = spawnSync(
      'node',
      ['--import', 'tsx', '--test', 'test/integration/managesieve.test.ts'],
      { stdio: 'inherit' },
    );
    exitCode = result.status ?? 1;
  }
} finally {
  docker(['rm', '-f', NAME], { stdio: 'ignore' });
}

process.exit(exitCode);
