import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readVerified } from "../src/crypto/signing/verifiedArtifacts.js";
import { workspaceSelfTrust } from "../src/trust/trustContext.js";
import { initWorkspace } from "../src/workspace.js";
import { questionIds } from "../src/diagnostic/questionBank.js";
import { createTransformPlan } from "../src/transformation/transformPlanner.js";
import { runTransformTracker } from "../src/transformation/transformTracker.js";
import { writeTransformAttestation } from "../src/transformation/transformAttestations.js";
import { outcomesAttestCli, outcomesInitCli } from "../src/outcomes/outcomeCli.js";
import { outcomeContractPath } from "../src/outcomes/outcomeContractEngine.js";
import { buildCgxContextPack } from "../src/cgx/cgxContextPack.js";
import { writeAnchoredRun } from "./helpers/sealedRun.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "verified-artifact-consumers"; });
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

function keyed(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-verified-consumers-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

const KINDS = ["assurance-certificate", "passport", "bench", "audit-binder", "notary-attestation", "transform-attestation",
  "industry-pack-audit", "outcome-contract", "experiment-candidate"] as const;

/** Artifact verifiers that are not registry kinds, and why: each is verified in place by its own consumers. */
const NOT_REGISTRY_KINDS: Record<string, string> = {
  verifyA4Bundle: "A4 project bundles: verified by `amc a4 verify` and the A4 chain, which read nothing else",
  verifyAttestation: "score output attestations: verified by the score module that issues and reads them",
  verifyAuditMapFile: "compliance map configuration: read only through auditMapStore, which verifies it",
  verifyBenchProofBundle: "inclusion proofs: checked inside the bench, passport and binder verifiers",
  verifyEvidenceBundle: "evidence bundles: asynchronous; every consumer (gate, certificate, BOM, migration) awaits it directly",
  verifyExternalEvidenceFile: "imported external evidence: self-reported by provenance and checked by its importer",
  verifyPassportProofBundle: "inclusion proofs: checked inside the passport verifier",
  verifyPluginSignedFile: "plugin package members: verified by the plugin store before installation",
  verifyPromptPackFile: "prompt packs: verified by the prompt pack CLI that reads them",
  verifyReleaseBundle: "AMC release bundles: `amc release verify` only",
  verifySessionAnchorProofFile: "session anchor proofs: `amc session` verify commands only",
  verifyThirdPartyAttestation: "third-party attestations: checked by ingest as rows are admitted",
  verifyTransparencyBundle: "transparency log exports: `amc transparency verify` only",
  verifyTransparencyProofBundle: "transparency inclusion proofs: checked by the transparency commands and proof readers",
  verifyWorkspaceProofBundle: "workspace proof bundles: verified by the Studio and crypto API routes that serve them"
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : name.endsWith(".ts") ? [path] : [];
  });
}

describe("verified-artifact registry coverage (WP37 review)", () => {
  test("registers the notary, transform, industry-pack audit, outcome-contract and experiment-candidate kinds", () => {
    const ws = keyed(), file = join(ws, "unsigned-artifact.json");
    writeFileSync(file, "{}\n");
    const params = { file, trust: workspaceSelfTrust(ws), workspace: ws };
    for (const kind of KINDS.slice(0, 4)) {
      let label: string;
      try { label = readVerified(kind, params).label; } catch { label = "refused by its verifier"; }
      expect(label, kind).not.toBe("UNKNOWN_KIND");
    }
    for (const kind of KINDS.slice(4)) expect(readVerified(kind, params), kind).toMatchObject({ status: "refused", label: "UNVERIFIED" });
  });

  test("every exported artifact verifier is a registry kind or says why it is not", () => {
    const registry = readFileSync(join("src", "crypto", "signing", "verifiedArtifacts.ts"), "utf8");
    const verifiers = sources("src").flatMap((file) => [...readFileSync(file, "utf8")
      .matchAll(/^export (?:async )?function (verify\w*(?:File|Bundle|Attestation))\b/gm)].map((match) => match[1]!));
    for (const name of verifiers) expect(registry.includes(name) || Object.hasOwn(NOT_REGISTRY_KINDS, name), name).toBe(true);
    for (const name of Object.keys(NOT_REGISTRY_KINDS)) {
      expect(verifiers, `${name} no longer exists`).toContain(name);
      expect(registry, `${name} is registered; drop its exemption`).not.toContain(name);
    }
  });
});

describe("consumers act only on verified artifacts (WP37 review)", () => {
  test("the transform tracker refuses an unsigned attestation and admits a signed one", () => {
    const ws = keyed(), scope = { type: "AGENT" as const, agentId: "default" }, now = Date.now();
    writeAnchoredRun(ws, join(ws, ".amc", "runs"), { agentId: "default", runId: "run_default", ts: now,
      windowStartTs: now - 14 * 86_400_000, windowEndTs: now, status: "VALID", integrityIndex: 0.95, trustLabel: "MEDIUM_TRUST",
      correlationRatio: 0.99, layerScores: [], questionScores: questionIds.map((questionId) => ({ questionId, finalLevel: 1 })),
      evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 } });
    const task = createTransformPlan({ workspace: ws, scope, to: "excellence" }).plan.tasks[0]!;
    const dir = join(ws, ".amc", "agents", "default", "transform", "attestations");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "att_forged.json"), JSON.stringify({ v: 1, attestationId: "att_forged", scope, taskId: task.taskId,
      createdTs: now, createdByUser: "mallory", role: "OWNER", statement: "done", evidenceLinks: [], hashes: { relatedFiles: [] } }, null, 2));
    const statusOf = () => runTransformTracker({ workspace: ws, scope }).after.tasks.find((row) => row.taskId === task.taskId)?.status;
    expect(statusOf()).not.toBe("ATTESTED");
    writeTransformAttestation({ workspace: ws, scope, taskId: task.taskId, statement: "reviewed", createdByUser: "owner", role: "OWNER" });
    expect(statusOf()).toBe("ATTESTED");
  }, 60_000);

  test("a manual outcome attestation refuses a contract that does not verify", () => {
    const ws = keyed();
    outcomesInitCli({ workspace: ws });
    writeFileSync(outcomeContractPath(ws), `${readFileSync(outcomeContractPath(ws), "utf8")}# tampered\n`);
    expect(() => outcomesAttestCli({ workspace: ws, metricId: "functional.task_success_rate", value: "0.9", reason: "weekly review" }))
      .toThrow("Manual outcome attestation requires a verified outcome contract");
  });

  test("the context pack takes no output contract ids from a contract that does not verify", () => {
    const ws = keyed();
    outcomesInitCli({ workspace: ws });
    const contract = YAML.parse(readFileSync(outcomeContractPath(ws), "utf8")) as { outcomeContract: { metrics: Array<Record<string, unknown>> } };
    contract.outcomeContract.metrics.push({ ...contract.outcomeContract.metrics[0]!, metricId: "injected.metric" });
    writeFileSync(outcomeContractPath(ws), YAML.stringify(contract));
    expect(buildCgxContextPack({ workspace: ws }).requiredOutputContractSchemaIds).not.toContain("outcome.metric.injected.metric");
  });
});
