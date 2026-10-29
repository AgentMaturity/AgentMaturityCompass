import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureSigningKeys, getSigningKey, signHexDigest } from "../../src/crypto/keys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";

/** Writes a run/assurance report sealed the way the runner seals it: hash with seal fields emptied, sign with the artifact-seal key. */
export function writeSealedReport(workspace: string, dir: string, name: string, report: object): string {
  ensureSigningKeys(workspace);
  const base = { ...report, reportJsonSha256: "", runSealSig: "" };
  const hash = sha256Hex(canonicalize(base));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ ...base, reportJsonSha256: hash, runSealSig: signHexDigest(hash, getSigningKey(workspace, "artifact-seal")) }, null, 2));
  return file;
}

/** Edits a sealed file in place without resealing it — what an attacker with workspace write access can do. */
export function tamperReport(file: string, edit: (report: Record<string, unknown>) => void): void {
  const report = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  edit(report);
  writeFileSync(file, JSON.stringify(report, null, 2));
}
