/** Actual two-format producer/reader tests. No provider binding, signature, or admission success is mocked. */
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { expect, test, vi } from "vitest";
import * as freeze from "../../src/drift/freezeEngine.js";
import { addPublicKeyToHistory, getPublicKeyHistory } from "../../src/crypto/keys.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { KeyProviderError } from "../../src/keys/provider.js";
import { lowS, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { setMode } from "../../src/mode/mode.js";
import { lockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { atFreezeSign, FREEZE_PASS, freezeFixture, pauseFreezeSign } from "../helpers/freezePublicationFixture.js";

function body(incident: freeze.FreezeIncident) { const { signature: _signature, ...value } = incident; return value; }
const names = (dir: string) => existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".json")) : [];
async function positive(f: ReturnType<typeof freezeFixture>) {
  const incident = await freeze.createFreezeIncidentAsync(f.params());
  expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(true);
  const lifted = await freeze.liftFreezeAsync({ workspace: f.workspace, agentId: "default", incidentId: incident.incidentId, reason: "owned clear" });
  expect(existsSync(lifted.liftPath)).toBe(true); return incident;
}

test("actual async incident and lift preserve both raw32 legacy wire formats through the real file provider", async () => {
  const f = freezeFixture(), spy = vi.spyOn(f.provider, "sign"), input = f.params(), incident = await freeze.createFreezeIncidentAsync(input);
  const payload = { v: 1, incidentId: incident.incidentId, agentId: "default", createdTs: incident.createdTs, ruleId: input.ruleId,
    previousRunId: input.previousRunId, currentRunId: input.currentRunId, deltas: input.deltas, remediation: input.remediation,
    freeze: { active: true, actionClasses: input.actionClasses, reason: input.reason } };
  const digest = sha256Hex(canonicalize(payload)), signature = sign(null, Buffer.from(digest, "hex"), f.privateKey).toString("base64");
  expect(readFileSync(f.incidentPath(incident.incidentId), "utf8")).toBe(JSON.stringify({ ...payload, signature }, null, 2));
  expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "artifact-seal" }); expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(digest, "hex"));
  expect(freeze.activeFreezeStatus(f.workspace).actionClasses).toContain("DEPLOY");
  const lift = await freeze.liftFreezeAsync({ workspace: f.workspace, agentId: "default", incidentId: incident.incidentId, reason: "owned clear" });
  const stored = JSON.parse(readFileSync(lift.liftPath, "utf8")), liftBody = { v: 1, incidentId: incident.incidentId, agentId: "default", liftedTs: stored.liftedTs, reason: "owned clear" };
  const liftDigest = sha256Hex(canonicalize(liftBody));
  expect(readFileSync(lift.liftPath, "utf8")).toBe(JSON.stringify({ ...liftBody, signature: sign(null, Buffer.from(liftDigest, "hex"), f.privateKey).toString("base64") }, null, 2));
  expect(spy).toHaveBeenCalledTimes(2); expect(Buffer.from(spy.mock.calls[1]![1])).toEqual(Buffer.from(liftDigest, "hex"));
  expect(freeze.activeFreezeStatus(f.workspace).active).toBe(false);
  await freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "repeated clear remains allowed" });
  expect(freeze.activeFreezeStatus(f.workspace).active).toBe(false);
  const { remediation: _remediation, ...defaultInput } = f.params(), legacy = freeze.createFreezeIncident(defaultInput);
  expect(legacy.remediation).toEqual({ concept: ["Clarify mission constraints and target posture for affected questions."],
    culture: ["Reinforce truth protocol and governance refusal behavior."], capabilities: ["Add regression eval coverage for failed assurance checks."],
    configuration: ["Tighten gateway/toolhub policies and re-run sandboxed evidence capture."] });
  expect(freeze.verifyIncidentSignature(f.workspace, legacy)).toBe(true);
});

