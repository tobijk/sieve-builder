/**
 * SASL mechanisms for ManageSieve authentication. A mechanism produces an
 * optional initial response and then responds to server challenges; the client
 * drives the exchange (see client.ts `runSasl`). Raw bytes here; the driver
 * handles base64 and the protocol framing.
 *
 * SCRAM is built entirely on Web Crypto (PBKDF2/HMAC/SHA), so it needs no
 * dependency and runs in the browser, the Thunderbird extension, and Node.
 */
import { base64, fromBase64 } from './protocol.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

const NUL = String.fromCharCode(0); // SASL PLAIN field separator
const SOH = String.fromCharCode(1); // XOAUTH2 (^A) field separator

// Web Crypto's lib types want ArrayBuffer-backed views; our Uint8Arrays always
// are, so this assertion is safe.
const bs = (b: Uint8Array): BufferSource => b as unknown as BufferSource;

export interface SaslMechanism {
  readonly name: string;
  /** Initial client response, or null if the mechanism sends none. */
  start(): Promise<Uint8Array | null>;
  /** Response to a server challenge. */
  next(challenge: Uint8Array): Promise<Uint8Array>;
}

const EMPTY = new Uint8Array(0);

export function plainMechanism(username: string, password: string): SaslMechanism {
  return {
    name: 'PLAIN',
    async start() {
      return enc.encode(`${NUL}${username}${NUL}${password}`); // authzid <NUL> authcid <NUL> passwd
    },
    async next() {
      return EMPTY;
    },
  };
}

export function xoauth2Mechanism(username: string, token: string): SaslMechanism {
  return {
    name: 'XOAUTH2',
    async start() {
      return enc.encode(`user=${username}${SOH}auth=Bearer ${token}${SOH}${SOH}`);
    },
    // On failure the server sends a base64 error challenge expecting an empty
    // response before the final NO.
    async next() {
      return EMPTY;
    },
  };
}

export type ScramHash = 'SHA-1' | 'SHA-256';

export function scramMechanism(username: string, password: string, hash: ScramHash): SaslMechanism {
  const subtle = globalThis.crypto.subtle;
  const clientNonce = randomNonce();
  const clientFirstBare = `n=${escapeName(username)},r=${clientNonce}`;
  let authMessage = '';
  let expectedServerSignature: Uint8Array | null = null;
  let sawServerFirst = false;

  const hmac = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
    const k = await subtle.importKey('raw', bs(key), { name: 'HMAC', hash }, false, ['sign']);
    return new Uint8Array(await subtle.sign('HMAC', k, bs(data)));
  };
  const digest = async (data: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await subtle.digest(hash, bs(data)));

  return {
    name: hash === 'SHA-256' ? 'SCRAM-SHA-256' : 'SCRAM-SHA-1',

    async start() {
      return enc.encode(`n,,${clientFirstBare}`); // GS2 header "n,," + client-first-bare
    },

    async next(challenge: Uint8Array): Promise<Uint8Array> {
      const text = dec.decode(challenge);
      const attrs = parseAttributes(text);

      if (!sawServerFirst) {
        sawServerFirst = true;
        const combinedNonce = attrs.r ?? '';
        if (!combinedNonce.startsWith(clientNonce)) {
          throw new Error('SCRAM: server nonce does not extend the client nonce');
        }
        const salt = fromBase64(attrs.s ?? '');
        const iterations = Number(attrs.i ?? '0');
        if (!(iterations > 0)) throw new Error('SCRAM: invalid iteration count');

        const saltedPassword = await pbkdf2(subtle, enc.encode(password), salt, iterations, hash);
        const clientKey = await hmac(saltedPassword, enc.encode('Client Key'));
        const storedKey = await digest(clientKey);
        const clientFinalNoProof = `c=biws,r=${combinedNonce}`; // biws = base64("n,,")
        authMessage = `${clientFirstBare},${text},${clientFinalNoProof}`;
        const clientSignature = await hmac(storedKey, enc.encode(authMessage));
        const clientProof = xor(clientKey, clientSignature);

        const serverKey = await hmac(saltedPassword, enc.encode('Server Key'));
        expectedServerSignature = await hmac(serverKey, enc.encode(authMessage));

        return enc.encode(`${clientFinalNoProof},p=${base64(clientProof)}`);
      }

      // server-final: verify the server's signature (mutual auth).
      if (attrs.e) throw new Error(`SCRAM: server error: ${attrs.e}`);
      if (expectedServerSignature && attrs.v && base64(expectedServerSignature) !== attrs.v) {
        throw new Error('SCRAM: server signature verification failed');
      }
      return EMPTY;
    },
  };
}

// --- helpers ----------------------------------------------------------------

function randomNonce(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return base64(bytes); // base64 contains no ',' so it's a valid SCRAM nonce
}

/** SCRAM username escaping (RFC 5802 §5.1): ',' and '=' are special. */
function escapeName(name: string): string {
  return name.replace(/=/g, '=3D').replace(/,/g, '=2C');
}

function parseAttributes(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of message.split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

async function pbkdf2(
  subtle: SubtleCrypto,
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  hash: ScramHash,
): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', bs(password), 'PBKDF2', false, ['deriveBits']);
  const bits = (hash === 'SHA-256' ? 32 : 20) * 8;
  return new Uint8Array(
    await subtle.deriveBits({ name: 'PBKDF2', salt: bs(salt), iterations, hash }, key, bits),
  );
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! ^ b[i]!;
  return out;
}
