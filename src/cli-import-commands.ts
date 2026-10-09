import { resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { emitClaimResult, unverifiedClaim } from "./cli/claimOutput.js";
import { finishVerify, trustFromFlags, withTrustFlags, type TrustFlags } from "./cli-trust-flags.js";
import { admitKey, buildVerifierReport, ed25519KeyId, withPins } from "./trust/index.js";
import { fileSha256 } from "./trust/signatureCheck.js";

type ImportOriginalRef = import("./importers/importOriginals.js").ImportOriginalRef;
function renderOriginals(originals: ImportOriginalRef[] | undefined): void {
  // Manifests written before original retention carry no list; say so rather than imply the bytes exist.
  if (!originals) { console.log("  Originals: not recorded (import predates original-byte retention)."); return; }
  for (const original of originals) {
    const source = original.source ? `${original.source.format} v${original.source.version ?? "?"}${original.source.sourceRevision ? ` (revision ${original.source.sourceRevision.slice(0, 12)})` : ""}` : "unknown format";
    console.log(`  Original: SHA-256 ${original.sha256}; ${original.bytes} bytes; ${source}; ${original.storage.kind === "encrypted-blob"
      ? `retained encrypted as ${original.storage.blobId}` : "not retained (operator opt-out)"}`);
  }
}

const shellWord = (value: string): string => /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;

/** `next` selects the receipt's own reviewed actions (preview), an inspection pointer (applied) or nothing (show). */
function renderNormalization(plan: import("./importers/neutralImporter.js").NeutralImportPlan, next: "actions" | "inspect" | "none"): void {
  const receipt = plan.normalization;
  if (!receipt) { console.log("  Normalization: legacy receipt; mapping losses and unknown timing were not recorded."); return; }
  const count = receipt.counts;
  console.log(`  Source trust: ${receipt.sourceTrust}; evaluation: ${receipt.evaluation}`);
  console.log(`  Mapping: ${count.normalizedTraces} traces; ${count.failureTraces} reported failures`);
  const records = receipt.recordMapping?.counts;
  if (records) console.log(`  Records: ${records.records} (${records.mapped} mapped, ${records.retainedOnly} retained only, ${records.malformed} malformed, ${records.unsupported} unsupported)`);
  console.log(`  Files skipped: ${count.skippedFiles} (${count.malformedFiles} malformed, ${count.unsupportedFiles} unsupported, ${count.oversizedFiles} oversized)`);
  console.log(`  Unknown timing: ${count.unknownTimestamps} event times; ${count.unknownDurations} durations`);
  console.log(`  Normalizer: ${receipt.normalizerVersion}; semantic digest: ${receipt.semanticDigest}`);
  for (const loss of receipt.losses) console.log(chalk.gray(`  ${loss}`));
  for (const candidate of plan.candidates) {
    const format = candidate.sourceFormat ? `${candidate.sourceFormat.name} v${candidate.sourceFormat.version} (${candidate.format})` : candidate.format;
    console.log(`  Source: ${candidate.path}; SHA-256 ${candidate.digest}; format ${format}`);
  }
  // Receipts written before nextActions existed carry none; print nothing rather than invent one.
  if (next === "actions") for (const action of receipt.nextActions ?? []) console.log(`  Next: ${action.label}: ${action.argv.map(shellWord).join(" ")}`);
  if (next === "inspect") console.log(`  Next: inspect with amc imports show ${plan.importId}`);
}

export function registerNeutralImportCommands(program: Command, activeAgent: (p: Command) => string | undefined): void {
  program
    .command("import <path>")
    .description("Import neutral traces, runs, workflow graphs, configs, memory, evals, and benchmarks")
    .option("--agent <agentId>", "agent ID")
    .option("--dry-run", "detect and summarize without writing artifacts", false)
    .option("--validate", "validate support without writing artifacts", false)
    .option("--json", "JSON output")
    .option("--expected-digest <sha256>", "apply only the semantic source digest reviewed in a preview")
    .option("--no-retain-original", "keep only the SHA-256 of each source file instead of its encrypted original bytes")
    .action(async (path: string, opts: { agent?: string; dryRun?: boolean; validate?: boolean; json?: boolean; expectedDigest?: string; retainOriginal?: boolean }) => {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        const mode = opts.validate ? "validate" : opts.dryRun ? "dry-run" : "import";
        const { runNeutralImport } = await import("./importers/neutralImporter.js");
        const result = runNeutralImport({
          workspace: process.cwd(),
          inputPath: resolve(process.cwd(), path),
          agentId,
          mode,
          expectedSemanticDigest: opts.expectedDigest,
          retainOriginals: opts.retainOriginal !== false
        });
        // Imported records are what their source reported: self-reported, and no maturity evaluation is performed.
        if (emitClaimResult(chalk.bold(`Neutral import ${result.importId}`), result, unverifiedClaim("import:neutral", result.plan.candidateCount), opts)) return;
        console.log(`  Mode: ${result.mode}`);
        console.log(`  Status: ${result.plan.status}`);
        console.log(`  Artifacts: ${result.plan.candidateCount}`);
        console.log(`  Categories: ${result.plan.categories.join(", ") || "-"}`);
        console.log(`  Redactions: ${result.plan.redactionCount}`);
        renderNormalization(result.plan, result.applied ? "inspect" : "actions");
        if (!result.applied) {
          console.log(chalk.gray("  Dry run only. Re-run without --dry-run or --validate to write AMC evidence."));
          for (const path of result.plan.wouldWrite.slice(0, 8)) {
            console.log(chalk.gray(`  would write ${path}`));
          }
          return;
        }
        console.log(chalk.green("  Imported as SELF_REPORTED evidence. No maturity evaluation was performed."));
        console.log(`  Episode: ${result.episode?.episode.episodeId ?? "-"}`);
        console.log(`  Lifecycle: ${result.lifecycleRun?.artifact.lifecycleRunId ?? "-"}`);
        console.log(`  Trace index: ${result.traceFailureIndex?.ref.indexId ?? "-"}`);
        console.log(`  Manifest: ${result.resourceManifest?.manifest.manifestId ?? "-"}`);
        renderOriginals(result.originals);
        for (const path of result.externalEvidencePaths ?? []) console.log(`  Portable evidence: ${path}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  const imports = program
    .command("imports")
    .description("List, inspect, and roll back neutral import runs");

  withTrustFlags(imports.command("verify-profile <path>")
    .description("Independently verify an external-evidence profile without opening a workspace")
    .option("--authorities <path>", "operator-admitted authority keys JSON; never taken from the evidence")
    .option("--original <path>", "original source bytes to compare with the declared source digest")
    .option("--expected-digest <sha256>", "independently received normalized semantic digest")
    .option("--json", "JSON output"))
    .action(async (path: string, opts: { authorities?: string; original?: string; expectedDigest?: string } & TrustFlags) => {
      const trust = trustFromFlags(opts, ["evidence-authority"]);
      try {
        const { verifyExternalEvidenceFile } = await import("./standard/externalEvidenceFiles.js");
        // P0-55: an evidence-authority entry of the operator's trust lists is an authority too, under its key id.
        const listedAuthorities = trust.lists.flatMap((list) => list.entries).flatMap((entry) =>
          entry.authority && entry.purposes.includes("evidence-authority") ? [{ id: entry.keyId, publicKeyPem: entry.publicKeyPem, ...entry.authority }] : []);
        const verified = verifyExternalEvidenceFile({ path: resolve(path), authoritiesPath: opts.authorities, listedAuthorities,
          originalPath: opts.original, expectedNormalizedDigest: opts.expectedDigest });
        // --authorities is the operator's own file, so the key it names for this signature is pinned like --pubkey; a listed
        // key is admitted by its list (validity, revocation). Distrust beats both. An unsigned profile is never trusted (P0-51).
        const keyId = verified.signerPublicKeyPem === null || !verified.signerFromFile ? null : ed25519KeyId(verified.signerPublicKeyPem);
        const context = keyId === null ? trust : withPins(trust, [{ keyId, purposes: ["evidence-authority"], origin: `--authorities ${opts.authorities}` }]);
        const report = buildVerifierReport({ artifact: { kind: "external-evidence-profile", path: resolve(path), sha256: fileSha256(resolve(path)) },
          context, integrityErrors: verified.errors, anchoring: { status: "not-applicable", detail: null },
          signatures: [admitKey({ publicKeyPem: verified.signerPublicKeyPem, purpose: "evidence-authority", signature: "profile signature", context })] });
        // A tier an unadmitted key supports is not a tier: untrusted reads SELF_REPORTED.
        const result = { ...verified, trustTier: report.trusted ? verified.trustTier : "SELF_REPORTED" as const };
        if (!opts.json) {
          console.log(`Profile: ${result.ok ? "well-formed" : "refused"}; source trust: ${result.trustTier}`);
          console.log(`Original digest: ${result.originalDigest}; signature verified: ${result.signatureVerified}; parent session: ${result.parentSession}`);
        }
        finishVerify("External-evidence profile", report, { json: opts.json, result: { ...result, ok: report.trusted, report } });
      } catch {
        const result = { ok: false, errors: ["Unable to read a valid bounded profile or authority file"], trustTier: "SELF_REPORTED" };
        if (opts.json) console.log(JSON.stringify(result)); else console.error(result.errors[0]);
        process.exitCode = 1;
      }
    });

  imports
    .command("list")
    .description("List recent neutral import runs")
    .option("--limit <n>", "max imports", "25")
    .option("--json", "JSON output")
    .action(async (opts: { limit: string; json?: boolean }) => {
      try {
        const { listNeutralImports } = await import("./importers/neutralImporter.js");
        const limit = Number.parseInt(opts.limit, 10);
        const rows = listNeutralImports({
          workspace: process.cwd(),
          limit: Number.isFinite(limit) && limit > 0 ? limit : 25
        });
        if (opts.json) {
          console.log(JSON.stringify({ imports: rows, total: rows.length }, null, 2));
          return;
        }
        if (rows.length === 0) {
          console.log(chalk.dim("No neutral imports found."));
          return;
        }
        for (const row of rows) {
          console.log(`${row.createdAt} ${row.importId} artifacts=${row.plan.candidateCount} categories=${row.plan.categories.join(",")}`);
        }
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  imports
    .command("show <importId>")
    .description("Inspect a neutral import manifest")
    .option("--json", "JSON output")
    .action(async (importId: string, opts: { json?: boolean }) => {
      try {
        const { loadNeutralImportManifest } = await import("./importers/neutralImporter.js");
        const manifest = loadNeutralImportManifest({ workspace: process.cwd(), importId });
        if (opts.json) {
          console.log(JSON.stringify(manifest, null, 2));
          return;
        }
        console.log(chalk.bold(`Neutral import ${manifest.importId}`));
        console.log(`  Created: ${manifest.createdAt}`);
        console.log(`  Agent: ${manifest.agentId}`);
        console.log(`  Source: ${manifest.sourcePath}`);
        console.log(`  Categories: ${manifest.plan.categories.join(", ") || "-"}`);
        console.log(`  Redactions: ${manifest.plan.redactionCount}`);
        renderNormalization(manifest.plan, "none");
        renderOriginals(manifest.originals);
        for (const path of manifest.externalEvidencePaths ?? []) console.log(`  Portable evidence: ${path}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  imports
    .command("rollback <importId>")
    .description("Remove files written by a neutral import run")
    .option("--json", "JSON output")
    .action(async (importId: string, opts: { json?: boolean }) => {
      try {
        const { rollbackNeutralImport } = await import("./importers/neutralImporter.js");
        const result = rollbackNeutralImport({ workspace: process.cwd(), importId });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const removed = result.removed.filter((entry) => entry.status === "removed").length;
        console.log(chalk.green(`Rolled back ${removed} file(s).`));
        console.log(result.originalsKept);
        console.log(`Receipt: ${result.receiptPath}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}
