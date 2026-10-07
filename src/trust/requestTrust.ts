/** Body fields that would let a request add pins or allow flags. */
const REQUEST_TRUST_FIELDS = [
  "pubkey", "pubkeyPath", "pubkeyPemFile", "publicKey", "publicKeyPath", "publicKeyPem", "trust", "trustList", "trustLists", "trustRoot", "trustRoots",
  "allowUnpinned", "allowUnanchored", "expectMonitor", "expectedMonitorFingerprint"
] as const;

/**
 * API routes verify with the server operator's trust context (loadTrustContext over the server's AMC home), never
 * with trust a request supplies (P0-09 step 11). Returns the refusal message for a body that tries, else null.
 */
export function requestTrustOverride(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const field = REQUEST_TRUST_FIELDS.find(name => Object.hasOwn(body, name));
  return field ? `request field "${field}" is refused: verification trust comes only from the server operator's trust list` : null;
}