test("actual Sign is awaited outside the publication lock and all original nested caller input is copied", async () => {
  const f = freezeFixture(), input = f.params(), expected = structuredClone(input), paused = pauseFreezeSign(f);
  const pending = freeze.createFreezeIncidentAsync(input), outcome = pending; let settled = false; void outcome.then(() => { settled = true; }, () => { settled = true; });
  try {
    await atFreezeSign(paused, pending); expect(settled).toBe(false); expect(names(f.dir)).toEqual([]);
    expect(existsSync(join(f.dir, ".freeze-publication.lock"))).toBe(false);
    input.deltas.overallDrop = 999; input.actionClasses.push("FINANCIAL"); input.remediation.configuration[0] = "mutated"; input.reason = "mutated";
    paused.release.resolve(); const incident = await outcome;
    expect(incident.deltas).toEqual(expected.deltas); expect(incident.freeze).toEqual({ active: true, actionClasses: expected.actionClasses, reason: expected.reason });
    expect(incident.remediation).toEqual(expected.remediation); expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(true);
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
});

test.each(["lock", "rotation", "policy"] as const)("actual checked incident refuses a post-Sign %s and a fresh restored operation succeeds", async change => {
  const f = freezeFixture(), paused = pauseFreezeSign(f), configPath = join(f.workspace, ".amc", "amc.config.yaml"), config = readFileSync(configPath);
  const pending = freeze.createFreezeIncidentAsync(f.params()), outcome = pending.then(() => null, error => error);
  try {
    await atFreezeSign(paused, pending);
    if (change === "lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); }
    if (change === "rotation") rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: FREEZE_PASS });
    if (change === "policy") { const parsed = YAML.parse(config.toString()); parsed.keys = { requireNonExportable: true }; writeFileSync(configPath, YAML.stringify(parsed)); }
    paused.release.resolve(); const error = await outcome; expect(error).toBeInstanceOf(Error); expect(names(f.dir)).toEqual([]);
    if (change !== "lock") expect(error).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(configPath, config); f.unlock(); }
  await positive(f);
});

test("final caller guard cannot change generation after the original purpose publication check", async () => {
  const f = freezeFixture(); let calls = 0;
  await expect(freeze.createFreezeIncidentForAuthority(f.params(), () => {
    if (++calls === 2) rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: FREEZE_PASS });
  })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  expect(calls).toBe(2); expect(names(f.dir)).toEqual([]); await positive(f);
});

test("genuine corrupted and unavailable file-provider answers do not publish an incident", async () => {
  const f = freezeFixture(), actual = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signed = Buffer.from(await actual(ref, bytes)); signed[0] = signed[0]! ^ 1; return signed; });
  await expect(freeze.createFreezeIncidentAsync(f.params())).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(names(f.dir)).toEqual([]);
  vi.spyOn(f.provider, "sign").mockRejectedValueOnce(new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "owned private URI=secret"));
  await expect(freeze.createFreezeIncidentAsync(f.params())).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" }); expect(names(f.dir)).toEqual([]);
  await positive(f);
});

test.each(["incident", "lift"] as const)("a concurrent selected %s replacement wins instead of being silently rebased", async selected => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()), source = f.incidentPath(incident.incidentId), before = readFileSync(source), paused = pauseFreezeSign(f);
  const pending = freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "paused clear" }), outcome = pending.then(() => null, error => error);
  const winner = Buffer.from(selected === "incident" ? before.toString().replace("owned freeze reason", "concurrent incident") : "owned concurrent lift bytes");
  const target = selected === "incident" ? source : f.liftPath(incident.incidentId);
  try {
    await atFreezeSign(paused, pending); writeFileSync(target, winner); paused.release.resolve();
    expect(await outcome).toMatchObject({ message: "freeze source or destination changed while signing was prepared" }); expect(readFileSync(target)).toEqual(winner);
    if (selected === "incident") expect(existsSync(f.liftPath(incident.incidentId))).toBe(false);
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(source, before); if (existsSync(f.liftPath(incident.incidentId))) unlinkSync(f.liftPath(incident.incidentId)); }
  await freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "fresh restored clear" });
  expect(freeze.activeFreezeStatus(f.workspace).active).toBe(false);
});

test("unrelated incident and other-agent publication remain legitimate during a selected lift Sign", async () => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()), paused = pauseFreezeSign(f);
  const pending = freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "selected clear" });
  try {
    await atFreezeSign(paused, pending); mkdirSync(join(f.workspace, ".amc", "agents", "another-agent"), { recursive: true }); const other = freeze.createFreezeIncident({ ...f.params(), agentId: "another-agent" });
    const sibling = freeze.createFreezeIncident(f.params()); paused.release.resolve(); await pending;
    expect(freeze.verifyIncidentSignature(f.workspace, other)).toBe(true); expect(freeze.activeFreezeStatus(f.workspace).incidentIds).toEqual([sibling.incidentId]);
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
});

test("freeze lift uses the actual existing mode key initially and again after real Sign", async () => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()), spy = vi.spyOn(f.provider, "sign"); setMode(f.workspace, "agent");
  await expect(freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "agent denied" })).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled(); setMode(f.workspace, "owner"); spy.mockRestore();
  const paused = pauseFreezeSign(f), pending = freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "late mode denied" }), outcome = pending.then(() => null, error => error);
  try { await atFreezeSign(paused, pending); setMode(f.workspace, "agent"); paused.release.resolve(); expect(await outcome).toBeInstanceOf(Error); expect(existsSync(f.liftPath(incident.incidentId))).toBe(false); }
  finally { paused.release.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
  await freeze.liftFreezeAsync({ workspace: f.workspace, incidentId: incident.incidentId, reason: "owner restored" });
});

