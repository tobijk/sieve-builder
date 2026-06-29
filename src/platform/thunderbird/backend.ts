/**
 * Glue between the UI and the Thunderbird experiment: enumerate accounts and
 * open an authenticated ManageSieve session. The password comes from
 * Thunderbird's own store (reusing the IMAP credentials); only if that fails do
 * we ask the user.
 */
import { ManageSieveClient } from '../../core/managesieve/client.js';
import { deriveSieveConfig, type ImapAccount } from './config.js';
import { ExperimentTransport } from './experiment-transport.js';

interface SieveApi {
  listAccounts(): Promise<ImapAccount[]>;
  getPassword(accountKey: string): Promise<string | null>;
}

function maybeApi(): SieveApi | null {
  const m = (globalThis as { messenger?: { sieve?: SieveApi } }).messenger;
  return m?.sieve ?? null;
}

/** True when running inside Thunderbird with the experiment available. */
export function isThunderbird(): boolean {
  return maybeApi() !== null;
}

export function listAccounts(): Promise<ImapAccount[]> {
  const api = maybeApi();
  if (!api) throw new Error('not running inside Thunderbird');
  return api.listAccounts();
}

/**
 * Connect, upgrade to TLS when appropriate, and authenticate. `askPassword` is
 * invoked only when Thunderbird has no stored password for the account.
 */
export async function connect(
  account: ImapAccount,
  askPassword: () => Promise<string | null>,
): Promise<ManageSieveClient> {
  const api = maybeApi();
  if (!api) throw new Error('not running inside Thunderbird');

  const cfg = deriveSieveConfig(account);
  const password = (await api.getPassword(account.key)) ?? (await askPassword());
  if (!password) throw new Error('A password is required to connect.');

  const transport = await ExperimentTransport.connect(cfg.host, cfg.port);
  const client = new ManageSieveClient(transport, { requireTls: cfg.starttls });
  await client.connect();
  if (cfg.starttls) await client.startTls();
  await client.authenticate(cfg.username, password);
  return client;
}
