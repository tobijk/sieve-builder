/**
 * The transport seam. ManageSieve runs over a plain TCP stream that is upgraded
 * to TLS via STARTTLS. The client never touches sockets directly — it talks to
 * this interface, so the same protocol logic drives a Node `tls`/`net` socket
 * (standalone app) and Thunderbird's TCP experiment API (MailExtension).
 *
 * Implementations must be byte-exact: no text decoding, no line buffering, no
 * reframing. That all lives in the client, where it can be tested.
 */
export interface Transport {
  /** Send raw bytes to the server. */
  write(data: Uint8Array): Promise<void>;

  /**
   * Resolve with the next chunk of received bytes, or `null` once the peer has
   * closed the connection. Chunk boundaries are arbitrary.
   */
  read(): Promise<Uint8Array | null>;

  /** Upgrade the live connection to TLS (after the server's STARTTLS OK). */
  startTls(): Promise<void>;

  /** Close the connection. */
  close(): Promise<void>;
}
