/**
 * Integration tests against a real Dovecot ManageSieve server. These are NOT
 * part of `npm test` (which stays offline); run `npm run test:integration`,
 * which starts Dovecot in Docker first. If no server is reachable the tests
 * skip rather than fail.
 */
import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';

import { ManageSieveClient, ManageSieveError, generate, type SieveModel } from '../../src/core/index.js';
import { NodeTransport } from '../../src/platform/node/transport.js';

const HOST = process.env.MANAGESIEVE_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MANAGESIEVE_PORT ?? 4190);
const USER = process.env.MANAGESIEVE_USER ?? 'test';
const PASS = process.env.MANAGESIEVE_PASS ?? 'secret';

function reachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const skip = (await reachable()) ? false : `no ManageSieve server at ${HOST}:${PORT}`;

async function authedClient(): Promise<ManageSieveClient> {
  const transport = await NodeTransport.connect({ host: HOST, port: PORT });
  const client = new ManageSieveClient(transport, { requireTls: false });
  await client.connect();
  await client.authenticate(USER, PASS);
  return client;
}

const UNICODE_MODEL: SieveModel = {
  rules: [
    {
      id: '1',
      name: 'Integration',
      enabled: true,
      root: {
        type: 'group',
        match: 'all',
        children: [
          { type: 'header', fields: ['Subject'], match: 'contains', values: ['stätement 😀'], comparator: 'i;octet' },
        ],
      },
      actions: [
        { type: 'fileinto', mailbox: 'INBOX/Integration', create: true },
        { type: 'stop' },
      ],
    },
  ],
};

test('store, activate, fetch (byte-identical), and delete a script', { skip }, async () => {
  const client = await authedClient();
  try {
    const script = generate(UNICODE_MODEL);
    assert.deepEqual(await client.checkScript(script), {}, 'script should validate without warnings');

    await client.putScript('sb-it', script);
    await client.setActive('sb-it');

    const list = await client.listScripts();
    assert.ok(list.some((s) => s.name === 'sb-it' && s.active), 'script should be listed as active');

    // The round-trip proves UTF-8 literal framing end-to-end.
    assert.equal(await client.getScript('sb-it'), script);

    await client.setActive(null);
    await client.deleteScript('sb-it');
    assert.ok(!(await client.listScripts()).some((s) => s.name === 'sb-it'));
  } finally {
    await client.logout();
  }
});

test('authenticates via SCRAM-SHA-256 when the server offers it', { skip }, async () => {
  const transport = await NodeTransport.connect({ host: HOST, port: PORT });
  const client = new ManageSieveClient(transport, { requireTls: false });
  await client.connect();
  assert.ok(client.capabilities.sasl.has('SCRAM-SHA-256'), 'server should offer SCRAM-SHA-256');
  // authenticate() auto-selects SCRAM-SHA-256 over PLAIN; success proves the handshake.
  await client.authenticate(USER, PASS);
  await client.logout();
});

test('a fresh server has no scripts and getScript reports a missing one', { skip }, async () => {
  const client = await authedClient();
  try {
    // getScript on a name that doesn't exist must throw (the empty-server Save
    // path relies on catching this as "doesn't exist").
    await assert.rejects(
      () => client.getScript('definitely-not-here'),
      (err: unknown) => err instanceof ManageSieveError,
    );
  } finally {
    await client.logout();
  }
});

test('deleting the active script fails with code ACTIVE', { skip }, async () => {
  const client = await authedClient();
  try {
    await client.putScript('sb-it-active', 'keep;\r\n');
    await client.setActive('sb-it-active');
    await assert.rejects(
      () => client.deleteScript('sb-it-active'),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'ACTIVE');
        return true;
      },
    );
  } finally {
    await authedClient().then(async (cleanup) => {
      await cleanup.setActive(null);
      await cleanup.deleteScript('sb-it-active').catch(() => {});
      await cleanup.logout();
    });
    await client.logout();
  }
});
