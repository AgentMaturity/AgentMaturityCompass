import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { createApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { approvalConsumptionPaths, loadApprovalRequestRecord, updateApprovalRequestStatus } from "../src/approvals/approvalChainStore.js";

/*
 * A status update replaces the request body, then its signature sidecar. A reader in another process (the native
 * runtime polling for its approval while Studio records the quorum) can read the new body with the old sidecar. That
 * torn pair must be read again, not reported as tampering; a mismatch that lasts is still refused.
 */
test("a torn request/sidecar pair is re-read until consistent; a lasting digest mismatch is still refused", async () => {
  const prior = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "approval-torn-read-pass";
  const workspace = mkdtempSync(join(tmpdir(), "amc-approval-torn-"));
  try {
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initApprovalPolicy(workspace);
    const { approvalRequestId } = createApprovalForIntent({ workspace, agentId: "default", intentId: "torn-read",
      toolName: "bash", actionClass: "WRITE_HIGH", requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high",
      intentPayload: { command: "true" } }).request;
    const sig = `${approvalConsumptionPaths({ workspace, agentId: "default", approvalRequestId }).request}.sig`;
    const oldSig = readFileSync(sig);
    updateApprovalRequestStatus({ workspace, agentId: "default", approvalRequestId, status: "CANCELLED" });
    const newSig = readFileSync(sig);
    writeFileSync(sig, oldSig);
    expect(() => loadApprovalRequestRecord({ workspace, agentId: "default", approvalRequestId })).toThrow("digest mismatch");
    // A mismatch on a body written long ago is tampering, not a write in progress: refused without the wait, so a
    // tampered request cannot stall every reader for the retry budget.
    const body = approvalConsumptionPaths({ workspace, agentId: "default", approvalRequestId }).request;
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(body, longAgo, longAgo);
    const started = Date.now();
    expect(() => loadApprovalRequestRecord({ workspace, agentId: "default", approvalRequestId })).toThrow("digest mismatch");
    expect(Date.now() - started).toBeLessThan(200);
    utimesSync(body, new Date(), new Date());

    // The writer's sidecar lands while this thread is inside the read.
    const writer = new Worker(`const { parentPort } = require("node:worker_threads"); const { writeFileSync, renameSync } = require("node:fs");
      parentPort.once("message", ({ sig, bytes }) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        writeFileSync(sig + ".tmp", bytes); renameSync(sig + ".tmp", sig); parentPort.postMessage("done"); });`, { eval: true });
    try {
      await new Promise(done => writer.once("online", done));
      writer.postMessage({ sig, bytes: newSig });
      expect(loadApprovalRequestRecord({ workspace, agentId: "default", approvalRequestId }).status).toBe("CANCELLED");
    } finally { await writer.terminate(); }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
  }
}, 60_000);
