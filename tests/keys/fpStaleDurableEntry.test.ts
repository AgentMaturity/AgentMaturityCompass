import { sign, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as fp from "../../src/assurance/falsePositiveTracker.js";
import * as records from "../../src/storage/workspaceRecordStore.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const PASS = "owned-fp-durable-entry-passphrase", AT = { area: ["assurance"], kind: "false-positives" };
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks(); fp.resetFPTrackerState();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-fp-durable-entry-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  fp.resetFPTrackerState(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), privateKey: getSigningKey(workspace, "artifact-seal"), publicKey: getSigningPublicKeyPem(workspace, "artifact-seal"),
    input: { scenarioId: "owned-scenario", packId: "owned-pack", assuranceRunId: "owned-run", response: "owned response", justification: "owned reason", reportedBy: "owned-reporter" } };
}
const path = (f: ReturnType<typeof fixture>, id: string) => join(f.workspace, ".amc", "assurance", "false-positives", id + ".json");
function check(f: ReturnType<typeof fixture>, id: string, body: Record<string, unknown>, previous: string, now: number) {
  const digest = sha256Hex(canonicalize({ ...body, prev_record_hash: previous })), signature = sign(null, Buffer.from(digest, "hex"), f.privateKey).toString("base64");
  expect(readFileSync(path(f, id), "utf8")).toBe(JSON.stringify({ ...body, prev_record_hash: previous, record_hash: digest, signature, storedTs: now }, null, 2));
  expect(verify(null, Buffer.from(digest, "hex"), f.publicKey, Buffer.from(signature, "base64"))).toBe(true); return digest;
}

describe("async FP resolution reconciles the selected durable lifecycle at entry", () => {
  test.each(["confirmed", "rejected"] as const)("a previously %s durable winner cannot be overwritten by a stale live-open cache", async status => {
    const f = fixture(), cached = fp.submitFPReport(f.input, f.workspace), original = readFileSync(path(f, cached.reportId));
    records.saveWorkspaceRecord(f.workspace, AT, cached.reportId, { ...cached, status, resolution: "durable winner" }, Date.now());
    const winner = readFileSync(path(f, cached.reportId)), spy = vi.spyOn(f.provider, "sign");
    expect(cached.status).toBe("open"); expect(fp.getFPReport(cached.reportId, f.workspace)?.status).toBe("open");
    const outcome = await fp.resolveFPReportAsync(cached.reportId, { status: status === "confirmed" ? "rejected" : "confirmed", reason: "stale loser" }, f.workspace).then(value => ({ value }), error => ({ error }));
    expect(spy).not.toHaveBeenCalled(); expect(outcome).toEqual({ value: null }); expect(readFileSync(path(f, cached.reportId))).toEqual(winner); expect(cached.status).toBe("open"); expect(cached.resolution).toBeUndefined();
    // Restore the owned predecessor to prove normal live-open/durable-envelope compatibility still succeeds.
    writeFileSync(path(f, cached.reportId), original); const head = records.workspaceRecordHead(f.workspace, AT), before = { ...cached };
    const resolved = await fp.resolveFPReportAsync(cached.reportId, { status: "confirmed", reason: "fresh" }, f.workspace); expect(resolved?.status).toBe("confirmed");
    const stored = JSON.parse(readFileSync(path(f, cached.reportId), "utf8")), digest = check(f, cached.reportId, { ...before, status: "confirmed", resolution: "fresh" }, head, stored.storedTs);
    expect(spy).toHaveBeenCalledTimes(1); expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(digest, "hex"));
  });

  test("an already-divergent durable resolution annotation refuses before Sign without comparing envelope fields", async () => {
    const f = fixture(), cached = fp.submitFPReport(f.input, f.workspace), original = readFileSync(path(f, cached.reportId));
    records.saveWorkspaceRecord(f.workspace, AT, cached.reportId, { ...cached, resolution: "durable lifecycle annotation" }, Date.now());
    const winner = readFileSync(path(f, cached.reportId)), spy = vi.spyOn(f.provider, "sign");
    const outcome = await fp.resolveFPReportAsync(cached.reportId, { status: "confirmed", reason: "stale" }, f.workspace).then(value => ({ value }), error => ({ error }));
    expect(spy).not.toHaveBeenCalled(); expect(outcome).toEqual({ value: null }); expect(readFileSync(path(f, cached.reportId))).toEqual(winner); expect(cached.status).toBe("open"); expect(cached.resolution).toBeUndefined();
    writeFileSync(path(f, cached.reportId), original); expect((await fp.resolveFPReportAsync(cached.reportId, { status: "confirmed", reason: "fresh" }, f.workspace))?.status).toBe("confirmed");
  });

  test("a cache reset preserves the loaded old-envelope replacement preimage", async () => {
    const f = fixture(), report = fp.submitFPReport(f.input, f.workspace), loaded = JSON.parse(readFileSync(path(f, report.reportId), "utf8")); fp.resetFPTrackerState();
    const spy = vi.spyOn(f.provider, "sign"), resolved = await fp.resolveFPReportAsync(report.reportId, { status: "rejected", reason: "loaded durable" }, f.workspace);
    expect(resolved?.status).toBe("rejected"); const stored = JSON.parse(readFileSync(path(f, report.reportId), "utf8"));
    const digest = check(f, report.reportId, { ...loaded, status: "rejected", resolution: "loaded durable" }, loaded.record_hash, stored.storedTs);
    expect(spy).toHaveBeenCalledTimes(1); expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(digest, "hex"));
  });

  test("retains absent-target live-only publication and omitted-workspace memory-only resolution", async () => {
    const f = fixture(), report = fp.submitFPReport(f.input), spy = vi.spyOn(f.provider, "sign"); expect(existsSync(path(f, report.reportId))).toBe(false);
    const before = { ...report }, resolved = await fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "first durable publication" }, f.workspace);
    expect(resolved?.status).toBe("confirmed"); const stored = JSON.parse(readFileSync(path(f, report.reportId), "utf8"));
    check(f, report.reportId, { ...before, status: "confirmed", resolution: "first durable publication" }, "GENESIS_FALSE_POSITIVES", stored.storedTs);
    expect(spy).toHaveBeenCalledTimes(1); const memory = fp.submitFPReport(f.input);
    expect((await fp.resolveFPReportAsync(memory.reportId, { status: "rejected", reason: "memory only" }))?.status).toBe("rejected");
    expect(spy).toHaveBeenCalledTimes(1); expect(existsSync(path(f, memory.reportId))).toBe(false);
  });
});
