import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { exportSessionBundle, verifySessionExport as verifyBundleExport } from "../../src/evidence/sessionExport.js";
import { buildSessionExport, verifySessionExport } from "../../src/observability/sessionExport.js";
import { renderSessionExportHtml } from "../../src/observability/sessionExportHtml.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { SessionService } from "../../src/session/sessionService.js";
import { signTrustList } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { plainSummary } from "../../packages/verifier/src/cli.js";
import { verifyArtifact } from "../../packages/verifier/src/index.js";
import { exitCode } from "../../packages/verifier/src/report.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const verifyBundle = (bundle: unknown, fp: string) => verifyBundleExport({ bundle, expectedMonitorFingerprint: fp }).ok;

/** UX-05: the standalone verifier reads `amc session export` output offline, and fails closed on tampering and unknown versions. */
describe("amc-verify reads a session export", () => {
  let workspace: string;
  const root = testKey();
  const asOf = new Date();
  beforeEach(() => {
    for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-verifier-session-export");
    workspace = mkdtempSync(join(tmpdir(), "amc-verify-session-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });

  function session(close: boolean): string {
    const s = new SessionService(workspace, openSessionEventStore(workspace, "sqlite"));
    s.open({ sessionId: "audit-session", agentId: "default", harnessVersion: "verifier-test", compositionDigest: sha256Hex("c"), policyDigest: sha256Hex("p") });
    s.startTurn({ trigger: "user" }); s.startStep();
    s.recordToolCall({ toolCallId: "call-1", toolName: "fs.write", args: '{"path":"hello.txt"}', dispatch: "native", parentToken: null });
    s.recordToolResult({ toolCallId: "call-1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "wrote hello.txt" });
    s.endStep({ stopReason: "end_turn", usage: null }); s.endTurn({ reason: "complete" }); s.sealTurn();
    if (close) s.close({ reason: "completed" });
    s.disposeWithoutClosing();
    return "audit-session";
  }

  function trust(purposes: string[] = ["ledger-row"]) {
    const asOf = new Date(); // after the rows were written: a fixed earlier instant would read them as from the future
    const monitor = getPublicKeyPem(workspace, "monitor");
    const entry = { ...listEntry({ publicKeyPem: monitor, privateKeyPem: "", keyId: sha256Hex(monitor) }), purposes,
      validFrom: new Date(asOf.getTime() - 86_400_000).toISOString(), validTo: null } as Parameters<typeof trustList>[0][number];
    const list = trustList([entry], { issuedAt: new Date(asOf.getTime() - 3_600_000).toISOString(), expiresAt: new Date(asOf.getTime() + 86_400_000).toISOString() });
    return { trustLists: [JSON.parse(JSON.stringify(signTrustList(list, root.privateKeyPem)))], trustRoots: [root.keyId], asOf };
  }
  const bytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2));

  it("verifies a sealed bundle's signatures, chain, seal and summary", () => {
    const bundle = exportSessionBundle({ workspace, sessionId: session(true) });
    const report = verifyArtifact(bytes(bundle), trust());
    expect(report.artifact.kind).toBe("session-export");
    expect(report.integrity.status).toBe("pass");
    expect(report.issuerAdmission.status).toBe("pass");
    expect(report.completeness.status).toBe("pass");
    expect(exitCode(report), "complete and sealed").toBe(4);
    expect(plainSummary(report)).toContain("unchanged, and every signature checks out");
    expect(plainSummary(report)).toContain("whether what it says is true was not checked");
  });

  it("reads a session left open by /exit and says it is not sealed", () => {
    const doc = buildSessionExport({ workspace, sessionId: session(false), includeContent: true, decryptContent: true });
    const report = verifyArtifact(bytes(doc), trust());
    expect(report.integrity.status).toBe("pass");
    expect(report.completeness.status).toBe("not-evaluated");
    expect(report.completeness.reasons.join(" ")).toContain("may be a cut-off copy");
    expect(exitCode(report), "not sealed").toBe(3);
  });

  it("fails an unsealed export with a row taken out of the middle (the chain shows it)", () => {
    const doc = buildSessionExport({ workspace, sessionId: session(false), includeContent: false });
    const report = verifyArtifact(bytes({ ...doc, rows: doc.rows.filter((_, index) => index !== 2) }), trust());
    expect(report.integrity.status).toBe("fail");
    expect(report.integrity.errors.join(" ")).toContain("chain is broken");
  });

  it("reads the HTML viewer's embedded document and says the page around it was not checked", () => {
    const doc = buildSessionExport({ workspace, sessionId: session(true), includeContent: true, decryptContent: true });
    const report = verifyArtifact(Buffer.from(renderSessionExportHtml(doc)), trust());
    expect(report.integrity.status).toBe("pass");
    expect(report.completeness.status).toBe("not-evaluated");
    expect(report.completeness.reasons.join(" ")).toContain("the readable page was not checked against the record");
    expect(plainSummary(report)).toContain("Not a pass");
  });

  it("fails a changed row, a removed row and a changed shown text", () => {
    const sessionId = session(true);
    const bundle = exportSessionBundle({ workspace, sessionId });
    const edited = structuredClone(bundle);
    const callRow = edited.rows.find(row => row.event_type === "tool/call")!;
    expect(callRow.meta_json).toContain("fs.write");
    callRow.meta_json = callRow.meta_json.replace("fs.write", "fs.read");
    expect(verifyArtifact(bytes(edited), trust()).integrity.status).toBe("fail");
    const dropped = structuredClone(bundle);
    dropped.rows.splice(3, 1);
    const report = verifyArtifact(bytes(dropped), trust());
    expect(report.integrity.status).toBe("fail");
    expect(report.reasonCodes.integrity).toContain("DIGEST_MISMATCH");
    const doc = buildSessionExport({ workspace, sessionId, includeContent: true, decryptContent: true });
    const call = doc.rows.find(row => row.event_type === "tool/result")!;
    const shown = { ...doc, content: { ...doc.content, [call.id]: { ...(doc.content![call.id] as object), text: "wrote nothing" } } };
    expect(verifyArtifact(bytes(shown), trust()).integrity.status).toBe("fail");
  });

  it("security: tampered exports never pass, and agree with AMC's own verify-export", () => {
    const sessionId = session(true);
    const doc = buildSessionExport({ workspace, sessionId, includeContent: true, decryptContent: true });
    const fp = doc.monitorKeyFingerprint;
    const result = doc.rows.find(row => row.event_type === "tool/result")!;
    const entry = doc.content![result.id] as Record<string, unknown>;
    const withEntry = (patch: Record<string, unknown>) => ({ ...doc, content: { ...doc.content, [result.id]: { ...entry, ...patch } } });
    const cases: Array<[string, unknown, "fail" | "not-pass"]> = [
      ["edited text marked shortened, digest kept", withEntry({ text: "wrote nothing", truncated: true }), "not-pass"],
      ["edited text marked redacted", withEntry({ text: "wrote nothing", redactions: 1 }), "not-pass"],
      ["edited text claiming to be spilled", withEntry({ text: "wrote nothing", source: "spill" }), "fail"],
      ["edited text with a matching made-up digest", withEntry({ text: "x", truncated: true, sha256: sha256Hex("x") }), "fail"],
      ["the right text under a wrong source", withEntry({ source: entry.source === "inline" ? "blob" : "inline" }), "fail"],
      ["an extra field", withEntry({ note: "VERIFIED" }), "fail"],
      ["negative redactions", withEntry({ redactions: -1 }), "fail"],
      ["seal stripped from a closed session", { ...doc, record: { ...doc.record!, ended_ts: null, session_final_event_hash: null, session_seal_sig: null } }, "fail"],
      ["seal stripped and the close row cut", { ...doc, rows: doc.rows.slice(0, -1), record: { ...doc.record!, ended_ts: null, session_final_event_hash: null, session_seal_sig: null } }, "not-pass"],
      ["tail cut from a sealed session", { ...doc, rows: doc.rows.slice(0, -2) }, "fail"],
      ["an extra top-level field", { ...doc, extra: "VERIFIED" }, "fail"],
      ["padding in an extra field", { ...doc, padding: "x".repeat(200_000) }, "fail"]
    ];
    for (const [name, tampered, expected] of cases) {
      const report = verifyArtifact(bytes(tampered), trust());
      const passed = report.integrity.status === "pass" && report.completeness.status === "pass";
      expect(passed, name).toBe(false);
      expect(report.integrity.status, name).toBe(expected === "fail" ? "fail" : "pass");
      // Parity with AMC's in-repo verifier: it fails the same tampering, or accepts it only as display-only/unproven.
      const amc = verifySessionExport(tampered, { expectedFingerprint: fp, acceptUnverifiableContent: true });
      expect(amc.ok && amc.tail === "sealed" && amc.content.unverifiable === 0, name).toBe(false);
      if (expected === "fail") expect(amc.ok, name).toBe(false);
    }
    const bundle = exportSessionBundle({ workspace, sessionId });
    const { descriptor: _descriptor, ...noDescriptor } = bundle;
    expect(verifyArtifact(bytes(noDescriptor), trust()).integrity.status, "a bundle without its descriptor").toBe("fail");
    expect(verifySessionExport.length >= 0 && (() => { try { return verifyBundle(noDescriptor, fp); } catch { return false; } })(), "AMC refuses it too").toBe(false);
    const untouched = verifyArtifact(bytes(doc), trust());
    expect([untouched.integrity.status, untouched.completeness.status]).toEqual(["pass", "pass"]);
    expect(verifySessionExport(doc, { expectedFingerprint: fp }).ok).toBe(true);
  });

  it("security: a doctored page around an untouched embedded record is not a pass", () => {
    const doc = buildSessionExport({ workspace, sessionId: session(true), includeContent: false });
    const page = renderSessionExportHtml(doc).replace("<main id=\"amc-view\"></main>", "<main><h1>VERIFIED: nothing was run</h1></main>");
    const report = verifyArtifact(Buffer.from(page), trust());
    expect(report.completeness.status).toBe("not-evaluated");
    expect(plainSummary(report)).toContain("the readable page was not checked against the record");
  });

  it("fails closed on an unknown version and does not trust a key only the export carries", () => {
    const bundle = exportSessionBundle({ workspace, sessionId: session(true) });
    const future = verifyArtifact(bytes({ ...bundle, v: 2 }), trust());
    expect(future.integrity.status).toBe("fail");
    expect(future.reasonCodes.integrity).toContain("UNSUPPORTED_VERSION");
    const viewerFuture = verifyArtifact(bytes({ schema: "amc.session-export/v2", sessionId: "x", rows: [] }), trust());
    expect(viewerFuture.reasonCodes.integrity).toContain("UNSUPPORTED_VERSION");
    const untrusted = verifyArtifact(bytes(bundle), { trustLists: [], trustRoots: [], asOf });
    expect(untrusted.integrity.status).toBe("not-evaluated");
    expect(untrusted.issuerAdmission.status).toBe("fail");
    expect(untrusted.reasonCodes.issuerAdmission).toContain("ISSUER_NOT_PINNED");
    const wrongPurpose = verifyArtifact(bytes(bundle), trust(["artifact-seal"]));
    expect(wrongPurpose.issuerAdmission.status).toBe("fail");
  });
});
