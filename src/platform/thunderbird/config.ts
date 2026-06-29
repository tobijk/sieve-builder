/**
 * Derive ManageSieve connection settings from a Thunderbird incoming-mail
 * account. Pure and unit-tested; the experiment API supplies the account data
 * and the UI may let the user override the result.
 *
 * ManageSieve normally lives on the same host as IMAP, on port 4190 with
 * STARTTLS. Thunderbird socket types: 0=none, 1=trySTARTTLS(deprecated),
 * 2=alwaysSTARTTLS, 3=SSL/TLS.
 */
export interface ImapAccount {
  /** Thunderbird incoming-server key. */
  key: string;
  name: string;
  host: string;
  username: string;
  port: number;
  socketType: number;
  type: string;
}

export interface SieveConfig {
  host: string;
  port: number;
  username: string;
  /** Whether to issue STARTTLS before authenticating. */
  starttls: boolean;
}

export const DEFAULT_SIEVE_PORT = 4190;

export function deriveSieveConfig(account: ImapAccount): SieveConfig {
  return {
    host: account.host,
    port: DEFAULT_SIEVE_PORT,
    username: account.username,
    // If the IMAP account uses any encryption, use STARTTLS for sieve too.
    starttls: account.socketType !== 0,
  };
}
