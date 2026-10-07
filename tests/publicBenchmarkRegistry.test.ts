import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import type { DiagnosticReport } from "../src/types.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { initBenchPolicy, loadBenchPolicy, saveBenchPolicy, saveBenchRegistriesConfig } from "../src/bench/benchPolicyStore.js";
import { createBenchArtifact } from "../src/bench/benchArtifact.js";
import { verifyBenchArtifactFile } from "../src/bench/benchVerifier.js";
import { scanBenchForPii } from "../src/bench/benchRedaction.js";
import { initBenchRegistry, publishBenchToRegistry, serveBenchRegistry, verifyBenchRegistry } from "../src/bench/benchRegistryServer.js";
import { importBenchFromRegistry } from "../src/bench/benchRegistryClient.js";
import { createBenchComparison } from "../src/bench/benchComparer.js";
import { benchPublishExecuteForApi, benchPublishRequestForApi } from "../src/bench/benchApi.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { initTransparencyLog, appendTransparencyEntry } from "../src/transparency/logChain.js";
import { operatorTrustHome, workspaceKeyTrust } from "./helpers/trustContext.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-public-bench-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "bench-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBenchPolicy(dir);
  return dir;
}

function writeHighRun(workspacePath: string, runId: string, tsOffsetDays = 0): void {
  const ts = Date.now() - tsOffsetDays * 86_400_000;
  const report: DiagnosticReport = {
    agentId: "default",
    runId,
    ts,
    windowStartTs: ts - 86_400_000,
    windowEndTs: ts,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.96,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 4.8, confidenceWeightedFinalLevel: 4.8 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 4.7, confidenceWeightedFinalLevel: 4.7 },
      { layerName: "Culture & Alignment", avgFinalLevel: 4.6, confidenceWeightedFinalLevel: 4.6 },
      { layerName: "Resilience", avgFinalLevel: 4.7, confidenceWeightedFinalLevel: 4.7 },
      { layerName: "Skills", avgFinalLevel: 4.8, confidenceWeightedFinalLevel: 4.8 }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 5,
      supportedMaxLevel: 5,
      finalLevel: 5,
      confidence: 0.95,
      evidenceEventIds: ["ev1", "ev2"],
      flags: [],
      narrative: "fixture"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 0.97,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.9,
    evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "hash"
  };
  const runDir = join(workspacePath, ".amc", "agents", "default", "runs");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, `${runId}.json`), JSON.stringify(report, null, 2));
}

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate port");
  }
  return address.port;
}

