import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import type { ComparisonFilePin } from "./harnessComparisonSchema.js";

export interface ComparisonArtifact { path: string; sha256: string; bytes: number; redacted: true }
export const comparisonSha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export function redactComparisonText(text: string, secrets: readonly string[] = []): string {
  let safe = text;
  for (const secret of [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length)) safe = safe.split(secret).join("<AMC_REDACTED>");
  // The shared detector identifies a PEM header. Persisted benchmark captures
  // must remove the entire block as well, including its body.
  safe = safe.replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|$)/g, "<AMC_REDACTED_PRIVATE_KEY>");
  return redactSecrets(safe, () => "<AMC_REDACTED>").redacted;
}

export function redactComparisonValue(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") return redactComparisonText(value, secrets);
  if (Array.isArray(value)) return value.map(item => redactComparisonValue(item, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [redactComparisonText(key, secrets), redactComparisonValue(child, secrets)]));
  return value;
}

export function readComparisonFile(path: string, limit = 1_048_576): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > limit) throw new Error("Comparison input is missing, nonregular or oversized.");
    const bytes = Buffer.alloc(info.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    if (size !== info.size || fstatSync(fd).size !== info.size) throw new Error("Comparison input changed while being read.");
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}

/** Bounded-memory hashing; pins authorize files, never directories or symlinks. */
export function resolveComparisonPin(pin: ComparisonFilePin, baseDirectory: string): string {
  const path = isAbsolute(pin.path) ? pin.path : resolve(baseDirectory, pin.path);
  if (lstatSync(path).isSymbolicLink()) throw new Error("Comparison pins must resolve explicit files, not symlink aliases.");
  const canonical = realpathSync(path);
  const fd = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > 536_870_912) throw new Error("Pinned artifact is not a supported regular file.");
    const hash = createHash("sha256");
    const block = Buffer.alloc(65_536);
    let offset = 0;
    for (;;) {
      const count = readSync(fd, block, 0, block.length, offset);
      if (!count) break;
      offset += count;
      if (offset > 536_870_912) throw new Error("Pinned artifact exceeded its byte budget.");
      hash.update(block.subarray(0, count));
    }
    const after = fstatSync(fd);
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || hash.digest("hex") !== pin.sha256) throw new Error("Pinned artifact digest did not match.");
    return canonical;
  } finally { closeSync(fd); }
}

export function writeComparisonArtifact(directory: string, name: string, value: unknown, secrets: readonly string[], text = false): ComparisonArtifact {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error("Invalid comparison artifact name.");
  const safe = text ? redactComparisonText(String(value), secrets) : JSON.stringify(redactComparisonValue(value, secrets), null, 2) + "\n";
  writeFileSync(resolve(directory, name), safe, { mode: 0o600, flag: "wx" });
  return { path: name, sha256: comparisonSha256(safe), bytes: Buffer.byteLength(safe), redacted: true };
}
