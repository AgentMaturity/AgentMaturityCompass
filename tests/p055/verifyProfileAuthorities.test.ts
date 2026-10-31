/**
 * P0-55 cases 3 and 18: `amc imports verify-profile` admits an operator trust-list `evidence-authority` entry as an
 * authority under its key id (never pinned; revocation and a duplicate id refuse it), and reports the digest of the
 * bytes it verified, not a second read.
 */
import { sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { createImportedExternalEvidence, externalEvidenceNormalizedDigest, externalEvidenceSigningBytes } from "../../src/standard/externalEvidenceProfile.js";
import type { TrustListEntry } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { rawSignature, testKey, trustList, type TestKey } from "../trust/trustFixtures.js";

// Case 18: the profile is replaced right after the verifier read it; the report must keep the verified bytes' digest.
const swap = vi.hoisted(() => ({ after: null as null | (() => void) }));
vi.mock("../../src/standard/externalEvidenceFiles.js", async (original) => {
  const actual = await original<typeof import("../../src/standard/externalEvidenceFiles.js")>();
  return { ...actual, verifyExternalEvidenceFile: (input: Parameters<typeof actual.verifyExternalEvidenceFile>[0]) => {
    const result = actual.verifyExternalEvidenceFile(input); swap.after?.(); return result;
  } };
});
const { registerNeutralImportCommands } = await import("../../src/cli-import-commands.js");

let root: string;
let key: TestKey;
let profilePath: string;
let profileBytes: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "amc-p055-profile-"));
  key = testKey();
  const profile = createImportedExternalEvidence({
    source: { producer: "p055-producer", version: "1", originalSha256: sha256Hex("x"), mediaType: "application/x-ndjson" },
    session: { id: "child", parentSessionId: "parent" }, normalizer: "p055/1", ingestedAt: "2026-10-31T00:00:00.000Z",
    losses: ["synthetic"], events: [{ id: "e1", parentId: null, toolCallId: null, kind: "input", outcome: null, sourceTime: null,
      durationNs: null, cost: null, attributes: {} }]
  });
  profile.provenance = { trustTier: "ATTESTED", captureMethod: "producer-callback", authorityId: key.keyId };
  profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
  profile.signature = { algorithm: "ed25519", authorityId: key.keyId, value: sign(null, externalEvidenceSigningBytes(profile), key.privateKeyPem).toString("base64") };
  profileBytes = JSON.stringify(profile);
  profilePath = join(root, "profile.json");
});
afterEach(() => { swap.after = null; vi.restoreAllMocks(); writeFileSync(profilePath, profileBytes); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function listFlags(name: string, revoked = false): string[] {
  const listRoot = testKey();
  const entry: TrustListEntry = { keyId: key.keyId, algorithm: "ed25519", publicKeyPem: key.publicKeyPem, purposes: ["evidence-authority"],
    subject: "p055 authority", validFrom: "2026-01-01T00:00:00.000Z", validTo: "2099-01-01T00:00:00.000Z", source: "operator",
    authority: { producers: ["p055-producer"], captureMethods: ["producer-callback"], maxTrustTier: "ATTESTED" },
    ...(revoked ? { revokedAt: "2026-01-02T00:00:00.000Z", revocationReason: "key-compromise" as const } : {}) };
  const list = trustList([entry], { listId: name, expiresAt: "2099-01-01T00:00:00.000Z" });
  const path = join(root, `${name}.json`);
  writeFileSync(path, JSON.stringify({ list, signatures: [rawSignature(list, listRoot)] }));
  return ["--trust-list", path, "--trust-root", listRoot.keyId];
}

async function verifyProfile(args: string[]): Promise<{ code: number; body: Record<string, unknown> }> {
  writeFileSync(profilePath, profileBytes);
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { lines.push(String(line)); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  let code = 0;
  vi.spyOn(process, "exit").mockImplementation(((value?: number) => { code = value ?? 0; }) as never);
  const before = process.exitCode;
  const program = new Command().exitOverride();
  registerNeutralImportCommands(program, () => undefined);
  await program.parseAsync(["node", "amc", "imports", "verify-profile", profilePath, "--json", ...args]);
  if (process.exitCode === 1) code = 1;
  process.exitCode = before;
  return { code, body: JSON.parse(lines.join("\n")) as Record<string, unknown> };
}

test("a trust-list evidence-authority entry is an authority under its key id: exit 0, ATTESTED, no --authorities", async () => {
  const out = await verifyProfile(listFlags("admitted"));
  expect(out.code).toBe(0);
  expect(out.body).toMatchObject({ ok: true, signatureVerified: true, trustTier: "ATTESTED" });
});

test("the same entry revoked: exit 1, trustTier SELF_REPORTED", async () => {
  const out = await verifyProfile(listFlags("revoked", true));
  expect(out.code).toBe(1);
  expect(out.body).toMatchObject({ ok: false, trustTier: "SELF_REPORTED" });
});

test("the same id also in --authorities matches neither: exit 1", async () => {
  const authorities = join(root, "authorities.json");
  writeFileSync(authorities, JSON.stringify([{ id: key.keyId, publicKeyPem: key.publicKeyPem, producers: ["p055-producer"],
    captureMethods: ["producer-callback"], maxTrustTier: "ATTESTED" }]));
  const out = await verifyProfile([...listFlags("duplicate"), "--authorities", authorities]);
  expect(out.code).toBe(1);
  expect(out.body).toMatchObject({ ok: false, trustTier: "SELF_REPORTED" });
});

test("a profile replaced after the verify read reports the digest of the verified bytes", async () => {
  swap.after = () => writeFileSync(profilePath, JSON.stringify({ replaced: true }));
  const out = await verifyProfile(listFlags("swapped"));
  expect(out.code).toBe(0);
  expect((out.body.report as { artifact: { sha256: string } }).artifact.sha256).toBe(sha256Hex(profileBytes));
});