async function httpText(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.text()
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("public benchmark registry", () => {
  test("bench create/verify works; tamper fails; pii scan blocks free text", () => {
    const ws = workspace();
    writeHighRun(ws, "run_a", 7);
    writeHighRun(ws, "run_b", 6);
    writeHighRun(ws, "run_c", 5);
    writeHighRun(ws, "run_d", 4);
    initTransparencyLog(ws);
    appendTransparencyEntry({
      workspace: ws,
      type: "ORG_SCORECARD",
      agentId: "default",
      artifact: { kind: "policy", sha256: "a".repeat(64), id: "seed" }
    });

    const out = createBenchArtifact({
      workspace: ws,
      scope: "workspace",
      outFile: ".amc/bench/exports/workspace/workspace/latest.amcbench",
      windowDays: 30
    });
    expect(out.bench.benchId).toMatch(/^bench_/);
    const verify = verifyBenchArtifactFile({ file: out.outFile, trust: workspaceKeyTrust(ws) });
    expect(verify.ok).toBe(true);

    const tamperDir = mkdtempSync(join(tmpdir(), "amc-bench-proof-tamper-"));
    try {
      const extract = spawnSync("tar", ["-xzf", out.outFile, "-C", tamperDir], { encoding: "utf8" });
      expect(extract.status).toBe(0);
      const benchPath = join(tamperDir, "amc-bench", "bench.json");
      const parsed = JSON.parse(readFileSync(benchPath, "utf8")) as { proofBindings: { merkleRootSha256: string } };
      parsed.proofBindings.merkleRootSha256 = "f".repeat(64);
      writeFileSync(benchPath, JSON.stringify(parsed, null, 2));
      const tampered = join(ws, "tampered.amcbench");
      const repack = spawnSync("tar", ["-czf", tampered, "-C", tamperDir, "amc-bench"], { encoding: "utf8" });
      expect(repack.status).toBe(0);
      const failed = verifyBenchArtifactFile({ file: tampered, trust: workspaceKeyTrust(ws) });
      expect(failed.ok).toBe(false);
    } finally {
      rmSync(tamperDir, { recursive: true, force: true });
    }

    const pii = scanBenchForPii({
      ...(out.bench as unknown as Record<string, unknown>),
      leak: "alice@example.com"
    } as never);
    expect(pii.status).toBe("FAIL");
    expect(pii.findings.some((row) => row.type === "EMAIL")).toBe(true);
  });

  test("registry init/publish/verify/serve and import from allowlisted registry", async () => {
    const ws = workspace();
    writeHighRun(ws, "run_1", 7);
    writeHighRun(ws, "run_2", 6);
    writeHighRun(ws, "run_3", 5);
    writeHighRun(ws, "run_4", 4);
    const created = createBenchArtifact({
      workspace: ws,
      scope: "workspace",
      outFile: ".amc/bench/exports/workspace/workspace/registry-source.amcbench",
      windowDays: 30
    });

    const registryDir = join(ws, "bench-registry");
    const init = initBenchRegistry({
      dir: registryDir,
      registryId: "local-bench",
      registryName: "Local Bench Registry"
    });
    const published = publishBenchToRegistry({
      dir: registryDir,
      benchFile: created.outFile,
      registryKeyPath: init.keyPath
    });
    const verified = verifyBenchRegistry(registryDir);
    expect(verified.ok).toBe(true);

    const port = await pickPort();
    const server = await serveBenchRegistry({ dir: registryDir, host: "127.0.0.1", port });
    try {
      const indexRes = await httpText(`http://${server.host}:${server.port}/index.json`);
      expect(indexRes.status).toBe(200);
      expect(indexRes.body).toContain("local-bench");
    } finally {
      await server.close();
    }

    saveBenchRegistriesConfig(ws, {
      benchRegistries: {
        version: 1,
        registries: [
          {
            id: "local-bench",
            type: "file",
            base: registryDir,
            pinnedRegistryFingerprint: init.fingerprint,
            allowSignerFingerprints: [created.signature.envelope?.fingerprint ?? created.signature.digestSha256],
            allowTrustLabels: ["HIGH", "MEDIUM", "LOW"],
            requireBenchProofs: false,
            autoUpdate: false
          }
        ]
      }
    });

    const imported = await importBenchFromRegistry({
      workspace: ws,
      registryId: "local-bench",
      benchRef: `${published.benchId}@${published.version}`
    });
    expect(imported.benchId).toBe(published.benchId);

    // P0-09: verify all takes an imported bench's signer from the cached index the pinned registry signed, never from
    // the unsigned meta.json, so a re-signed copy with a matching meta.json edit fails.
    const benchCheck = async () => (await verifyAll({ workspace: ws, trust: workspaceKeyTrust(ws, { allowUnanchored: true }) }))
      .checks.find((row) => row.id === "bench-artifacts");
    expect((await benchCheck())?.status).toBe("PASS");
    const attacker = generateKeyPairSync("ed25519");
    const attackerPem = attacker.publicKey.export({ type: "spki", format: "pem" }).toString();
    const top = mkdtempSync(join(tmpdir(), "amc-bench-import-forge-"));
    roots.push(top);
    expect(spawnSync("tar", ["-xzf", imported.filePath, "-C", top]).status).toBe(0);
    const benchPath = join(top, "amc-bench", "bench.json");
    const bench = JSON.parse(readFileSync(benchPath, "utf8")) as Record<string, unknown>;
    writeFileSync(benchPath, canonicalize({ ...bench, generatedTs: Number(bench.generatedTs) + 1 }));
    const digest = sha256Hex(readFileSync(benchPath));
    writeFileSync(join(top, "amc-bench", "bench.sig"), JSON.stringify({ digestSha256: digest,
      signature: sign(null, Buffer.from(digest, "hex"), attacker.privateKey).toString("base64"), signedTs: Date.now(), signer: "auditor" }));
    writeFileSync(join(top, "amc-bench", "signer.pub"), attackerPem);
    expect(spawnSync("tar", ["-czf", imported.filePath, "-C", top, "amc-bench"]).status).toBe(0);
    const metaPath = join(dirname(imported.filePath), "meta.json");
    writeFileSync(metaPath, JSON.stringify({ ...JSON.parse(readFileSync(metaPath, "utf8")) as object, signerFingerprint: sha256Hex(attackerPem) }));
    const forged = await benchCheck();
    expect(forged?.status).toBe("FAIL");
    expect(forged?.details.join("\n")).toContain("not-pinned");

    // The registry key vouches only while admitted: the operator's distrust beats the pinned fingerprint.
    const ref = `${published.benchId}@${published.version}`;
    vi.stubEnv("AMC_HOME", operatorTrustHome([], [{ keyId: init.fingerprint, distrustedFrom: null, reason: "key-compromise", note: "test", source: "operator" }]));
    roots.push(process.env.AMC_HOME!);
    try {
      await expect(importBenchFromRegistry({ workspace: ws, registryId: "local-bench", benchRef: ref })).rejects.toThrow("registry key not admitted: distrusted");
    } finally {
      vi.unstubAllEnvs();
    }

    // The registries config pins the registry, so an edit without the auditor's signature is refused.
    const registriesPath = join(ws, ".amc", "bench", "imports", "registries.yaml");
    writeFileSync(registriesPath, `${readFileSync(registriesPath, "utf8")}\n# edited without re-signing\n`);
    await expect(importBenchFromRegistry({ workspace: ws, registryId: "local-bench", benchRef: ref })).rejects.toThrow("bench registries config signature invalid");
  });

  test("publishing requires quorum approvals and comparer is deterministic", () => {
    const ws = workspace();
    writeHighRun(ws, "run_1", 7);
    writeHighRun(ws, "run_2", 6);
    writeHighRun(ws, "run_3", 5);
    writeHighRun(ws, "run_4", 4);
    const relaxed = loadBenchPolicy(ws);
    relaxed.benchPolicy.integrityGates.minIntegrityIndexForPublish = 0;
    relaxed.benchPolicy.integrityGates.minCorrelationRatioForPublish = 0;
    relaxed.benchPolicy.integrityGates.requireTrustLevelForPublish = "LOW";
    saveBenchPolicy(ws, relaxed);

    const bench = createBenchArtifact({
      workspace: ws,
      scope: "workspace",
      outFile: ".amc/bench/exports/workspace/workspace/publish.amcbench",
      windowDays: 30
    });

    const registryDir = join(ws, "publish-registry");
    const registry = initBenchRegistry({
      dir: registryDir,
      registryId: "publish-reg",
      registryName: "Publish Registry"
    });

    const requested = benchPublishRequestForApi({
      workspace: ws,
      agentId: "default",
      file: bench.outFile,
      registryDir,
      registryKeyPath: registry.keyPath,
      explicitOwnerAck: true
    });
    expect(requested.approvalRequestId).toMatch(/^apprreq_/);

    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: requested.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "owner approval",
      userId: "owner-1",
      username: "owner-1",
      userRoles: ["OWNER"]
    });
    expect(() =>
      benchPublishExecuteForApi({
        workspace: ws,
        approvalRequestId: requested.approvalRequestId
      })
    ).toThrow(/quorum/i);

    decideApprovalForIntent({
      workspace: ws,
      agentId: "default",
      approvalId: requested.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "auditor approval",
      userId: "auditor-1",
      username: "auditor-1",
      userRoles: ["AUDITOR"]
    });
    const executed = benchPublishExecuteForApi({
      workspace: ws,
      approvalRequestId: requested.approvalRequestId
    });
    expect(executed.benchId).toBe(bench.bench.benchId);

    const a = createBenchComparison({
      workspace: ws,
      scope: "workspace",
      id: "workspace",
      against: "imported"
    });
    const b = createBenchComparison({
      workspace: ws,
      scope: "workspace",
      id: "workspace",
      against: "imported"
    });
    expect(a.comparison.percentiles).toEqual(b.comparison.percentiles);
  });

  test("lease-auth cannot access bench APIs and bench console pages have no CDN refs", async () => {
    const ws = workspace();
    const token = "bench-admin-token";
    const port = await pickPort();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const lease = issueLeaseForCli({
        workspace: ws,
        agentId: "default",
        ttl: "60m",
        scopes: "gateway:llm,toolhub:intent,toolhub:execute",
        routes: "/openai",
        models: "*",
        rpm: 60,
        tpm: 200000
      });
      const denied = await httpText(`${server.url}/bench/exports`, {
        headers: {
          "x-amc-agent-id": "default",
          "x-amc-lease": lease.token
        }
      });
      expect([401, 403]).toContain(denied.status);

      const pages = ["/console/benchmarks.html", "/console/benchCompare.html", "/console/benchRegistry.html"];
      for (const page of pages) {
        const res = await httpText(`${server.url}${page}`);
        expect(res.status).toBe(200);
        expect(res.body.toLowerCase()).not.toContain("cdn.");
        expect(res.body.toLowerCase()).not.toContain("https://cdn");
      }
    } finally {
      await server.close();
    }
  });
});
