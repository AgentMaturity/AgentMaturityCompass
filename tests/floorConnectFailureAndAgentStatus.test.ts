// connectFailureCode (src/utils/connectFailure.ts) and agentLastStatus (src/studio/agentLastStatus.ts) on the inputs
// their callers meet: fetch's wrapped causes, Node's per-address AggregateError, and run files that are absent or bare.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { connectFailureCode } from "../src/utils/connectFailure.js";
import { agentLastStatus } from "../src/studio/agentLastStatus.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";

const coded = (code: unknown, cause?: unknown) => Object.assign(new Error(`failed ${String(code)}`), { code }, cause === undefined ? {} : { cause });

describe("connectFailureCode", () => {
  test("names each never-connected code, found on the error or down fetch's cause chain", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]) expect(connectFailureCode(coded(code))).toBe(code);
    const fetchError = new TypeError("fetch failed", { cause: coded("ECONNREFUSED") });
    expect(connectFailureCode(fetchError)).toBe("ECONNREFUSED");
  });

  test("a reset, a timeout, a TLS failure or no code at all is not a connect failure", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", 111]) expect(connectFailureCode(coded(code))).toBeUndefined();
    expect(connectFailureCode(new Error("plain"))).toBeUndefined();
    expect(connectFailureCode(null)).toBeUndefined();
    expect(connectFailureCode("ECONNREFUSED")).toBeUndefined();
    expect(connectFailureCode(undefined)).toBeUndefined();
  });

  test("a code behind a getter is not trusted, and a cause chain deeper than five is not followed", () => {
    const getter = new Error("getter");
    Object.defineProperty(getter, "code", { get: () => "ECONNREFUSED" });
    expect(connectFailureCode(getter)).toBeUndefined();
    let deep: unknown = coded("ECONNREFUSED");
    for (let index = 0; index < 6; index++) deep = new Error(`wrap ${index}`, { cause: deep });
    expect(connectFailureCode(deep)).toBeUndefined();
    let shallow: unknown = coded("ENOTFOUND");
    for (let index = 0; index < 4; index++) shallow = new Error(`wrap ${index}`, { cause: shallow });
    expect(connectFailureCode(shallow)).toBe("ENOTFOUND");
  });

  test("an AggregateError counts only when every address attempt never connected", () => {
    expect(connectFailureCode(new AggregateError([coded("ECONNREFUSED"), coded("EHOSTUNREACH")]))).toBe("ECONNREFUSED");
    expect(connectFailureCode(new AggregateError([coded("ECONNREFUSED"), coded("ECONNRESET")]))).toBeUndefined();
    // Wrapped by fetch: the aggregate sits in the cause.
    expect(connectFailureCode(new TypeError("fetch failed", { cause: new AggregateError([coded("ENETUNREACH")]) }))).toBe("ENETUNREACH");
    // An empty aggregate says nothing about the attempts; its own code still decides.
    expect(connectFailureCode(Object.assign(new AggregateError([]), { code: "ECONNREFUSED" }))).toBe("ECONNREFUSED");
    expect(connectFailureCode(new AggregateError([]))).toBeUndefined();
  });
});

describe("agentLastStatus", () => {
  let workspace: string;
  let previousPass: string | undefined;
  beforeEach(() => {
    previousPass = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-agent-last-status";
    workspace = mkdtempSync(join(tmpdir(), "amc-agent-last-status-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated", witnessing: false });
  });
  afterEach(() => {
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (previousPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = previousPass;
  });

  test("an agent with no run file has no latest run", () => {
    expect(agentLastStatus(workspace, "default")).toEqual({ agentId: "default", latestRun: null });
  });

  test("a bare run file reads as INVALID and UNKNOWN with zeros, and its seal does not verify", () => {
    const runsDir = getAgentPaths(workspace, "default").runsDir;
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "bare-run.json"), "{}");
    const status = agentLastStatus(workspace, "default");
    expect(status.agentId).toBe("default");
    expect(status.latestRun).toMatchObject({ runId: "", ts: 0, integrityIndex: 0, trustLabel: "UNKNOWN", status: "INVALID", sealVerified: false });
    expect(typeof status.latestRun?.claimEligible).toBe("boolean");
    expect(status.latestRun?.claimEligible).toBe(false);
  });

  test("a hand-written run that claims VALID and a high trust label is still not seal-verified", () => {
    const runsDir = getAgentPaths(workspace, "default").runsDir;
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "older.json"), JSON.stringify({ runId: "older", ts: 1 }));
    writeFileSync(join(runsDir, "claimed.json"), JSON.stringify({ runId: "claimed", ts: 2, integrityIndex: 0.97, trustLabel: "HIGH TRUST", status: "VALID" }));
    expect(agentLastStatus(workspace, "default").latestRun).toMatchObject({
      runId: "claimed", ts: 2, integrityIndex: 0.97, trustLabel: "HIGH TRUST", status: "VALID", sealVerified: false
    });
  });
});
