import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { TurnWindow } from "../src/session/turnWindow.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { signDigestWithVault } from "../src/crypto/signing/signerVault.js";
import * as signer from "../src/crypto/signing/signer.js";
import { createNativeInteractiveBookmark, listNativeInteractiveBookmarks, navigateNativeInteractiveBookmark } from "../src/setup/nativeInteractiveBookmarks.js";

let workspace: string;
const identity = { agentId: "default", harnessVersion: "bookmark-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
beforeEach(() => {
  vi.stubEnv("AMC_SESSION_STORE", undefined); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_NO_SIGN", undefined); vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-chat-bookmarks");
  workspace = mkdtempSync(join(tmpdir(), "amc-chat-bookmarks-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { vi.restoreAllMocks(); lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });
function session(backend: "sqlite" | "jsonl" = "jsonl", seal = true, release = true, runtime: "amc" | "claude" = "amc") {
  const service = new SessionService(workspace, openSessionEventStore(workspace, backend));
  service.open({ sessionId: "bookmarked", runtime, ...identity });
  service.startTurn({ trigger: "user" }); service.recordUserMessage("private bookmarked prompt");
  service.endTurn({ reason: "complete" });
  const target = seal ? service.sealTurn() : null;
  if (!seal) service.disposeWithoutClosing();
  else if (release) service.releaseWithoutClosing();
  return target === null ? null : { ...target, service };
}
const path = (name = "checkpoint") => join(workspace, ".amc", "native-bookmarks", `${sha256Hex(name)}.json`);
const create = (name = "checkpoint", turn?: number) => createNativeInteractiveBookmark(workspace, { name, sessionId: "bookmarked", turn });

it.each(["sqlite", "jsonl"] as const)("signs and navigates an exact sealed %s turn without changing conversation or writer", async backend => {
  const target = session(backend)!;
  const before = loadSessionEventHistory({ workspace });
  const bookmark = await create();
  expect(bookmark).toMatchObject({ format: "amc-native-bookmark-v1", name: "checkpoint", sessionId: "bookmarked", turn: 1, sealEventId: target.eventId, sealEventHash: target.eventHash });
  expect(listNativeInteractiveBookmarks(workspace)).toEqual([bookmark]);
  const navigation = navigateNativeInteractiveBookmark(workspace, "checkpoint");
  expect(navigation.bookmark).toEqual(bookmark);
  expect(navigation.events.map(event => event.event_type)).toEqual(["turn/start", "user/message", "turn/end", "turn/seal"]);
  expect(loadSessionEventHistory({ workspace }).events).toEqual(before.events);
  expect(readFileSync(path(), "utf8")).not.toContain("private bookmarked prompt");
});
it("keeps a bookmark on its original turn after another turn is appended", async () => {
  const { service } = session("jsonl", true, false)!;
  const bookmark = await create();
  service.startTurn({ trigger: "user" }); service.recordUserMessage("later turn"); service.endTurn({ reason: "complete" }); service.sealTurn(); service.releaseWithoutClosing();
  expect(navigateNativeInteractiveBookmark(workspace, "checkpoint").bookmark).toEqual(bookmark);
  expect(await create("latest")).toMatchObject({ turn: 2 });
  expect(await create("first", 1)).toMatchObject({ turn: 1, sealEventHash: bookmark.sealEventHash });
});
it("returns no bookmarks without creating a directory or signing", () => {
  expect(listNativeInteractiveBookmarks(workspace)).toEqual([]);
  expect(() => navigateNativeInteractiveBookmark(workspace, "missing")).toThrow(/missing/i);
});
it.each(["", " leading", "trailing ", "bad\u001b[2J", "x".repeat(81)])("refuses invalid bookmark names %j", async name => {
  session(); await expect(create(name)).rejects.toThrow(/name/i);
});
it("refuses duplicate names and preserves the original signed record", async () => {
  session(); await create(); const before = readFileSync(path());
  await expect(create()).rejects.toThrow(/already exists/);
  expect(readFileSync(path())).toEqual(before);
});
it("refuses an unsealed turn and a missing turn", async () => {
  session("jsonl", false);
  await expect(create()).rejects.toThrow(/sealed turn/i);
  await expect(create("missing", 2)).rejects.toThrow(/sealed turn/i);
});
it.each([
  { firstEventId: "wrong" }, { lastEventId: "wrong" }, { eventCount: 999 }, { merkleRoot: "0".repeat(64) },
  { prevSealEventId: "wrong" }, { prevSealMerkleRoot: "0".repeat(64) }, { sealChainIndex: 999 }
])("refuses a real signed seal with an incorrect commitment %j", async changed => {
  const original = TurnWindow.prototype.seal;
  vi.spyOn(TurnWindow.prototype, "seal").mockImplementation(function (this: TurnWindow) { return { ...original.call(this), ...changed }; });
  session();
  // The existing metadata/payload verifier accepts this signed but false commitment.
  expect(loadSessionEventHistory({ workspace, verifyPayloads: true }).events.length).toBeGreaterThan(0);
  await expect(create()).rejects.toThrow(/seal.*verif/i);
});
it("refuses altered bookmark contents even when the digest is recomputed", async () => {
  session(); await create();
  const file = JSON.parse(readFileSync(path(), "utf8")); file.record.turn = 2;
  file.signature.digestSha256 = sha256Hex(canonicalize(file.record)); writeFileSync(path(), JSON.stringify(file));
  expect(() => listNativeInteractiveBookmarks(workspace)).toThrow(/signature/i);
  expect(() => navigateNativeInteractiveBookmark(workspace, "checkpoint")).toThrow(/signature/i);
});
it("refuses navigation when the original sealed turn was rolled back", async () => {
  session(); await create();
  const events = join(workspace, ".amc", "jsonl", "events.jsonl");
  const rows = readFileSync(events, "utf8").trim().split("\n");
  writeFileSync(events, rows.slice(0, -2).join("\n") + "\n");
  expect(() => navigateNativeInteractiveBookmark(workspace, "checkpoint")).toThrow(/sealed turn|verif|TAMPERED/i);
});
it("refuses navigation when a bookmarked turn's payload no longer verifies", async () => {
  session(); await create();
  const events = join(workspace, ".amc", "jsonl", "events.jsonl");
  const rows = readFileSync(events, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const row = rows.find(row => row.event_type === "user/message");
  expect(typeof row.payload_path).toBe("string");
  writeFileSync(join(workspace, row.payload_path), "forged prompt");
  expect(() => navigateNativeInteractiveBookmark(workspace, "checkpoint")).toThrow(/verif|TAMPERED/i);
});
it("rechecks target history after async signing and publishes nothing on refusal", async () => {
  session(); const original = signer.signDigestWithPolicyAsync;
  vi.spyOn(signer, "signDigestWithPolicyAsync").mockImplementation(async input => {
    const signature = await original(input);
    const events = join(workspace, ".amc", "jsonl", "events.jsonl"); writeFileSync(events, "");
    return signature;
  });
  await expect(create()).rejects.toThrow();
  expect(listNativeInteractiveBookmarks(workspace)).toEqual([]);
});
it("fails closed in no-sign mode", async () => {
  session(); vi.stubEnv("AMC_NO_SIGN", "1");
  await expect(create()).rejects.toThrow();
  expect(listNativeInteractiveBookmarks(workspace)).toEqual([]);
});
it("refuses symlinked bookmark files", async () => {
  session(); await create(); const file = readFileSync(path()); rmSync(path());
  const external = join(workspace, "external.json"); writeFileSync(external, file); symlinkSync(external, path());
  expect(() => listNativeInteractiveBookmarks(workspace)).toThrow(/symlink/);
});

it.each(["sealEventId", "sealEventHash"])("refuses a correctly signed bookmark that names a different %s", async field => {
  session(); await create();
  const file = JSON.parse(readFileSync(path(), "utf8")); file.record[field] = "0".repeat(64);
  file.signature = await signer.signDigestWithPolicyAsync({ workspace, kind: "BUNDLE", digestHex: sha256Hex(canonicalize(file.record)) });
  writeFileSync(path(), JSON.stringify(file));
  expect(listNativeInteractiveBookmarks(workspace)).toHaveLength(1);
  expect(() => navigateNativeInteractiveBookmark(workspace, "checkpoint")).toThrow(/no longer matches/);
});
it("refuses a correctly signed record copied under another bookmark name", async () => {
  session(); await create(); writeFileSync(path("another"), readFileSync(path()));
  expect(() => listNativeInteractiveBookmarks(workspace)).toThrow(/filename/);
  expect(() => navigateNativeInteractiveBookmark(workspace, "another")).toThrow(/filename/);
});
it("admits only one concurrent publication of the same bookmark name", async () => {
  session();
  const results = await Promise.allSettled([create(), create()]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect(listNativeInteractiveBookmarks(workspace)).toHaveLength(1);
});

it.each(["vault", "policy"])("rechecks %s authority after async signing before publishing a bookmark", async change => {
  session(); const original = signer.signDigestWithPolicyAsync;
  vi.spyOn(signer, "signDigestWithPolicyAsync").mockImplementation(async input => {
    const signature = await original(input);
    if (change === "vault") lockVault(workspace);
    else {
      const configPath = join(workspace, ".amc", "amc.config.yaml");
      const config = YAML.parse(readFileSync(configPath, "utf8")); config.keys = { requireNonExportable: true };
      writeFileSync(configPath, YAML.stringify(config));
    }
    return signature;
  });
  await expect(create()).rejects.toThrow();
  expect(listNativeInteractiveBookmarks(workspace)).toEqual([]);
});

it("refuses foreign runtime history as a native bookmark target", async () => {
  session("jsonl", true, true, "claude");
  await expect(create()).rejects.toThrow(/native session/);
});

it("refuses navigation when a valid bookmark target changes after list selection", async () => {
  const { service } = session("jsonl", true, false)!;
  const selected = await create();
  service.startTurn({ trigger: "user" }); service.recordUserMessage("second target"); service.endTurn({ reason: "complete" }); service.sealTurn(); service.releaseWithoutClosing();
  const latest = await create("latest");
  const record = { ...latest, name: "checkpoint" };
  const signature = await signer.signDigestWithPolicyAsync({ workspace, kind: "BUNDLE", digestHex: sha256Hex(canonicalize(record)) });
  writeFileSync(path(), JSON.stringify({ record, signature }));
  expect(navigateNativeInteractiveBookmark(workspace, "checkpoint").bookmark.turn).toBe(2);
  expect(() => navigateNativeInteractiveBookmark(workspace, "checkpoint", selected)).toThrow(/changed since selection/);
});

it("rechecks the complete signing policy after the signer returns", async () => {
  session(); const original = signer.signDigestWithPolicyAsync;
  vi.spyOn(signer, "signDigestWithPolicyAsync").mockImplementation(async input => {
    const signature = await original(input);
    const configPath = join(workspace, ".amc", "trust.yaml");
    const config = YAML.parse(readFileSync(configPath, "utf8"));
    config.trust.notary.requiredAttestationLevel = "HARDWARE";
    const bytes = YAML.stringify(config); writeFileSync(configPath, bytes);
    writeFileSync(`${configPath}.sig`, JSON.stringify(signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) })));
    return signature;
  });
  await expect(create()).rejects.toThrow(/policy/);
  expect(listNativeInteractiveBookmarks(workspace)).toEqual([]);
});
