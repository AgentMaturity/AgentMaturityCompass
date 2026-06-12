import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import {
  exportEvidenceBundle,
  verifyEvidenceBundle,
  inspectEvidenceBundle,
  runDiagnostic,
  initWorkspace,
  openLedger,
  writeSignedGatePolicy,
  runBundleGate,
  applyArchetype,
  loadTargetProfile,
  verifyTargetProfileSignature,
  generateBadgeSvg
} from "../src/index.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { ingestEvidence } from "../src/ingest/ingest.js";
import { resolveAgentId, getAgentPaths } from "../src/fleet/paths.js";
import { pathExists } from "../src/utils/fs.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-release-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function extractBundle(bundlePath: string): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-bundle-extract-"));
  roots.push(dir);
  const out = spawnSync("tar", ["-xzf", bundlePath, "-C", dir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`tar extract failed: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
  return dir;
}

function packBundle(sourceDir: string, bundlePath: string): void {
  const out = spawnSync("tar", ["-czf", bundlePath, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`tar pack failed: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function resignRunAndManifest(extractedRoot: string, workspace: string): void {
  const runPath = join(extractedRoot, "run.json");
  const run = JSON.parse(readFileSync(runPath, "utf8")) as Record<string, unknown>;

  const base = { ...run };
  base.runSealSig = "";
  base.reportJsonSha256 = "";
  const reportHash = sha256Hex(canonicalize(base));
  run.reportJsonSha256 = reportHash;
  run.runSealSig = signHexDigest(reportHash, getPrivateKeyPem(workspace, "auditor"));
  writeFileSync(runPath, JSON.stringify(run, null, 2));

  const db = new Database(join(extractedRoot, "evidence", "evidence.sqlite"));
  db.prepare("UPDATE runs SET report_json_sha256 = ?, run_seal_sig = ? WHERE run_id = ?").run(run.reportJsonSha256, run.runSealSig, run.runId);
  db.close();

  const manifestPath = join(extractedRoot, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    schemaVersion: 1;
    runId: string;
    agentId: string;
    windowStartTs: number;
    windowEndTs: number;
    publicKeyFingerprints: { monitor: string[]; auditor: string[] };
    files: Array<{ path: string; sha256: string; size: number }>;
  };

  manifest.files = listFiles(extractedRoot)
    .filter((path) => path !== "manifest.sig" && path !== "manifest.json")
    .map((path) => {
      const full = join(extractedRoot, path);
      const bytes = readFileSync(full);
      return {
        path,
        sha256: sha256Hex(bytes),
        size: bytes.length
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const manifestBytes = readFileSync(manifestPath);
  const digest = sha256Hex(manifestBytes);
  const sigPayload = {
    manifestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  writeFileSync(join(extractedRoot, "manifest.sig"), JSON.stringify(sigPayload, null, 2));
}

describe("release bundles, gates, archetypes, badges", () => {
  test("bundle export includes manifest-listed files and minimized run rows", async () => {
    const workspace = newWorkspace();

    const ledger = openLedger(workspace);
    ledger.startSession({
      sessionId: "seed-session",
      runtime: "unknown",
      binaryPath: "seed",
      binarySha256: "seed-sha"
    });
    ledger.appendEvidence({
      sessionId: "seed-session",
      runtime: "unknown",
      eventType: "stdout",
      payload: "observed output",
      meta: { questionId: "AMC-1.1", trustTier: "OBSERVED" }
    });
    ledger.sealSession("seed-session");
    ledger.close();

    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const bundlePath = join(workspace, ".amc", "bundle-test.amcbundle");
    const exported = exportEvidenceBundle({
      workspace,
      runId: run.runId,
      outFile: bundlePath,
      agentId: resolveAgentId(workspace)
    });

    expect(statSync(exported.outFile).size).toBeGreaterThan(0);

    const inspected = inspectEvidenceBundle(bundlePath);
    expect(inspected.manifest.runId).toBe(run.runId);
    expect(inspected.files).toContain("run.json");
    expect(inspected.files).toContain("manifest.json");
    expect(inspected.files).toContain("evidence/evidence.sqlite");

    const extracted = extractBundle(bundlePath);
    const db = new Database(join(extracted, "evidence", "evidence.sqlite"), { readonly: true });
    const runRows = db.prepare("SELECT COUNT(*) as count FROM runs").get() as { count: number };
    expect(runRows.count).toBe(1);
    const row = db.prepare("SELECT run_id FROM runs LIMIT 1").get() as { run_id: string };
    expect(row.run_id).toBe(run.runId);
    db.close();
  });

  test("bundle export preserves payloadPath artifacts and complete sealed sessions", async () => {
    const workspace = newWorkspace();
    const artifactDir = join(workspace, "agents", "default", "dogfood-artifacts");
    mkdirSync(artifactDir, { recursive: true });
    const artifactPath = join(artifactDir, "observed-artifact.json");
    writeFileSync(artifactPath, JSON.stringify({ kind: "observed-artifact", ok: true }, null, 2));
    const artifactRelativePath = relative(workspace, artifactPath).replace(/\\/g, "/");

    const ledger = openLedger(workspace);
    ledger.startSession({
      sessionId: "payload-path-session",
      runtime: "unknown",
      binaryPath: "seed",
      binarySha256: "seed-sha"
    });
    ledger.appendEvidence({
      sessionId: "payload-path-session",
      runtime: "unknown",
      eventType: "stdout",
      payloadPath: artifactRelativePath,
      meta: { questionId: "AMC-1.1", trustTier: "OBSERVED", agentId: "default" }
    });
    ledger.appendEvidence({
      sessionId: "payload-path-session",
      runtime: "unknown",
      eventType: "stdout",
      payload: "trailing signed event outside score evidence IDs",
      meta: { trustTier: "OBSERVED", agentId: "default" }
    });
    ledger.sealSession("payload-path-session");
    ledger.close();

    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto",
      agentId: "default"
    });

    const bundlePath = join(workspace, ".amc", "payload-path.amcbundle");
    exportEvidenceBundle({
      workspace,
      runId: run.runId,
      outFile: bundlePath,
      agentId: "default"
    });

    const extracted = extractBundle(bundlePath);
    expect(pathExists(join(extracted, "payloads", artifactRelativePath))).toBe(true);

    const verified = await verifyEvidenceBundle(bundlePath);
    expect(verified.errors).toEqual([]);
    expect(verified.ok).toBe(true);
  });

  test("bundle export scopes assurance rows to the bundled agent", async () => {
    const workspace = newWorkspace();
    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto",
      agentId: "default"
    });

    const ledger = openLedger(workspace);
    ledger.insertAssuranceRun({
      assurance_run_id: "other-agent-unsigned",
      agent_id: "other-agent",
      ts: run.windowStartTs + 1,
      window_start_ts: run.windowStartTs,
      window_end_ts: run.windowEndTs,
      mode: "sandbox",
      pack_ids_json: JSON.stringify(["security-starter"]),
      report_json_sha256: "0".repeat(64),
      run_seal_sig: "unsigned",
      status: "UNSIGNED"
    });
    ledger.close();

    const bundlePath = join(workspace, ".amc", "scoped-assurance.amcbundle");
    exportEvidenceBundle({
      workspace,
      runId: run.runId,
      outFile: bundlePath,
      agentId: "default"
    });

    const extracted = extractBundle(bundlePath);
    const db = new Database(join(extracted, "evidence", "evidence.sqlite"), { readonly: true });
    const assuranceRows = db.prepare("SELECT COUNT(*) as count FROM assurance_runs").get() as { count: number };
    db.close();
    expect(assuranceRows.count).toBe(0);

    const verified = await verifyEvidenceBundle(bundlePath);
    expect(verified.ok).toBe(true);
  });

  test("bundle verify catches manifest/blob/missing/signature tampering", async () => {
    const workspace = newWorkspace();

    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const bundlePath = join(workspace, ".amc", "tamper-base.amcbundle");
    exportEvidenceBundle({ workspace, runId: run.runId, outFile: bundlePath });

    const baseVerify = await verifyEvidenceBundle(bundlePath);
    expect(baseVerify.ok).toBe(true);

    const tamperManifest = join(workspace, ".amc", "tamper-manifest.amcbundle");
    {
      const extracted = extractBundle(bundlePath);
      writeFileSync(join(extracted, "manifest.json"), `${readFileSync(join(extracted, "manifest.json"), "utf8")}\n`);
      packBundle(extracted, tamperManifest);
    }
    const manifestVerify = await verifyEvidenceBundle(tamperManifest);
    expect(manifestVerify.ok).toBe(false);

    const tamperMissing = join(workspace, ".amc", "tamper-missing.amcbundle");
    {
      const extracted = extractBundle(bundlePath);
      const victim = listFiles(extracted).find((path) => path === "run.md");
      if (!victim) {
        throw new Error("Expected run.md in bundle");
      }
      rmSync(join(extracted, victim));
      packBundle(extracted, tamperMissing);
    }
    const missingVerify = await verifyEvidenceBundle(tamperMissing);
    expect(missingVerify.ok).toBe(false);

    const tamperBlob = join(workspace, ".amc", "tamper-blob.amcbundle");
    {
      const extracted = extractBundle(bundlePath);
      const blob = listFiles(extracted).find((path) => path.startsWith("evidence/blobs/"));
      if (!blob) {
        // if no blob exists, tamper evidence sqlite directly
        const dbPath = join(extracted, "evidence", "evidence.sqlite");
        writeFileSync(dbPath, Buffer.concat([readFileSync(dbPath), Buffer.from("CORRUPT")]))
      } else {
        const full = join(extracted, blob);
        writeFileSync(full, `${readFileSync(full, "utf8")}\nCORRUPT`);
      }
      packBundle(extracted, tamperBlob);
    }
    const blobVerify = await verifyEvidenceBundle(tamperBlob);
    expect(blobVerify.ok).toBe(false);

    const tamperSig = join(workspace, ".amc", "tamper-signature.amcbundle");
    {
      const extracted = extractBundle(bundlePath);
      const sigPath = join(extracted, "manifest.sig");
      const sig = JSON.parse(readFileSync(sigPath, "utf8")) as Record<string, unknown>;
      sig.signature = "invalid-signature";
      writeFileSync(sigPath, JSON.stringify(sig, null, 2));
      packBundle(extracted, tamperSig);
    }
    const sigVerify = await verifyEvidenceBundle(tamperSig);
    expect(sigVerify.ok).toBe(false);
  });

  test("gate fails for low integrity/layer/low trust and for level-5 non-observed evidence", async () => {
    const workspace = newWorkspace();

    const ingestFile = join(workspace, "self-reported.txt");
    writeFileSync(ingestFile, "self reported evidence");
    ingestEvidence({
      workspace,
      inputPath: ingestFile,
      type: "generic_text",
      agentId: resolveAgentId(workspace)
    });

    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const originalBundle = join(workspace, ".amc", "gate-original.amcbundle");
    exportEvidenceBundle({ workspace, runId: run.runId, outFile: originalBundle });

    const extracted = extractBundle(originalBundle);
    const runJsonPath = join(extracted, "run.json");
    const runJson = JSON.parse(readFileSync(runJsonPath, "utf8")) as Record<string, unknown>;
    const questionScores = runJson.questionScores as Array<Record<string, unknown>>;

    const db = new Database(join(extracted, "evidence", "evidence.sqlite"), { readonly: true });
    const reviewRow = db
      .prepare("SELECT id FROM evidence_events WHERE event_type = 'review' ORDER BY rowid ASC LIMIT 1")
      .get() as { id: string } | undefined;
    db.close();
    if (!reviewRow) {
      throw new Error("Expected at least one review event from ingest");
    }

    const first = questionScores[0];
    if (!first) {
      throw new Error("Expected at least one question score");
    }
    first.claimedLevel = 5;
    first.supportedMaxLevel = 5;
    first.finalLevel = 5;
    first.evidenceEventIds = [reviewRow.id];

    runJson.integrityIndex = 0.2;
    runJson.trustLabel = "LOW TRUST";
    runJson.layerScores = [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 },
      { layerName: "Culture & Alignment", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 },
      { layerName: "Resilience", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 },
      { layerName: "Skills", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }
    ];

    writeFileSync(runJsonPath, JSON.stringify(runJson, null, 2));
    resignRunAndManifest(extracted, workspace);

    const modifiedBundle = join(workspace, ".amc", "gate-modified.amcbundle");
    packBundle(extracted, modifiedBundle);

    const verifyModified = await verifyEvidenceBundle(modifiedBundle);
    expect(verifyModified.ok).toBe(true);

    const policyPath = join(getAgentPaths(workspace, resolveAgentId(workspace)).rootDir, "gatePolicy.test.json");
    writeSignedGatePolicy({
      workspace,
      policyPath,
      policy: {
        minIntegrityIndex: 0.8,
        minOverall: 3,
        minLayer: {
          "Strategic Agent Operations": 3,
          "Leadership & Autonomy": 3,
          "Culture & Alignment": 3,
          Resilience: 3,
          Skills: 3
        },
        requireObservedForLevel5: true,
        denyIfLowTrust: true
      }
    });

    const gate = await runBundleGate({
      workspace,
      bundlePath: modifiedBundle,
      policyPath
    });

    expect(gate.pass).toBe(false);
    expect(gate.reasons.some((reason) => reason.includes("IntegrityIndex"))).toBe(true);
    expect(gate.reasons.some((reason) => reason.includes("Strategic Agent Operations"))).toBe(true);
    expect(gate.reasons.some((reason) => reason.includes("Trust label"))).toBe(true);
    expect(gate.reasons.some((reason) => reason.includes("non-OBSERVED evidence"))).toBe(true);
  });

  test("archetype apply writes artifacts, signs target, and records ARCHETYPE_APPLIED", () => {
    const workspace = newWorkspace();
    const agentId = resolveAgentId(workspace);

    const applied = applyArchetype({
      workspace,
      agentId,
      archetypeId: "code-agent"
    });

    expect(applied.changedFiles.length).toBeGreaterThanOrEqual(5);
    expect(pathExists(applied.targetPath)).toBe(true);

    const profile = loadTargetProfile(workspace, "default", agentId);
    expect(verifyTargetProfileSignature(workspace, profile)).toBe(true);

    const paths = getAgentPaths(workspace, agentId);
    expect(pathExists(paths.guardrails)).toBe(true);
    expect(pathExists(paths.promptAddendum)).toBe(true);
    expect(pathExists(paths.evalHarness)).toBe(true);

    const ledger = openLedger(workspace);
    const archetypeAudit = ledger
      .getAllEvents()
      .filter((event) => event.event_type === "audit")
      .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>)
      .find((payload) => payload.auditType === "ARCHETYPE_APPLIED");
    ledger.close();

    expect(archetypeAudit).toBeTruthy();
    expect(archetypeAudit?.archetypeId).toBe("code-agent");
  });

  test("badge SVG generation is deterministic and includes key fields", async () => {
    const workspace = newWorkspace();
    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const svgA = generateBadgeSvg(run);
    const svgB = generateBadgeSvg(run);

    expect(svgA).toBe(svgB);
    expect(svgA).toContain("Integrity");
    expect(svgA).toContain(run.trustLabel);
    expect(svgA).toContain(run.agentId);
  });
});
