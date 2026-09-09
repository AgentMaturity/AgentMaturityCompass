import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { NativeTaskDescriptors, nativeTaskId, taskBodyHash, type NativeTaskDescriptor } from "../src/studio/nativeTaskDescriptors.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { signHexDigest } from "../src/crypto/keys.js";

let root: string, prior: string | undefined, store: NativeTaskDescriptors;
beforeEach(() => {
  prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = "synthetic-studio-descriptor-vault";
  root = mkdtempSync(join(tmpdir(), "amc-task-descriptor-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); store = new NativeTaskDescriptors(root);
});
afterEach(() => { lockVault(root); rmSync(root, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior; });
function descriptor(): NativeTaskDescriptor {
  const clientRequestId = randomUUID();
  return { kind: "amc/studio-native-task/v1", taskId: nativeTaskId("owner-fixture", clientRequestId), principalId: "owner-fixture",
    agentId: "default", demo: true, sessionId: "native-fixture-session", provider: "stub", model: null, tools: "none", toolsDigest: null,
    maxSteps: 2, maxTokens: 64, createdAt: 1, updatedAt: 1, revision: 1, pendingTurn: true, closed: false,
    submissions: [{ clientRequestId, bodyHash: taskBodyHash({ prompt: "synthetic-private-prompt-canary" }), revision: 1 }] };
}
test("signed descriptor survives restart without copying prompt text or relaxing its owner", () => {
  const d = descriptor(); store.lock(() => store.write(d));
  expect(new NativeTaskDescriptors(root).read(d.taskId)).toEqual(d);
  expect(readFileSync(join(store.directory, `${d.taskId}.json`), "utf8")).not.toContain("synthetic-private-prompt-canary");
  const path = join(store.directory, `${d.taskId}.json`);
  const tampered = JSON.parse(readFileSync(path, "utf8")); tampered.descriptor.principalId = "different-owner";
  writeFileSync(path, JSON.stringify(tampered));
  expect(() => store.read(d.taskId)).toThrow("did not verify");
});
test("optional public-check pins preserve legacy signatures and bind new task check identities", () => {
  const legacy = descriptor(); store.lock(() => store.write(legacy));
  const legacyPath = join(store.directory, `${legacy.taskId}.json`), legacyBytes = readFileSync(legacyPath);
  expect(store.read(legacy.taskId)).not.toHaveProperty("validation");
  expect(readFileSync(legacyPath)).toEqual(legacyBytes);
  const selected: NativeTaskDescriptor = { ...descriptor(), demo: false, tools: "workspace", toolsDigest: "a".repeat(64),
    validation: { configSha256: "b".repeat(64), checkIds: ["public_unit", "types"] } };
  store.lock(() => store.write(selected));
  expect(new NativeTaskDescriptors(root).read(selected.taskId)?.validation).toEqual(selected.validation);
  const path = join(store.directory, `${selected.taskId}.json`), envelope = JSON.parse(readFileSync(path, "utf8"));
  envelope.descriptor.validation.checkIds.reverse(); writeFileSync(path, JSON.stringify(envelope));
  expect(() => store.read(selected.taskId)).toThrow("did not verify");
  expect(() => store.write({ ...selected, demo: true })).toThrow();
  expect(() => store.write({ ...selected, tools: "none", toolsDigest: null })).toThrow();
});
test("a forged signature cannot be admitted by planting a legacy auditor history array", () => {
  const d = descriptor(); store.lock(() => store.write(d));
  const attacker = generateKeyPairSync("ed25519");
  const publicKeyPem = attacker.publicKey.export({ type: "spki", format: "pem" }).toString();
  writeFileSync(join(root, ".amc", "keys", "auditor_history.json"), JSON.stringify([{ publicKeyPem }]));
  const privateKeyPem = attacker.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  writeFileSync(join(store.directory, `${d.taskId}.json`), JSON.stringify({ descriptor: d, signature: signHexDigest(taskBodyHash(d), privateKeyPem) }));
  expect(() => store.read(d.taskId)).toThrow("did not verify");
});
test("descriptor schema refuses extra transcript fields, nonmonotonic revisions and demo tool escalation", () => {
  const d = descriptor();
  expect(() => { store.lock(() => store.write({ ...d, revision: 2 })); }).toThrow();
  expect(() => { store.lock(() => store.write({ ...d, tools: "workspace", toolsDigest: "a".repeat(64) })); }).toThrow();
  expect(() => { store.lock(() => store.write(Object.assign({}, d, { prompt: "synthetic-transcript" }))); }).toThrow();
});
test("signed descriptor cannot be selected through a symlink or unbounded input", () => {
  const d = descriptor(); store.lock(() => store.write(d));
  const file = join(store.directory, `${d.taskId}.json`), copy = join(root, "copy.json");
  writeFileSync(copy, readFileSync(file)); rmSync(file); symlinkSync(copy, file);
  expect(() => store.read(d.taskId)).toThrow("did not verify");
  rmSync(file); writeFileSync(file, " ".repeat(32 * 1024 + 1));
  expect(() => store.read(d.taskId)).toThrow("did not verify");
});

test("archival is optional signed metadata and retains every submission across restart", () => {
  const legacy = descriptor(); store.lock(() => store.write(legacy));
  const path = join(store.directory, `${legacy.taskId}.json`), before = readFileSync(path);
  expect(store.read(legacy.taskId)).not.toHaveProperty("archivedAt");
  expect(readFileSync(path)).toEqual(before);
  const archived = { ...legacy, pendingTurn: false, closed: true, archivedAt: 2, updatedAt: 2 };
  store.lock(() => store.write(archived));
  const restarted = new NativeTaskDescriptors(root);
  expect(restarted.list()).toEqual([]);
  expect(restarted.list(true)).toEqual([archived]);
  expect([...restarted.scan()]).toEqual([archived]);
  expect(restarted.read(legacy.taskId)?.submissions).toEqual(legacy.submissions);

  const envelope = JSON.parse(readFileSync(path, "utf8")); delete envelope.descriptor.archivedAt;
  writeFileSync(path, JSON.stringify(envelope));
  expect(() => restarted.read(legacy.taskId)).toThrow("did not verify");
  expect(() => restarted.list()).toThrow("did not verify");
});

test("archival metadata cannot describe an open, uncertain, unrecorded or inconsistent task", () => {
  const archived = { ...descriptor(), pendingTurn: false, closed: true, archivedAt: 2, updatedAt: 2 };
  for (const patch of [{ closed: false }, { pendingTurn: true }, { sessionId: null }, { archivedAt: 0 }, { archivedAt: 3 }]) {
    expect(() => store.lock(() => store.write({ ...archived, ...patch }))).toThrow();
  }
});

test("retained archives do not impose a second history cap or disappear from identity scans", () => {
  const retained = Array.from({ length: 257 }, () => ({ ...descriptor(), pendingTurn: false, closed: true, archivedAt: 2, updatedAt: 2 }));
  const current = descriptor();
  store.lock(() => { for (const row of [...retained, current]) store.write(row); });
  expect(store.list()).toEqual([current]);
  expect(new Set(store.list(true).map(row => row.taskId))).toEqual(new Set([...retained, current].map(row => row.taskId)));
  expect(new Set([...store.scan()].flatMap(row => row.submissions.map(submission => submission.clientRequestId))))
    .toEqual(new Set([...retained, current].flatMap(row => row.submissions.map(submission => submission.clientRequestId))));
});
