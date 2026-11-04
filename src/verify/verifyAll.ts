import { join, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { verifyTrustConfigSignature, checkNotaryTrust } from "../trust/trustConfig.js";
import { verifyOpsPolicySignature } from "../ops/policy.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { transparencyLogPath, transparencySealPath, transparencySealSigPath, verifiedTransparencyLog } from "../transparency/logChain.js";
import { A4_PROJECT_CREATED, FORECAST_SCHEDULER_CONFIGURED, PASSPORT_POLICY_WITNESSES, PROMPT_PACK_CREATED, PROMPT_SCHEDULER_CONFIGURED, WITNESS_GROUPS, WITNESSING_ENABLED } from "../transparency/configWitness.js";
import { verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { verifyLedgerIntegrity } from "../ledger/ledger.js";
import { LEDGER_UNANCHORED_MESSAGE } from "../ledger/ledgerVerification.js";
import { withPins, workspaceSelfTrust, type TrustContext } from "../trust/trustContext.js";
import { untrustedReasons } from "../trust/verifierReport.js";
import { isKeyRefused } from "../trust/signatureCheck.js";
import { verifyForecastWorkspaceArtifacts } from "../forecast/forecastVerifier.js";
import { verifyBenchPolicySignature } from "../bench/benchPolicyStore.js";
import { verifyBenchArtifactFile } from "../bench/benchVerifier.js";
import { listExportedBenchArtifacts } from "../bench/benchArtifact.js";
import { importedBenchSigner, listImportedBenchArtifacts } from "../bench/benchRegistryClient.js";
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
import { verifyWorkspacePromptPack } from "../prompt/promptPackVerifier.js";
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
import { listPassportExportFiles, passportPolicySigPath, verifyPassportPolicySignature } from "../passport/passportStore.js";
import { verifyPassportWorkspace } from "../passport/passportVerifier.js";
import { verifyStandardSchemas } from "../standard/standardGenerator.js";
import { verifyA4Projects } from "../a4/a4Verify.js";

/** NOT_CONFIGURED: an optional feature the workspace never set up, so there is nothing to verify; SKIP: something exists but was not verified. */
type VerifyStatus = "PASS" | "FAIL" | "SKIP" | "NOT_CONFIGURED";

export interface VerifyAllCheck {
  id: string;
  status: VerifyStatus;
  critical: boolean;
  details: string[];
}

export interface VerifyAllReport {
  /** INCOMPLETE: nothing failed, but a critical check was skipped, so the headline is withheld rather than PASS (WP37). */
  status: "PASS" | "FAIL" | "INCOMPLETE";
  criticalFail: boolean;
  /** Ids of critical checks recorded as SKIP (never performed). */
  skippedCritical: string[];
  /** Ids of checks recorded as NOT_CONFIGURED: they neither pass nor withhold the headline. */
  notConfigured: string[];
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

function notConfigured(id: string, critical: boolean, details: string[]): VerifyAllCheck {
  return { id, status: "NOT_CONFIGURED", critical, details };
}

/**
 * The configuration witnesses: the verified transparency log's entry types and agents, and the witness types in the
 * verified, anchored evidence ledger (each type with the subjects, else agents, its rows name); each is null when its record is missing or
 * does not verify.
 */
type Witness = { log: { types: Set<string>; agentsOf: (type: string) => Set<string> } | null; ledger: ReadonlyMap<string, ReadonlySet<string>> | null };

/**
 * Whether a missing witness proves "never configured": both verified records hold the WITNESSING_ENABLED marker written at
 * workspace creation. A workspace created before witnessing existed lacks it, so its unwitnessed parts read SKIP.
 */
const witnessedFromCreation = (witness: Witness) => witness.ledger?.has(WITNESSING_ENABLED) === true && witness.log?.types.has(WITNESSING_ENABLED) === true;

/**
 * A witnessed part with nothing on disk: FAIL when either record holds a witness of its configuration (the files were
 * removed), NOT_CONFIGURED only when both verified records hold none, and SKIP when either cannot be read to tell.
 */
function absentPart(id: string, critical: boolean, witness: Witness, types: readonly string[], what: string): VerifyAllCheck {
  const inLedger = types.find((type) => witness.ledger?.has(type)), inLog = types.find((type) => witness.log?.types.has(type));
  if (inLedger !== undefined || inLog !== undefined) {
    return fail(id, critical, [`${what} missing: the ${inLedger !== undefined ? "evidence ledger" : "transparency log"} records it was configured (${inLedger ?? inLog})`]);
  }
  return !witnessedFromCreation(witness)
    ? skip(id, critical, [`${what} absent, and no verified evidence ledger and transparency log both show it was never configured (${WITNESSING_ENABLED} in both)`])
    : notConfigured(id, critical, [`${what} never configured (no ${types.join(" or ")} in the verified evidence ledger or transparency log)`]);
}

export async function verifyAll(params: {
  workspace: string;
  /** The operator's trust context (P0-09): it anchors the ledger and admits release keys; --allow-unanchored lives here. */
  trust: TrustContext;
}): Promise<VerifyAllReport> {
  const workspace = resolve(params.workspace);
  const checks: VerifyAllCheck[] = [];
  // Verify all is read-only: a missing log or seal is never recreated (a fresh seal would erase the witnesses).
  const tlogPresent = [transparencyLogPath(workspace), transparencySealPath(workspace), transparencySealSigPath(workspace)].every(statExists);
  let tlog: ReturnType<typeof verifiedTransparencyLog> | null = null, tlogError: string | null = null;
  try {
    tlog = tlogPresent ? verifiedTransparencyLog(workspace, { readOnly: true }) : null;
  } catch (error) {
    tlogError = String(error);
  }
  let ledger: Awaited<ReturnType<typeof verifyLedgerIntegrity>> | null = null, ledgerError: string | null = null;
  const a4: { rows: ReturnType<typeof verifyA4Projects> | null } = { rows: null };
  try {
    // The witness rows come from the rows this verification checked, on its one ledger handle; the file is never reopened.
    // The A4 projects are read on that same verified handle before it closes (a4-projects below).
    ledger = await verifyLedgerIntegrity(workspace, { trust: params.trust, auditTypes: WITNESS_GROUPS.flat(), onVerifiedLedger: (handle) => {
      try {
        a4.rows = verifyA4Projects(handle, params.trust);
      } catch (error) {
        a4.rows = [{ status: "FAIL", details: [String(error)] }];
      }
    } });
  } catch (error) {
    ledgerError = String(error);
  }
  // Only a verified ledger whose monitor key is anchored to the pinned fingerprint can witness, or show the absence of witnesses.
  const ledgerWitness = ledger?.ok === true && ledger.trustRoot.anchored ? ledger.audits ?? null : null;
  const entries = tlog?.ok === true ? tlog.entries : null;
  const witness: Witness = { ledger: ledgerWitness, log: entries === null ? null : {
    types: new Set(entries.map((entry) => entry.type)),
    agentsOf: (type) => new Set(entries.filter((entry) => entry.type === type).map((entry) => entry.agentId))
  } };

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
    // A state file without its signature, or a signature without its state file, is unverifiable and fails; only the
    // absence of both is not configured.
    !statExists(promptSchedulerSig.path) && !statExists(promptSchedulerSig.sigPath)
      ? absentPart("prompt-scheduler-signature", false, witness, [PROMPT_SCHEDULER_CONFIGURED], "prompt scheduler state")
      : promptSchedulerSig.valid && statExists(promptSchedulerSig.path)
      ? pass("prompt-scheduler-signature", false, [promptSchedulerSig.path])
      : fail("prompt-scheduler-signature", false, [promptSchedulerSig.reason ?? "state file missing beside its signature"])
  );

  const promptErrors: string[] = [];
  const promptAgents = listPromptAgentsWithPacks(workspace);
  // Packs are enforced on agents, so a pack either record shows was built (PROMPT_PACK_CREATED) must still be on disk.
  for (const [record, agents] of [["transparency log", witness.log?.agentsOf(PROMPT_PACK_CREATED)], ["evidence ledger", witness.ledger?.get(PROMPT_PACK_CREATED)]] as const) {
    for (const agentId of agents ?? []) if (!promptAgents.includes(agentId)) promptErrors.push(`pack(${agentId}): missing; the ${record} records a pack built for this agent`);
  }
  for (const agentId of promptAgents) {
    const packPath = promptLatestPackPath(workspace, agentId);
    const verify = verifyWorkspacePromptPack(workspace, packPath);
    if (!verify.ok) {
      promptErrors.push(`pack(${agentId}): ${verify.errors.join("; ")}`);
    }
    const lintSig = verifyPromptLintSignature(workspace, agentId);
    if (!(lintSig.valid || !lintSig.signatureExists)) {
      promptErrors.push(`lint(${agentId}): ${lintSig.reason ?? "invalid signature"}`);
    }
  }
  checks.push(
    promptAgents.length === 0 && promptErrors.length === 0
      ? !witnessedFromCreation(witness) || witness.ledger?.has(PROMPT_PACK_CREATED) === true || witness.log?.types.has(PROMPT_PACK_CREATED) === true
        ? skip("prompt-packs", false, ["no prompt packs, and no verified evidence ledger and transparency log both show none were built"])
        : notConfigured("prompt-packs", false, ["no prompt packs built (none in the verified evidence ledger or transparency log)"])
      : promptErrors.length === 0
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
  const auditExports = listExportedAuditBinders(workspace);
  for (const row of auditExports) {
    const verify = verifyAuditBinderFile({
      file: row.file,
      workspace,
      trust: workspaceSelfTrust(workspace)
    });
    if (!verify.ok) {
      auditExportErrors.push(`${row.file}: ${untrustedReasons(verify.report).join("; ")}`);
    }
  }
  checks.push(
    auditExports.length === 0
      ? notConfigured("audit-binder-exports", false, ["no .amcaudit files exported"])
      : auditExportErrors.length === 0
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
  // An orphaned policy signature proves a policy once existed, so the missing body fails rather than reading as never configured.
  const passportUninitialized =
    passportPolicyFileMissing &&
    !statExists(passportPolicySigPath(workspace)) &&
    listPassportExportFiles(workspace).length === 0 &&
    passportCacheEntries.length === 0;
  const passportAbsent = passportUninitialized ? absentPart("passport-policy-signature", true, witness, PASSPORT_POLICY_WITNESSES, "passport policy") : null;
  if (passportAbsent !== null && passportAbsent.status !== "FAIL") {
    checks.push(passportAbsent, { ...passportAbsent, id: "passport-workspace-integrity", critical: false });
  } else {
    checks.push(
      passportPolicy.valid
        ? pass("passport-policy-signature", true, [passportPolicy.path])
        : fail("passport-policy-signature", true, [passportPolicy.reason ?? "invalid", ...(passportAbsent?.details ?? [])])
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
    checks.push(notConfigured("standard-schema-bundle", false, ["schema bundle not generated yet"]));
  } else {
    checks.push(
      standard.ok
        ? pass("standard-schema-bundle", false, ["schema bundle signatures and manifests verified"])
        : fail("standard-schema-bundle", false, standard.errors)
    );
  }

  const tlogMissing = "transparency log or its seal missing: not verified, and verify all does not recreate it";
  // The ledger row is written before the log entry, so a log that lacks a witness the ledger holds was restored to an older copy.
  const lagging = WITNESS_GROUPS.filter((group) => group.some((type) => ledgerWitness?.has(type)) && !group.some((type) => witness.log?.types.has(type)))
    .map((group) => group.join(" or "));
  const rolledBack = `the evidence ledger records ${lagging.join(", ")} but the transparency log does not: the log was rolled back or removed`;
  // The marker is written once, ledger row first: a verified ledger without the one the verified log holds was replaced.
  const markerOnlyInLog = ledgerWitness !== null && !ledgerWitness.has(WITNESSING_ENABLED) && witness.log?.types.has(WITNESSING_ENABLED) === true;
  checks.push(
    !tlogPresent ? (lagging.length > 0 ? fail("transparency-log", true, [tlogMissing, rolledBack]) : skip("transparency-log", true, [tlogMissing]))
      : tlog === null ? fail("transparency-log", true, [tlogError ?? "transparency log unreadable"])
      : !tlog.ok ? fail("transparency-log", true, tlog.errors)
      : lagging.length > 0 ? fail("transparency-log", true, [rolledBack])
      : markerOnlyInLog ? fail("transparency-log", true, [`the transparency log records ${WITNESSING_ENABLED} but the evidence ledger does not: the records disagree`])
      : pass("transparency-log", true, [`entries=${tlog.entryCount}`, `lastHash=${tlog.lastHash}`])
  );

  try {
    const merkle = tlogPresent ? verifyTransparencyMerkle(workspace) : null;
    checks.push(
      merkle === null ? skip("transparency-merkle", true, [tlogMissing])
      : merkle.ok
        ? pass("transparency-merkle", true, [`leafCount=${merkle.leafCount}`, `root=${merkle.root ?? ""}`])
        : fail("transparency-merkle", true, merkle.errors)
    );
  } catch (error) {
    checks.push(fail("transparency-merkle", true, [String(error)]));
  }

  if (ledger === null) {
    checks.push(fail("ledger-hash-chain", true, [ledgerError ?? "ledger unreadable"]));
  } else {
    checks.push(
      ledger.ok
        ? pass("ledger-hash-chain", true, ["event hash-chain and signatures verified"])
        : fail("ledger-hash-chain", true, ledger.errors)
    );
    const monitor = ledger.trustRoot.monitorAdmission;
    checks.push(ledger.trustRoot.anchored
      ? pass("ledger-trust-root", true, [`monitor key ${ledger.trustRoot.monitorFingerprint ?? ""} admitted for ledger-row`])
      // Distrust beats every pin and allow flag, so a distrusted or revoked monitor key fails even with --allow-unanchored.
      : monitor && isKeyRefused(monitor) ? fail("ledger-trust-root", true, [`monitor key ${monitor.status}: ${monitor.detail ?? ""}`])
      : params.trust.allowUnanchored
        ? skip("ledger-trust-root", true, ["UNANCHORED (--allow-unanchored): internal consistency only"])
        : fail("ledger-trust-root", true, [LEDGER_UNANCHORED_MESSAGE]));
  }

  // P1-57: each A4 project's chain, side rows and envelopes (integrity of bytes; never a claim about the agent).
  try {
    // The projects were read on the handle ledger verification checked; "none" and "one is gone" are decided from the
    // verified witness records, each naming its project (ledger row subjectId, log artifact id).
    const rows = a4.rows;
    if (rows === null) throw new Error("no readable evidence ledger: ledger verification did not reach the A4 checks");
    const projects = new Set(rows.flatMap((row) => row.projectId ?? []));
    // With no project, absentPart fails it when either record holds a witness, and reads NOT_CONFIGURED only when both hold none.
    if (rows.length === 1 && rows[0]!.status === "NOT_CONFIGURED") checks.push(absentPart("a4-projects", true, witness, [A4_PROJECT_CREATED], "A4 project"));
    else {
      const logged = entries?.filter((entry) => entry.type === A4_PROJECT_CREATED).map((entry) => entry.artifact.id ?? "(unnamed)");
      const lost = ([["transparency log", logged], ["evidence ledger", witness.ledger?.get(A4_PROJECT_CREATED)]] as const)
        .flatMap(([record, witnessed]) => [...witnessed ?? []].filter((projectId) => !projects.has(projectId))
          .map((projectId) => `A4 project ${projectId} missing from the ledger: the ${record} records it was created`));
      for (const row of rows) checks.push({ id: "a4-projects", status: row.status, critical: true, details: row.details });
      if (lost.length > 0) checks.push(fail("a4-projects", true, lost));
    }
  } catch (error) {
    checks.push(fail("a4-projects", true, [String(error)]));
  }

  const forecast = verifyForecastWorkspaceArtifacts(workspace);
  if (!forecast.policy.valid) {
    checks.push(
      fail("forecast-signatures", false, [`forecast policy: ${forecast.policy.reason ?? "invalid"}`])
    );
  } else if (!forecast.scheduler.valid && !statExists(forecast.scheduler.path) && !statExists(forecast.scheduler.sigPath)) {
    checks.push(absentPart("forecast-signatures", false, witness, [FORECAST_SCHEDULER_CONFIGURED], "forecast scheduler state"));
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
  const benchExports = listExportedBenchArtifacts(workspace);
  const benchImports = listImportedBenchArtifacts(workspace);
  for (const artifact of benchExports) {
    const verify = verifyBenchArtifactFile({ file: artifact.file, trust: workspaceSelfTrust(workspace) });
    if (!verify.ok) {
      benchErrors.push(`export ${artifact.file}: ${untrustedReasons(verify.report).join("; ")}`);
    }
  }
  for (const imported of benchImports) {
    let artifactPath: string;
    try {
      artifactPath = importedBenchPath(workspace, imported.benchId, imported.version).artifactPath;
    } catch (error) {
      // A meta.json naming an escaping id is a failed check, not a crash of `verify all`.
      benchErrors.push(`import ${imported.benchId}@${imported.version}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    // The signer the pinned registry's signed index names (cached at import), not meta.json: a self-check, labelled workspace-self.
    const self = workspaceSelfTrust(workspace);
    let signer: string;
    try {
      signer = await importedBenchSigner(workspace, imported, self);
    } catch (error) {
      benchErrors.push(`import ${artifactPath}: signer not authenticated: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const verify = verifyBenchArtifactFile({ file: artifactPath, trust: withPins(self,
      [{ keyId: signer, purposes: ["artifact-seal"], origin: "workspace-self:signed bench registry index" }]) });
    if (!verify.ok) {
      benchErrors.push(`import ${artifactPath}: ${untrustedReasons(verify.report).join("; ")}`);
    }
  }
  checks.push(
    benchExports.length + benchImports.length === 0
      ? notConfigured("bench-artifacts", false, ["no .amcbench files imported or exported"])
      : benchErrors.length === 0
      ? pass("bench-artifacts", false, ["all imported/exported .amcbench files verified"])
      : fail("bench-artifacts", false, benchErrors)
  );

  const backupFiles = recursiveFiles(workspace, (file) => file.endsWith(".amcbackup"));
  if (backupFiles.length === 0) {
    checks.push(notConfigured("backup-manifests", false, ["no .amcbackup files found under workspace"]));
  } else {
    const backupErrors: string[] = [];
    let requiresPassphraseOnly = true;
    let requiresUnlockedVaultOnly = true;
    for (const file of backupFiles) {
      try {
        const verify = backupVerifyCli({ backupFile: file, trust: workspaceSelfTrust(workspace) });
        if (!verify.ok) {
          backupErrors.push(`${file}: ${untrustedReasons(verify.report).join("; ")}`);
          // A refused signer is a failure, never a skip: only an admitted backup can be "passphrase or vault only".
          const issuerAdmitted = verify.report.issuerAdmission.status === "pass";
          if (!issuerAdmitted || !verify.errors.every((row) => row.toLowerCase().includes("backup passphrase required"))) {
            requiresPassphraseOnly = false;
          }
          if (!issuerAdmitted || !verify.errors.every((row) => row.toLowerCase().includes("vault is locked"))) {
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
    checks.push(notConfigured("release-bundles", false, ["no .amcrelease files found in dist/"]));
  } else {
    const releaseErrors: string[] = [];
    for (const file of releaseFiles) {
      try {
        // Release bundles are signed outside the vault, so only the operator's pins (the command's flags and AMC home) can admit them.
        const verify = releaseVerifyCli({ bundleFile: file, trust: params.trust });
        if (!verify.ok) {
          // untrustedReasons names a refused signer's key id, so the operator knows what to pin (or to pass --trust-list).
          releaseErrors.push(`${file}: ${untrustedReasons(verify.report).join("; ")}`);
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
  const skippedCritical = checks.filter((check) => check.critical && check.status === "SKIP").map((check) => check.id);

  return {
    status: anyFail ? "FAIL" : skippedCritical.length > 0 ? "INCOMPLETE" : "PASS",
    criticalFail,
    skippedCritical,
    notConfigured: checks.filter((check) => check.status === "NOT_CONFIGURED").map((check) => check.id),
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
