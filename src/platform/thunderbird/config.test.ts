import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SIEVE_PORT, deriveSieveConfig, type ImapAccount } from './config.js';

const base: ImapAccount = {
  key: 'account1',
  name: 'Work',
  host: 'mail.example.com',
  username: 'alice@example.com',
  port: 993,
  socketType: 3,
  type: 'imap',
  oauth: false,
};

test('derives sieve host/username from the IMAP account, port 4190', () => {
  const cfg = deriveSieveConfig(base);
  assert.equal(cfg.host, 'mail.example.com');
  assert.equal(cfg.username, 'alice@example.com');
  assert.equal(cfg.port, DEFAULT_SIEVE_PORT);
  assert.equal(cfg.starttls, true);
});

test('encrypted IMAP (SSL or STARTTLS) implies STARTTLS for sieve', () => {
  assert.equal(deriveSieveConfig({ ...base, socketType: 2 }).starttls, true);
  assert.equal(deriveSieveConfig({ ...base, socketType: 3 }).starttls, true);
});

test('plaintext IMAP (socketType none) implies no STARTTLS', () => {
  assert.equal(deriveSieveConfig({ ...base, socketType: 0 }).starttls, false);
});
