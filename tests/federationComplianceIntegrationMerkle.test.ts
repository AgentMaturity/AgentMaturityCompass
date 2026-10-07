import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initComplianceMaps, verifyComplianceMapsSignature, generateComplianceReport } from "../src/compliance/complianceEngine.js";
import { appendTransparencyEntry, readTransparencyEntries } from "../src/transparency/logChain.js";
import { buildMerkleRootFromEntryHashes } from "../src/transparency/merkle.js";
import {
  rebuildTransparencyMerkle,
  exportTransparencyProofBundle,
  verifyTransparencyProofBundle
} from "../src/transparency/merkleIndexStore.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { defaultGatePolicy, writeSignedGatePolicy } from "../src/ci/gate.js";
import { issueCertificate } from "../src/assurance/certificate.js";
import { exportBenchmarkArtifact } from "../src/benchmarks/benchExport.js";
import { benchmarkStats } from "../src/benchmarks/benchStats.js";
import { federateInitCli } from "../src/federation/federationCli.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "../src/federation/federationSync.js";
import { ensureFederationPublisherKey } from "../src/federation/federationIdentity.js";
import { addFederationPeer } from "../src/federation/federationStore.js";
import { operatorTrustHome, pinnedTrust, workspaceKeyPem } from "./helpers/trustContext.js";
import { initIntegrationsConfig, integrationsConfigPath, integrationsConfigSigPath, verifyIntegrationsConfigSignature } from "../src/integrations/integrationStore.js";
import { dispatchIntegrationTest } from "../src/integrations/integrationDispatcher.js";
import { verifyOpsReceipt, verifyOpsReceiptForEvent } from "../src/integrations/opsReceipt.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { getVaultSecret } from "../src/vault/vault.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fed-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "federation-test-passphrase";
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

async function pickFreePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolvePromise) => s.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = s.address();
  await new Promise<void>((resolvePromise) => s.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate free port");
  }
  return addr.port;
}

