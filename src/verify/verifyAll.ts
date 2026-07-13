import { join, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { verifyTrustConfigSignature, checkNotaryTrust } from "../trust/trustConfig.js";
import { verifyOpsPolicySignature } from "../ops/policy.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { verifyTransparencyLog } from "../transparency/logChain.js";
import { verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { verifyLedgerIntegrity } from "../ledger/ledger.js";
import { verifyForecastWorkspaceArtifacts } from "../forecast/forecastVerifier.js";
import { verifyBenchPolicySignature } from "../bench/benchPolicyStore.js";
import { verifyBenchArtifactFile } from "../bench/benchVerifier.js";
import { listExportedBenchArtifacts } from "../bench/benchArtifact.js";
import { listImportedBenchArtifacts } from "../bench/benchRegistryClient.js";
import { importedBenchPath } from "../bench/benchRegistryStore.js";
import { backupVerifyCli } from "../ops/backup/backupCli.js";
import { releaseVerifyCli } from "../release/releaseCli.js";
import { verifyCanonSignature } from "../canon/canonLoader.js";
import { verifyDiagnosticBankSignature } from "../diagnostic/bank/bankLoader.js";
import { verifyCgxWorkspace } from "../cgx/cgxVerifier.js";
import { verifyMechanicWorkspace } from "../mechanic/mechanicApi.js";
import {
  listPromptAgentsWithPacks,
  verifyPromptLintSignature
} from "../prompt/promptPackStore.js";
import { verifyPromptPackFile } from "../prompt/promptPackVerifier.js";
import {
  promptLatestPackPath,
  verifyPromptPolicySignature,
  verifyPromptSchedulerStateSignature
} from "../prompt/promptPolicyStore.js";
import { verifyAssuranceWorkspace } from "../assurance/assuranceVerifier.js";
import { verifyAuditPolicySignature } from "../audit/auditPolicyStore.js";
import { verifyAuditMapActiveSignature, verifyAuditMapBuiltinSignature } from "../audit/auditMapStore.js";
import { listExportedAuditBinders } from "../audit/binderArtifact.js";
import { verifyAuditBinderFile, verifyAuditWorkspace } from "../audit/binderVerifier.js";
import { listPassportExportFiles, verifyPassportPolicySignature } from "../passport/passportStore.js";
import { verifyPassportWorkspace } from "../passport/passportVerifier.js";
import { verifyStandardSchemas } from "../standard/standardGenerator.js";

type VerifyStatus = "PASS" | "FAIL" | "SKIP";

export interface VerifyAllCheck {
  id: string;
  status: VerifyStatus;
  critical: boolean;
  details: string[];
}

export interface VerifyAllReport {
  status: "PASS" | "FAIL";
  criticalFail: boolean;
  generatedTs: number;
  checks: VerifyAllCheck[];
}

function recursiveFiles(root: string, matcher: (file: string) => boolean): string[] {
  if (!root || !statExists(root)) {
    return [];
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && matcher(full)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function pass(id: string, critical: boolean, details: string[]): VerifyAllCheck {
  return { id, status: "PASS", critical, details };
}

function fail(id: string, critical: boolean, details: string[]): VerifyAllCheck {
  return { id, status: "FAIL", critical, details };
}

function skip(id: string, critical: boolean, details: string[]): VerifyAllCheck {
  return { id, status: "SKIP", critical, details };
}

export async function verifyAll(params: {
  workspace: string;
}): Promise<VerifyAllReport> {
  const workspace = resolve(params.workspace);
  const checks: VerifyAllCheck[] = [];

  const trustSig = verifyTrustConfigSignature(workspace);
  checks.push(
    trustSig.valid
      ? pass("trust-config-signature", true, [trustSig.path])
      : fail("trust-config-signature", true, [trustSig.reason ?? "signature verification failed"])
  );

  if (trustSig.valid) {
    const trust = await checkNotaryTrust(workspace).catch((error) => ({
      ok: false,
      reasons: [String(error)]
    }));
    checks.push(
      trust.ok
        ? pass("trust-runtime", true, ["trust checks passed"])
        : fail("trust-runtime", true, trust.reasons.length > 0 ? trust.reasons : ["trust checks failed"])
    );
  } else {
    checks.push(skip("trust-runtime", true, ["skipped due invalid trust signature"]));
  }

  const opsSig = verifyOpsPolicySignature(workspace);
  checks.push(
    opsSig.valid
      ? pass("ops-policy-signature", true, [opsSig.path])
      : fail("ops-policy-signature", true, [opsSig.reason ?? "signature verification failed"])
  );

  const canonSig = verifyCanonSignature(workspace);
  checks.push(
    canonSig.valid
      ? pass("canon-signature", true, [canonSig.path])
      : fail("canon-signature", true, [canonSig.reason ?? "signature verification failed"])
  );

  const bankSig = verifyDiagnosticBankSignature(workspace);
  checks.push(
    bankSig.valid
      ? pass("diagnostic-bank-signature", true, [bankSig.path])
      : fail("diagnostic-bank-signature", true, [bankSig.reason ?? "signature verification failed"])
  );

  const cgxVerify = verifyCgxWorkspace(workspace);
  const cgxErrors: string[] = [];
  if (!cgxVerify.policy.valid) {
    cgxErrors.push(`policy: ${cgxVerify.policy.reason ?? "invalid signature"}`);
  }
  if (!(cgxVerify.workspaceGraph.valid || !cgxVerify.workspaceGraph.signatureExists)) {
    cgxErrors.push(`workspace graph: ${cgxVerify.workspaceGraph.reason ?? "invalid signature"}`);
  }
  for (const row of cgxVerify.agentGraphs) {
    if (!(row.verify.valid || !row.verify.signatureExists)) {
      cgxErrors.push(`agent graph ${row.agentId}: ${row.verify.reason ?? "invalid signature"}`);
    }
  }
  for (const row of cgxVerify.agentPacks) {
    if (!(row.verify.valid || !row.verify.signatureExists)) {
      cgxErrors.push(`agent pack ${row.agentId}: ${row.verify.reason ?? "invalid signature"}`);
    }
  }
  checks.push(
    cgxErrors.length === 0
      ? pass("cgx-signatures", true, ["policy + graph/pack signatures verified"])
      : fail("cgx-signatures", true, cgxErrors)
  );

  const plugin = verifyPluginWorkspace({ workspace });
  checks.push(
    plugin.ok
      ? pass("plugins-integrity", true, ["installed.lock and plugin packages verified"])
      : fail("plugins-integrity", true, plugin.errors)
  );

  const mechanic = verifyMechanicWorkspace(workspace);
  checks.push(
    mechanic.ok
      ? pass("mechanic-signatures", true, ["targets + profiles + tuning signatures verified"])
      : fail("mechanic-signatures", true, mechanic.errors)
  );

  const promptPolicySig = verifyPromptPolicySignature(workspace);
  checks.push(
    promptPolicySig.valid
      ? pass("prompt-policy-signature", true, [promptPolicySig.path])
      : fail("prompt-policy-signature", true, [promptPolicySig.reason ?? "signature verification failed"])
  );

  const promptSchedulerSig = verifyPromptSchedulerStateSignature(workspace);
  checks.push(
    promptSchedulerSig.valid || !promptSchedulerSig.signatureExists
      ? pass("prompt-scheduler-signature", false, [promptSchedulerSig.signatureExists ? promptSchedulerSig.path : "scheduler not initialized"])
      : fail("prompt-scheduler-signature", false, [promptSchedulerSig.reason ?? "signature verification failed"])
  );

  const promptErrors: string[] = [];
  for (const agentId of listPromptAgentsWithPacks(workspace)) {
    const packPath = promptLatestPackPath(workspace, agentId);
    const verify = verifyPromptPackFile({
      file: packPath
    });
    if (!verify.ok) {
      promptErrors.push(`pack(${agentId}): ${verify.errors.join("; ")}`);
    }
    const lintSig = verifyPromptLintSignature(workspace, agentId);
    if (!(lintSig.valid || !lintSig.signatureExists)) {
      promptErrors.push(`lint(${agentId}): ${lintSig.reason ?? "invalid signature"}`);
    }
  }
  checks.push(
    promptErrors.length === 0
      ? pass("prompt-packs", false, ["all prompt packs + lint signatures verified"])
      : fail("prompt-packs", false, promptErrors)
  );

  const assurance = verifyAssuranceWorkspace({
    workspace
  });
  checks.push(
    assurance.ok
      ? pass("assurance-signatures", true, ["assurance policy/scheduler/runs/cert verified"])
      : fail("assurance-signatures", true, assurance.errors)
  );

  const auditPolicy = verifyAuditPolicySignature(workspace);
  checks.push(
    auditPolicy.valid
      ? pass("audit-policy-signature", true, [auditPolicy.path])
      : fail("audit-policy-signature", true, [auditPolicy.reason ?? "invalid"])
  );
  const auditMapBuiltin = verifyAuditMapBuiltinSignature(workspace);
  const auditMapActive = verifyAuditMapActiveSignature(workspace);
  const mapErrors: string[] = [];
  if (!auditMapBuiltin.valid) {
    mapErrors.push(`builtin map: ${auditMapBuiltin.reason ?? "invalid"}`);
  }
  if (!auditMapActive.valid) {
    mapErrors.push(`active map: ${auditMapActive.reason ?? "invalid"}`);
  }
  checks.push(
    mapErrors.length === 0
      ? pass("audit-maps-signature", true, ["builtin + active map signatures valid"])
      : fail("audit-maps-signature", true, mapErrors)
  );
  const auditWorkspace = verifyAuditWorkspace({ workspace });
  checks.push(
    auditWorkspace.ok
      ? pass("audit-workspace-integrity", false, ["audit scheduler/cache/export signatures verified"])
      : fail("audit-workspace-integrity", false, auditWorkspace.errors)
  );
  const auditExportErrors: string[] = [];
  for (const row of listExportedAuditBinders(workspace)) {
    const verify = verifyAuditBinderFile({
      file: row.file,
      workspace
    });
    if (!verify.ok) {
      auditExportErrors.push(`${row.file}: ${verify.errors.map((error) => error.message).join("; ")}`);
    }
  }
  checks.push(
    auditExportErrors.length === 0
      ? pass("audit-binder-exports", false, ["all exported .amcaudit files verified"])
      : fail("audit-binder-exports", false, auditExportErrors)
  );

  const passportPolicy = verifyPassportPolicySignature(workspace);
  const passportPolicyFileMissing =
    !passportPolicy.valid && (passportPolicy.reason ?? "").toLowerCase().includes("file missing");
  const passportCachePath = join(workspace, ".amc", "passport", "cache");
  const passportCacheEntries = statExists(passportCachePath)
    ? readdirSync(passportCachePath).filter((name) => name.startsWith("latest_") && name.endsWith(".json"))
    : [];
  const passportUninitialized =
    passportPolicyFileMissing &&
    listPassportExportFiles(workspace).length === 0 &&
    passportCacheEntries.length === 0;
  if (passportUninitialized) {
    checks.push(skip("passport-policy-signature", true, ["passport not initialized yet"]));
    checks.push(skip("passport-workspace-integrity", false, ["passport not initialized yet"]));
  } else {
    checks.push(
      passportPolicy.valid
        ? pass("passport-policy-signature", true, [passportPolicy.path])
        : fail("passport-policy-signature", true, [passportPolicy.reason ?? "invalid"])
    );
    const passportWorkspace = verifyPassportWorkspace({
      workspace
    });
    checks.push(
      passportWorkspace.ok
        ? pass("passport-workspace-integrity", false, ["passport exports/cache verified"])
        : fail("passport-workspace-integrity", false, passportWorkspace.errors)
    );
  }

  const standard = verifyStandardSchemas(workspace);
  if (!standard.meta && standard.errors.some((row) => row.toLowerCase().includes("meta.json missing"))) {
    checks.push(skip("standard-schema-bundle", false, ["schema bundle not generated yet"]));
  } else {
    checks.push(
      standard.ok
        ? pass("standard-schema-bundle", false, ["schema bundle signatures and manifests verified"])
        : fail("standard-schema-bundle", false, standard.errors)
    );
  }

  try {
    const tlog = verifyTransparencyLog(workspace);
    checks.push(
      tlog.ok
        ? pass("transparency-log", true, [`entries=${tlog.entryCount}`, `lastHash=${tlog.lastHash}`])
        : fail("transparency-log", true, tlog.errors)
    );
  } catch (error) {
    checks.push(fail("transparency-log", true, [String(error)]));
  }

  try {
    const merkle = verifyTransparencyMerkle(workspace);
    checks.push(
      merkle.ok
        ? pass("transparency-merkle", true, [`leafCount=${merkle.leafCount}`, `root=${merkle.root ?? ""}`])
        : fail("transparency-merkle", true, merkle.errors)
    );
  } catch (error) {
    checks.push(fail("transparency-merkle", true, [String(error)]));
  }

  try {
    const ledger = await verifyLedgerIntegrity(workspace);
    checks.push(
      ledger.ok
        ? pass("ledger-hash-chain", true, ["event hash-chain and signatures verified"])
        : fail("ledger-hash-chain", true, ledger.errors)
    );
  } catch (error) {
    checks.push(fail("ledger-hash-chain", true, [String(error)]));
  }

  const forecast = verifyForecastWorkspaceArtifacts(workspace);
  if (!forecast.policy.valid) {
    checks.push(
      fail("forecast-signatures", false, [`forecast policy: ${forecast.policy.reason ?? "invalid"}`])
    );
  } else if (!forecast.scheduler.valid && (forecast.scheduler.reason ?? "").toLowerCase().includes("file missing")) {
    checks.push(
      skip("forecast-signatures", false, ["forecast scheduler not initialized yet"])
    );
  } else if (!forecast.scheduler.valid) {
    checks.push(
      fail("forecast-signatures", false, [`forecast scheduler: ${forecast.scheduler.reason ?? "invalid"}`])
    );
  } else {
    checks.push(
      pass("forecast-signatures", false, ["policy + scheduler signatures valid"])
    );
  }

  const benchPolicy = verifyBenchPolicySignature(workspace);
  checks.push(
    benchPolicy.valid
      ? pass("bench-policy-signature", false, [benchPolicy.path])
      : fail("bench-policy-signature", false, [benchPolicy.reason ?? "invalid"])
  );

  const benchErrors: string[] = [];
  for (const artifact of listExportedBenchArtifacts(workspace)) {
    const verify = verifyBenchArtifactFile({ file: artifact.file });
    if (!verify.ok) {
      benchErrors.push(`export ${artifact.file}: ${verify.errors.map((row) => row.message).join("; ")}`);
    }
  }
  for (const imported of listImportedBenchArtifacts(workspace)) {
    const artifactPath = importedBenchPath(workspace, imported.benchId, imported.version).artifactPath;
    const verify = verifyBenchArtifactFile({ file: artifactPath });
    if (!verify.ok) {
      benchErrors.push(`import ${artifactPath}: ${verify.errors.map((row) => row.message).join("; ")}`);
    }
  }
  checks.push(
    benchErrors.length === 0
      ? pass("bench-artifacts", false, ["all imported/exported .amcbench files verified"])
      : fail("bench-artifacts", false, benchErrors)
  );

  const backupFiles = recursiveFiles(workspace, (file) => file.endsWith(".amcbackup"));
  if (backupFiles.length === 0) {
    checks.push(skip("backup-manifests", false, ["no .amcbackup files found under workspace"]));
  } else {
    const backupErrors: string[] = [];
    let requiresPassphraseOnly = true;
    let requiresUnlockedVaultOnly = true;
    for (const file of backupFiles) {
      try {
        const verify = backupVerifyCli({ backupFile: file });
        if (!verify.ok) {
          backupErrors.push(`${file}: ${verify.errors.join("; ")}`);
          const onlyPassphraseErrors = verify.errors.every((row) =>
            row.toLowerCase().includes("backup passphrase required")
          );
          if (!onlyPassphraseErrors) {
            requiresPassphraseOnly = false;
          }
          const onlyVaultErrors = verify.errors.every((row) =>
            row.toLowerCase().includes("vault is locked")
          );
          if (!onlyVaultErrors) {
            requiresUnlockedVaultOnly = false;
          }
        }
      } catch (error) {
        const message = String(error);
        backupErrors.push(`${file}: ${message}`);
        if (!message.toLowerCase().includes("backup passphrase required")) {
          requiresPassphraseOnly = false;
        }
        if (!message.toLowerCase().includes("vault is locked")) {
          requiresUnlockedVaultOnly = false;
        }
      }
    }
    if (backupErrors.length === 0) {
      checks.push(pass("backup-manifests", false, [`verified ${backupFiles.length} backups`]));
    } else if (requiresUnlockedVaultOnly) {
      checks.push(
        skip("backup-manifests", false, [
          "backup verification requires unlocked vault to emit verification audit events"
        ])
      );
    } else if (requiresPassphraseOnly) {
      checks.push(
        skip("backup-manifests", false, [
          "backup verification requires passphrase (set AMC_BACKUP_PASSPHRASE or AMC_BACKUP_PASSPHRASE_FILE)"
        ])
      );
    } else {
      checks.push(fail("backup-manifests", false, backupErrors));
    }
  }

  const distDir = join(workspace, "dist");
  const releaseFiles = recursiveFiles(distDir, (file) => file.endsWith(".amcrelease"));
  if (releaseFiles.length === 0) {
    checks.push(skip("release-bundles", false, ["no .amcrelease files found in dist/"]));
  } else {
    const releaseErrors: string[] = [];
    for (const file of releaseFiles) {
      try {
        const verify = releaseVerifyCli({ bundleFile: file });
        if (!verify.ok) {
          releaseErrors.push(`${file}: ${verify.errors.join("; ")}`);
        }
      } catch (error) {
        releaseErrors.push(`${file}: ${String(error)}`);
      }
    }
    checks.push(
      releaseErrors.length === 0
        ? pass("release-bundles", false, [`verified ${releaseFiles.length} release bundles`])
        : fail("release-bundles", false, releaseErrors)
    );
  }

  const criticalFail = checks.some((check) => check.critical && check.status === "FAIL");
  const anyFail = checks.some((check) => check.status === "FAIL");

  return {
    status: anyFail ? "FAIL" : "PASS",
    criticalFail,
    generatedTs: Date.now(),
    checks
  };
}

export function verifyAllTopReasons(report: VerifyAllReport): string[] {
  return report.checks
    .filter((check) => check.critical && check.status === "FAIL")
    .slice(0, 5)
    .flatMap((check) => check.details.map((detail) => `${check.id}: ${detail}`));
}