test("retained sync no-sign semantics stay explicit while async refuses an ephemeral mismatched signature", async () => {
  const f = freezeFixture(); vi.stubEnv("AMC_NO_SIGN", "1");
  const real = await freeze.createFreezeIncidentAsync(f.params()); expect(freeze.verifyIncidentSignature(f.workspace, real)).toBe(true);
  lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  const before = names(f.dir); await expect(freeze.createFreezeIncidentAsync(f.params())).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(names(f.dir)).toEqual(before);
  const legacy = freeze.createFreezeIncident(f.params()); expect(freeze.verifyIncidentSignature(f.workspace, legacy)).toBe(false);
  unlinkSync(f.incidentPath(legacy.incidentId)); f.unlock(); expect(freeze.verifyIncidentSignature(f.workspace, await freeze.createFreezeIncidentAsync(f.params()))).toBe(true);
});

test.each(["incident", "lift"] as const)("raw-valid config-purpose %s signatures in broad auditor history cannot clear or authenticate artifact authority", format => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()); rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: FREEZE_PASS });
  const key = getSigningKey(f.workspace, "config-signature"), pub = getSigningPublicKeyPem(f.workspace, "config-signature");
  expect(getPublicKeyHistory(f.workspace, "auditor")).toContain(pub); expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pub);
  const path = format === "incident" ? f.incidentPath(incident.incidentId) : freeze.liftFreeze({ workspace: f.workspace, incidentId: incident.incidentId, reason: "valid old clear" }).liftPath;
  const before = readFileSync(path), parsed = JSON.parse(before.toString()), { signature: _signature, ...payload } = parsed, digest = sha256Hex(canonicalize(payload));
  parsed.signature = sign(null, Buffer.from(digest, "hex"), key).toString("base64"); expect(verify(null, Buffer.from(digest, "hex"), pub, Buffer.from(parsed.signature, "base64"))).toBe(true);
  try { writeFileSync(path, JSON.stringify(parsed, null, 2)); if (format === "incident") expect(freeze.verifyIncidentSignature(f.workspace, parsed)).toBe(false); expect(freeze.activeFreezeStatus(f.workspace).active).toBe(true); }
  finally { writeFileSync(path, before); }
  expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(true); expect(freeze.activeFreezeStatus(f.workspace).active).toBe(format === "incident");
});

test("authenticated imported-only unbound Ed and P256 histories preserve raw32 compatibility without normal binding", () => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params());
  for (const curve of ["ed25519", "p256"] as const) {
    const key = curve === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pub = key.publicKey.export({ type: "spki", format: "pem" }).toString(); addPublicKeyToHistory(f.workspace, "auditor", pub, "imported");
    expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pub);
    const digest = Buffer.from(sha256Hex(canonicalize(body(incident))), "hex");
    const signature = curve === "ed25519" ? sign(null, digest, key.privateKey) : lowS(sign("sha256", digest, { key: key.privateKey, dsaEncoding: "ieee-p1363" }));
    expect(verifyCanonical(curve === "ed25519" ? "ed25519" : "ecdsa-p256-sha256", digest, pub, signature)).toBe(true);
    expect(freeze.verifyIncidentSignature(f.workspace, { ...incident, signature: signature.toString("base64") })).toBe(true);
    const lift = { v: 1, incidentId: incident.incidentId, agentId: "default", liftedTs: Date.now(), reason: "explicit imported math only" }, liftDigest = Buffer.from(sha256Hex(canonicalize(lift)), "hex");
    const liftSignature = curve === "ed25519" ? sign(null, liftDigest, key.privateKey) : lowS(sign("sha256", liftDigest, { key: key.privateKey, dsaEncoding: "ieee-p1363" }));
    writeFileSync(f.liftPath(incident.incidentId), JSON.stringify({ ...lift, signature: liftSignature.toString("base64") }, null, 2));
    expect(freeze.activeFreezeStatus(f.workspace).active).toBe(false); unlinkSync(f.liftPath(incident.incidentId));
  }
  const rolePath = join(f.workspace, ".amc", "keys", "auditor_history.json"), role = readFileSync(rolePath);
  try { const forged = JSON.parse(role.toString()); forged.entries[0].source = "imported"; writeFileSync(rolePath, JSON.stringify(forged));
    // The current artifact key can still verify its own incident; an unauthenticated imported entry cannot add a candidate.
    const another = generateKeyPairSync("ed25519"), signature = sign(null, Buffer.from(sha256Hex(canonicalize(body(incident))), "hex"), another.privateKey).toString("base64");
    forged.entries.push({ ...forged.entries[0], publicKeyPem: another.publicKey.export({ type: "spki", format: "pem" }).toString() }); writeFileSync(rolePath, JSON.stringify(forged));
    expect(freeze.verifyIncidentSignature(f.workspace, { ...incident, signature })).toBe(false);
  } finally { writeFileSync(rolePath, role); }
  expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(true);
});