function writeAuditEvidence(workspace: string, auditType: string, controlIds?: string[]): void {
  const ledger = openLedger(workspace);
  const sessionId = `test-${Date.now()}`;
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "vitest",
      binarySha256: "vitest"
    });
    ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({ auditType, info: "fixture" }),
      payloadExt: "json",
      inline: true,
      meta: {
        trustTier: "OBSERVED",
        agentId: "default",
        auditType,
        ...(controlIds ? { controlIds } : {})
      },
      receipt: {
        kind: "guard_check",
        agentId: "default",
        providerId: "unknown",
        model: null,
        bodySha256: sha256Hex("fixture")
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

function signYamlWithAuditor(workspace: string, path: string): void {
  const digest = sha256Hex(readFileSync(path));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  writeFileSync(
    `${path}.sig`,
    JSON.stringify(
      {
        digestSha256: digest,
        signature,
        signedTs: Date.now(),
        signer: "auditor"
      },
      null,
      2
    )
  );
}

describe("compliance + merkle + federation + integrations", () => {
  test("compliance maps are signed and only control-bound evidence is admitted", () => {
    const workspace = newWorkspace();
    const created = initComplianceMaps(workspace);
    expect(created.path).toContain(".amc/compliance-maps.yaml");
    const verify = verifyComplianceMapsSignature(workspace);
    expect(verify.valid).toBe(true);

    const before = generateComplianceReport({
      workspace,
      framework: "NIST_AI_RMF",
      window: "14d",
      agentId: "default"
    });
    const beforeMap = before.categories.find((row) => row.id === "nist_map");
    expect(beforeMap).toBeDefined();
    expect(beforeMap?.status).toBe("NOT_EVALUATED");

    // P0-17: an arbitrary audit type is a coincidental event, not evidence for nist_map. The old
    // assertion (SATISFIED here) encoded that bug.
    writeAuditEvidence(workspace, "NIST_MAP_SIGNAL");
    const coincidental = generateComplianceReport({
      workspace,
      framework: "NIST_AI_RMF",
      window: "14d",
      agentId: "default"
    });
    expect(coincidental.categories.find((row) => row.id === "nist_map")?.status).toBe("NOT_EVALUATED");

    writeAuditEvidence(workspace, "NIST_MAP_SIGNAL", ["nist_map"]);
    const after = generateComplianceReport({
      workspace,
      framework: "NIST_AI_RMF",
      window: "14d",
      agentId: "default"
    });
    const afterMap = after.categories.find((row) => row.id === "nist_map");
    expect(afterMap).toBeDefined();
    // P1-11: the bound, receipted runtime event is admitted and observed; without a compiled plan recording that the
    // control applies, the category is still not evaluated (it read SATISFIED before).
    expect(afterMap?.evidence).toBe("sufficient");
    expect(afterMap?.claimKind).toBe("observed");
    expect(afterMap?.status).toBe("NOT_EVALUATED");
  });

  test("merkle transparency rebuild/prove/verify is deterministic and catches tampering", async () => {
    const workspace = newWorkspace();
    const e1 = appendTransparencyEntry({
      workspace,
      type: "BUNDLE_EXPORTED",
      agentId: "default",
      artifact: {
        kind: "amcbundle",
        sha256: "a".repeat(64),
        id: "bundle-1"
      }
    });
    const e2 = appendTransparencyEntry({
      workspace,
      type: "BOM_SIGNED",
      agentId: "default",
      artifact: {
        kind: "bom",
        sha256: "b".repeat(64),
        id: "bom-1"
      }
    });
    const rebuilt = rebuildTransparencyMerkle(workspace);
    const expectedRoot = buildMerkleRootFromEntryHashes(readTransparencyEntries(workspace).map((entry) => entry.hash));
    expect(rebuilt.root).toBe(expectedRoot);

    const proofFile = join(workspace, ".amc", "transparency", "proofs", `${e1.hash}.amcproof`);
    const proof = exportTransparencyProofBundle({
      workspace,
      entryHash: e1.hash,
      outFile: proofFile
    });
    expect(proof.outFile).toBe(proofFile);
    // The operator pins the auditor key it recorded at vault creation; the bundled auditor.pub never vouches (P0-51).
    const auditorTrust = pinnedTrust([{ publicKeyPem: workspaceKeyPem(workspace, "auditor"), purposes: ["artifact-seal"] }]);
    expect(verifyTransparencyProofBundle(proofFile, auditorTrust).ok).toBe(true);
    expect(verifyTransparencyProofBundle(proofFile, pinnedTrust([])).report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");

    const tamperDir = mkdtempSync(join(tmpdir(), "amc-proof-tamper-"));
    try {
      const extract = spawnSync("tar", ["-xzf", proofFile, "-C", tamperDir], { encoding: "utf8" });
      if (extract.status !== 0) {
        throw new Error(extract.stderr || extract.stdout || "failed to extract");
      }
      writeFileSync(join(tamperDir, "proof.json"), JSON.stringify({ broken: true }, null, 2));
      const tamperedFile = join(workspace, ".amc", "transparency", "proofs", "tampered.amcproof");
      const repack = spawnSync("tar", ["-czf", tamperedFile, "-C", tamperDir, "."], { encoding: "utf8" });
      if (repack.status !== 0) {
        throw new Error(repack.stderr || repack.stdout || "failed to re-pack");
      }
      const verified = verifyTransparencyProofBundle(tamperedFile, auditorTrust);
      expect(verified.ok).toBe(false);
    } finally {
      rmSync(tamperDir, { recursive: true, force: true });
    }

    const run = await runDiagnostic({
      workspace,
      agentId: "default",
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    const policyPath = join(workspace, ".amc", "gatePolicy.json");
    writeSignedGatePolicy({
      workspace,
      policyPath,
      policy: defaultGatePolicy()
    });
    const sigPath = join(workspace, ".amc", "transparency", "merkle", "current.root.sig");
    writeFileSync(sigPath, JSON.stringify({ bad: true }, null, 2));
    await expect(
      issueCertificate({
        workspace,
        runId: run.runId,
        policyPath,
        outFile: ".amc/certs/blocked.amccert",
        agentId: "default"
      })
    ).rejects.toThrow(/transparency merkle invalid/i);
  });

  test("federation export/import verifies signatures and ingested benchmarks affect stats", async () => {
    const source = newWorkspace();
    const dest = newWorkspace();
    const run = await runDiagnostic({
      workspace: source,
      agentId: "default",
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    exportBenchmarkArtifact({
      workspace: source,
      runId: run.runId,
      agentId: "default",
      outFile: ".amc/benchmarks/source.amcbench"
    });
    federateInitCli({
      workspace: source,
      orgName: "Source Org"
    });
    const fedFile = join(source, ".amc", "federation", "outbox", "sync.amcfed");
    const exported = exportFederationPackage({
      workspace: source,
      outFile: fedFile
    });
    expect(exported.outFile).toBe(fedFile);
    // The operators exchange publisher keys out of band; the package's own publisher.pub vouches for nothing (P0-09).
    const sourcePublisher = ensureFederationPublisherKey(source).publicKeyPem;
    const verified = verifyFederationPackage(fedFile, pinnedTrust([{ publicKeyPem: sourcePublisher, purposes: ["artifact-seal"] }]));
    expect(verified.ok).toBe(true);
    federateInitCli({
      workspace: dest,
      orgName: "Dest Org"
    });
    expect(() => importFederationPackage({ workspace: dest, bundleFile: fedFile })).toThrow(/not-pinned/);
    addFederationPeer({ workspace: dest, peerId: "source", name: "Source Org", publisherPublicKeyPem: sourcePublisher });
    // The peer pin admits the package seal only. A benchmark inside is signed by the source auditor key, which the
    // operator has not pinned, so the import refuses it rather than ingest it into stats (P0-09).
    const benchSigner = workspaceKeyPem(source, "auditor");
    expect(() => importFederationPackage({ workspace: dest, bundleFile: fedFile })).toThrow(/not-pinned/);
    expect(benchmarkStats({ workspace: dest }).count).toBe(0);
    const priorHome = process.env.AMC_HOME;
    const home = operatorTrustHome([{ publicKeyPem: benchSigner, purposes: ["artifact-seal"] }]);
    process.env.AMC_HOME = home;
    try {
      const imported = importFederationPackage({
        workspace: dest,
        bundleFile: fedFile
      });
      expect(imported.benchmarkCount).toBeGreaterThan(0);
      const stats = benchmarkStats({
        workspace: dest
      });
      expect(stats.count).toBeGreaterThan(0);
    } finally {
      if (priorHome === undefined) delete process.env.AMC_HOME;
      else process.env.AMC_HOME = priorHome;
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("integration dispatch writes evidence with verifiable ops receipt and tamper fails", async () => {
    const workspace = newWorkspace();
    const created = initIntegrationsConfig(workspace);
    expect(verifyIntegrationsConfigSignature(workspace).valid).toBe(true);
    const yamlText = readFileSync(created.path, "utf8");
    const vaultSecret = getVaultSecret(workspace, "integrations/ops-webhook");
    expect(vaultSecret).toBeTruthy();
    expect(yamlText.includes(vaultSecret || "")).toBe(false);

    const port = await pickFreePort();
    const received: string[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        received.push(Buffer.concat(chunks).toString("utf8"));
        res.statusCode = 200;
        res.end("ok");
      });
    });
    await new Promise<void>((resolvePromise) => server.listen(port, "127.0.0.1", () => resolvePromise()));
    try {
      const path = integrationsConfigPath(workspace);
      const parsed = YAML.parse(readFileSync(path, "utf8")) as {
        integrations: {
          channels: Array<{ id: string; url: string }>;
          routing: Record<string, string[]>;
        };
      };
      parsed.integrations.channels[0]!.url = `http://127.0.0.1:${port}/amc`;
      parsed.integrations.routing.INTEGRATION_TEST = ["ops-webhook"];
      writeFileSync(path, YAML.stringify(parsed));
      signYamlWithAuditor(workspace, path);
      expect(verifyIntegrationsConfigSignature(workspace).valid).toBe(true);
      expect(integrationsConfigSigPath(workspace)).toContain(".sig");

      const dispatched = await dispatchIntegrationTest({
        workspace,
        channelId: "ops-webhook"
      });
      expect(dispatched.dispatched.length).toBe(1);
      expect(received.length).toBe(1);
      const payload = JSON.parse(received[0] ?? "{}") as { type?: string; eventName?: string };
      expect(payload.type).toBe("AMC_OPS_EVENT");
      expect(payload.eventName).toBe("INTEGRATION_TEST");

      const dispatchRow = dispatched.dispatched[0]!;
      const verifyEvent = verifyOpsReceiptForEvent({
        workspace,
        eventId: dispatchRow.eventId
      });
      expect(verifyEvent.ok).toBe(true);

      const tamperedReceipt = `${dispatchRow.receipt.slice(0, Math.max(0, dispatchRow.receipt.length - 2))}zz`;
      const verifyTamperedReceipt = verifyOpsReceipt({
        workspace,
        receipt: tamperedReceipt
      });
      expect(verifyTamperedReceipt.ok).toBe(false);

      const verifyTamperedPayload = verifyOpsReceipt({
        workspace,
        receipt: dispatchRow.receipt,
        expectedPayloadSha256: "0".repeat(64)
      });
      expect(verifyTamperedPayload.ok).toBe(false);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });
});
