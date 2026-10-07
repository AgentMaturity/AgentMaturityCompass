import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

/**
 * C2SP signed notes and transparency-log checkpoints (P1-26), per c2sp.org/signed-note and c2sp.org/tlog-checkpoint
 * as read on 8 Oct 2026. Pure: node:crypto only, so offline verifiers can use it.
 *
 * A note is UTF-8 text ending in a newline, a blank line, then signature lines `— <key name> <base64(key ID || sig)>`.
 * Key IDs are 4 bytes: SHA-256(name || 0x0A || 0x01 || 32-byte key)[:4] for Ed25519 (signature over the text), and
 * SHA-256(SPKI DER)[:4] for ECDSA (ASN.1 signature over SHA-256 of the text, as Rekor v2 signs). Signatures from keys
 * the verifier does not know are ignored; a signature from a known key that fails rejects the note.
 */
export const NOTE_MAX_BYTES = 64 * 1024;
const MAX_SIGNATURES = 64;
const SIGNATURE_LINE = /^— (\S+) ([A-Za-z0-9+/]+={0,2})$/;

function sha256(...parts: Uint8Array[]): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

export function isValidKeyName(name: string): boolean {
  return name.length > 0 && !/[\s+]/u.test(name);
}

/** The signature type and 4-byte key ID a key signs notes under. Ed25519 and ECDSA (P-256, P-384, P-521) only. */
function noteKey(name: string, publicKey: KeyObject): { type: "ed25519" | "ecdsa"; keyId: Buffer } {
  const spki = publicKey.export({ format: "der", type: "spki" });
  if (publicKey.asymmetricKeyType === "ed25519") {
    return { type: "ed25519", keyId: sha256(Buffer.from(name, "utf8"), Uint8Array.of(0x0a, 0x01), spki.subarray(spki.length - 32)).subarray(0, 4) };
  }
  const curve = publicKey.asymmetricKeyDetails?.namedCurve;
  if (publicKey.asymmetricKeyType === "ec" && (curve === "prime256v1" || curve === "secp384r1" || curve === "secp521r1")) {
    return { type: "ecdsa", keyId: sha256(spki).subarray(0, 4) };
  }
  throw new Error("a note key must be Ed25519 or ECDSA on P-256, P-384 or P-521");
}

/** Throws unless `publicKeyPem` is a key notes can be verified with. */
export function assertNoteKey(publicKeyPem: string): void {
  noteKey("x", createPublicKey(publicKeyPem));
}

/** Splits a signed note into its text and signature lines; throws when it is not well formed. */
export function parseSignedNote(note: Uint8Array): { text: string; signatures: Array<{ name: string; keyId: Buffer; signature: Buffer }> } {
  if (note.length > NOTE_MAX_BYTES) throw new Error(`a signed note may not exceed ${NOTE_MAX_BYTES} bytes`);
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(note);
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(decoded)) throw new Error("a signed note may not contain control characters other than newline");
  const split = decoded.lastIndexOf("\n\n");
  if (split < 0 || !decoded.endsWith("\n")) throw new Error("a signed note needs text, a blank line and signature lines, each ending in a newline");
  const lines = decoded.slice(split + 2, -1).split("\n");
  if (lines.length > MAX_SIGNATURES) throw new Error(`a signed note may carry at most ${MAX_SIGNATURES} signatures`);
  const signatures = lines.map((line) => {
    const match = SIGNATURE_LINE.exec(line);
    const raw = match ? Buffer.from(match[2]!, "base64") : null;
    if (!match || !raw || raw.length < 5 || raw.toString("base64") !== match[2]) throw new Error(`malformed signature line: ${line.slice(0, 80)}`);
    return { name: match[1]!, keyId: raw.subarray(0, 4), signature: raw.subarray(4) };
  });
  return { text: decoded.slice(0, split + 1), signatures };
}

/**
 * The note's text when a signature by `name` under `publicKeyPem` verifies; null when that key did not sign it or a
 * signature claiming to be from it fails. Other keys' signatures are ignored. Throws when the note is malformed.
 */
export function verifySignedNote(note: Uint8Array, verifier: { name: string; publicKeyPem: string }): string | null {
  const { text, signatures } = parseSignedNote(note);
  const key = createPublicKey(verifier.publicKeyPem);
  const { type, keyId } = noteKey(verifier.name, key);
  const mine = signatures.filter((line) => line.name === verifier.name && line.keyId.equals(keyId));
  const valid = (signature: Buffer): boolean => {
    try {
      return type === "ed25519" ? verify(null, Buffer.from(text, "utf8"), key, signature) : verify("sha256", Buffer.from(text, "utf8"), key, signature);
    } catch {
      return false;
    }
  };
  return mine.length > 0 && mine.every((line) => valid(line.signature)) ? text : null;
}

/** Signs `text` with an Ed25519 key under key name `name`. */
export function signNote(text: string, name: string, privateKeyPem: string): string {
  if (!isValidKeyName(name)) throw new Error(`invalid note key name "${name}"`);
  if (!text.endsWith("\n")) throw new Error("note text must end in a newline");
  const privateKey = createPrivateKey(privateKeyPem);
  const { type, keyId } = noteKey(name, createPublicKey(privateKey));
  if (type !== "ed25519") throw new Error("AMC signs notes with Ed25519 keys only");
  const signature = sign(null, Buffer.from(text, "utf8"), privateKey);
  const note = `${text}\n— ${name} ${Buffer.concat([keyId, signature]).toString("base64")}\n`;
  parseSignedNote(Buffer.from(note, "utf8"));
  return note;
}

export interface Checkpoint {
  origin: string;
  treeSize: number;
  /** Lowercase hex of the 32-byte root. */
  rootHash: string;
  extensions: string[];
}

/** The c2sp.org/tlog-checkpoint body: origin, tree size, base64 root hash, then optional extension lines. */
export function formatCheckpoint(checkpoint: Checkpoint): string {
  if (!isValidKeyName(checkpoint.origin)) throw new Error(`invalid checkpoint origin "${checkpoint.origin}"`);
  if (!Number.isSafeInteger(checkpoint.treeSize) || checkpoint.treeSize < 0) throw new Error("invalid checkpoint tree size");
  if (!/^[0-9a-f]{64}$/.test(checkpoint.rootHash)) throw new Error("a checkpoint root must be a sha256 hex digest");
  if (checkpoint.extensions.some((line) => line.length === 0 || /[\n—]/u.test(line))) throw new Error("extension lines must be non-empty single lines");
  return [checkpoint.origin, String(checkpoint.treeSize), Buffer.from(checkpoint.rootHash, "hex").toString("base64"), ...checkpoint.extensions]
    .map((line) => `${line}\n`).join("");
}

/** Parses a checkpoint body; throws when it is not exactly the c2sp.org/tlog-checkpoint form. */
export function parseCheckpoint(text: string): Checkpoint {
  const lines = text.split("\n");
  const [origin, size, root] = lines;
  const rootBytes = Buffer.from(root ?? "", "base64");
  if (lines.length < 4 || lines[lines.length - 1] !== "" || !origin || !isValidKeyName(origin)
    || !/^(0|[1-9][0-9]*)$/.test(size ?? "") || !Number.isSafeInteger(Number(size))
    || rootBytes.length !== 32 || rootBytes.toString("base64") !== root || lines.slice(3, -1).some((line) => line.length === 0)) {
    throw new Error("not a c2sp.org/tlog-checkpoint body");
  }
  return { origin, treeSize: Number(size), rootHash: rootBytes.toString("hex"), extensions: lines.slice(3, -1) };
}