test.each(["missing", "corrupt"] as const)("complete default authority refuses a %s auditor alias instead of weakening exact-purpose readers", fault => {
  const f = freezeFixture(), incident = freeze.createFreezeIncident(f.params()), alias = join(f.workspace, ".amc", "keys", "auditor_ed25519.pub"), original = readFileSync(alias);
  expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(true);
  try {
    if (fault === "missing") unlinkSync(alias); else writeFileSync(alias, generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }));
    expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(false); expect(freeze.activeFreezeStatus(f.workspace).integrityProblems.length).toBeGreaterThan(0);
  } finally { writeFileSync(alias, original); }
  expect(freeze.verifyIncidentSignature(f.workspace, incident)).toBe(true);
});


test("an unbound configured artifact ref refuses before any SDK/file Sign without enabling normal binding", async () => {
  const f = freezeFixture(), configPath = join(f.workspace, ".amc", "amc.config.yaml"), before = readFileSync(configPath), spy = vi.spyOn(f.provider, "sign");
  try {
    const config = YAML.parse(before.toString()); config.keys = { refs: { "artifact-seal": { provider: "aws-kms", id: "arn:aws:kms:eu-west-1:111122223333:key/owned-not-live-freeze" } } };
    writeFileSync(configPath, YAML.stringify(config));
    await expect(freeze.createFreezeIncidentAsync(f.params())).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
    expect(spy).not.toHaveBeenCalled(); expect(names(f.dir)).toEqual([]);
  } finally { writeFileSync(configPath, before); }
  await positive(f);
});

test("a conflicting incident target created at real post-Sign serialization is preserved by the final CAS", async () => {
  const f = freezeFixture(), stringify = JSON.stringify, winner = Buffer.from("owned concurrent incident target"); let target: string | undefined;
  const hook = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown, replacer?: any, space?: any) => {
    const bytes = stringify(value, replacer, space), record = value as { incidentId?: unknown; signature?: unknown; freeze?: unknown } | null;
    if (target === undefined && record?.freeze !== undefined && typeof record.incidentId === "string" && typeof record.signature === "string") {
      target = f.incidentPath(record.incidentId); writeFileSync(target, winner);
    }
    return bytes;
  }) as typeof JSON.stringify);
  try {
    // Create the ordinary directory before the adversary writes its conflicting target; no production seam is added.
    mkdirSync(f.dir, { recursive: true });
    await expect(freeze.createFreezeIncidentAsync(f.params())).rejects.toThrow("freeze source or destination changed");
    expect(target).toBeDefined(); expect(readFileSync(target!)).toEqual(winner);
  } finally { hook.mockRestore(); if (target && existsSync(target)) unlinkSync(target); }
  await positive(f);
});


test("a real live-owner publication-lock collision refuses after Sign without writing an incident", async () => {
  const f = freezeFixture(), stringify = JSON.stringify, lock = join(f.dir, ".freeze-publication.lock"), owner = JSON.stringify({ pid: process.pid, token: "11111111-1111-4111-8111-111111111111" });
  const spy = vi.spyOn(f.provider, "sign"); let armed = true;
  mkdirSync(f.dir, { recursive: true });
  const hook = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown, replacer?: any, space?: any) => {
    const bytes = stringify(value, replacer, space), record = value as { freeze?: unknown; signature?: unknown } | null;
    if (armed && record?.freeze !== undefined && typeof record.signature === "string") { armed = false; writeFileSync(lock, owner); }
    return bytes;
  }) as typeof JSON.stringify);
  try {
    const error = await freeze.createFreezeIncidentAsync(f.params()).then(() => null, failure => failure);
    expect(error).toMatchObject({ name: "ControlFileLockError", code: "LOCK_TIMEOUT" }); expect(spy).toHaveBeenCalledTimes(1);
    expect(readFileSync(lock, "utf8")).toBe(owner); expect(names(f.dir)).toEqual([]);
  } finally { hook.mockRestore(); if (existsSync(lock)) unlinkSync(lock); }
  await positive(f);
}, 20_000);
