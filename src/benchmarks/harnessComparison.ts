import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runProcess, type RunningProcess } from "../exec/runProcess.js";
import type { ProcessOutcome } from "../exec/processTypes.js";
import { HARNESS_COMPARISON_VERSION, comparisonObservationsSchema, comparisonOracleSchema, harnessComparisonManifestSchema,
  type ComparisonCommand, type ComparisonObservations, type ComparisonOracle, type HarnessComparisonManifest } from "./harnessComparisonSchema.js";
import { comparisonSha256, readComparisonFile, redactComparisonText, redactComparisonValue, resolveComparisonPin, writeComparisonArtifact,
  type ComparisonArtifact } from "./harnessComparisonArtifacts.js";
import { renderHarnessComparisonReport, summarizeHarnessComparison } from "./harnessComparisonReport.js";

export interface HarnessComparisonTrial {
  id: string; targetId: string; taskId: string; laneId: string; repetition: number;
  laneKind: "keyless-conformance" | "live-provider";
  scenario: string;
  status: "executed" | "unavailable" | "inconclusive";
  verdict: "pass" | "fail" | null;
  reason: string | null;
  laneConfigurationSha256: string;
  process: Pick<ProcessOutcome, "exitCode" | "signal" | "terminatedBy" | "treeExitProven" | "durationMs"> | null;
  oracle: ComparisonOracle | null;
  observations: ComparisonObservations | null;
  budgetStatus: "not-applicable" | "unknown" | "within-recorded-bounds" | "exceeded";
  artifacts: ComparisonArtifact[];
}

export interface HarnessComparisonReport {
  schemaVersion: typeof HARNESS_COMPARISON_VERSION;
  comparisonId: string; startedAt: string; finishedAt: string;
  manifestSha256: string;
  /** Source commits are declared provenance; file SHA-256 pins are checked by execution. */
  provenance: "local-execution-with-pinned-files-and-declared-source-commits";
  environment: { platform: string; arch: string; nodeVersion: string };
  repeat: { api: "runHarnessComparison"; manifestPath: string; outputDirectoryMustBeNew: true; allowLive: boolean; allowAdapterExecution: boolean; argv: string[] };
  limitations: string[];
  manifest: HarnessComparisonManifest;
  trials: HarnessComparisonTrial[];
  artifacts: ComparisonArtifact[];
}

export interface HarnessComparisonOptions {
  manifestPath: string;
  /** Must not already exist; no previous results are replaced. */
  outputDir: string;
  allowLive?: boolean;
  /** Explicit consent to execute the pinned adapters; runProcess is not an OS sandbox. */
  allowAdapterExecution?: boolean;
  /** Only explicitly named live-lane variables are forwarded. Never serialized. */
  secretEnv?: Readonly<Record<string, string>>;
  /** Known fixture canaries or additional exact values to remove from durable artifacts. */
  redactValues?: readonly string[];
  signal?: AbortSignal;
}

function commandArguments(command: ComparisonCommand, base: string, variables: Readonly<Record<string, string>>): string[] {
  const executable = resolveComparisonPin(command.executable, base);
  const inputs = command.inputs.map(pin => resolveComparisonPin(pin, base));
  const substitutions = { ...variables, ...Object.fromEntries(inputs.map((path, index) => [`input:${index}`, path])) };
  return [executable, ...command.args.map(argument => argument.replace(/\{\{([^{}]+)\}\}/g, (_match, name: string) => {
    const value = substitutions[name];
    if (value === undefined) throw new Error("Unknown comparison command placeholder.");
    return value;
  }))];
}

function processReceipt(outcome: ProcessOutcome): NonNullable<HarnessComparisonTrial["process"]> {
  return { exitCode: outcome.exitCode, signal: outcome.signal, terminatedBy: outcome.terminatedBy,
    treeExitProven: outcome.treeExitProven, durationMs: outcome.durationMs };
}

function publishableCapture(stream: ProcessOutcome["stdout"]): string {
  // A cap can split a credential before an exact-value detector recognizes it.
  // Retain explicit byte accounting rather than publish such a partial secret.
  return stream.droppedBytes ? "[AMC: truncated capture omitted from publication; see the byte-count receipt]\n" : stream.text;
}

async function settleProcessGroup(running: RunningProcess, outcome: ProcessOutcome): Promise<void> {
  if (outcome.treeExitProven || running.pid === null) return;
  running.terminate("dispose");
  // The shared substrate reports process-group proof, not arbitrary detached
  // descendant enumeration. Try bounded cleanup; never upgrade its receipt.
  if (process.platform !== "win32") {
    try { process.kill(-running.pid, "SIGTERM"); } catch { /* group may already have exited */ }
    await new Promise(resolve => setTimeout(resolve, 250));
    try { process.kill(-running.pid, "SIGKILL"); } catch { /* no group left to signal */ }
  }
}

function budgetStatus(lane: HarnessComparisonManifest["lanes"][number], observations: ComparisonObservations | null): HarnessComparisonTrial["budgetStatus"] {
  const { maxTokens, maxCostUsd } = lane.budgets;
  if (maxTokens === null && maxCostUsd === null) return "not-applicable";
  if ((maxTokens !== null && observations?.usage && observations.usage.inputTokens + observations.usage.outputTokens > maxTokens) ||
      (maxCostUsd !== null && observations?.cost && observations.cost.amountUsd > maxCostUsd)) return "exceeded";
  if ((maxTokens !== null && !observations?.usage) || (maxCostUsd !== null && !observations?.cost)) return "unknown";
  return "within-recorded-bounds";
}

/** Runs only operator-selected, pinned local commands; never fabricates a trial or a score. */
export async function runHarnessComparison(options: HarnessComparisonOptions): Promise<HarnessComparisonReport> {
  const bytes = readComparisonFile(resolve(options.manifestPath));
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("The comparison manifest is not valid JSON."); }
  const validated = harnessComparisonManifestSchema.safeParse(parsed);
  if (!validated.success) throw new Error("The comparison manifest does not satisfy the versioned matched-lane contract.");
  const manifest = validated.data;
  const secrets = [...Object.values(options.secretEnv ?? {}), ...(options.redactValues ?? [])].filter(Boolean);
  // Secrets belong in runtime variables, not command arguments or public manifests.
  if (redactComparisonText(bytes.toString("utf8"), secrets) !== bytes.toString("utf8")) throw new Error("The comparison manifest contains secret-like material; replace it with a named runtime variable.");
  for (const name of Object.keys(manifest.environment.variables)) {
    if (/^(?:HOME|USERPROFILE|XDG_|NODE_OPTIONS$|NODE_PATH$|AMC_|CODEX_|COLIMA_|DOCKER_|npm_config_|NPM_CONFIG_)/i.test(name) || /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(name)) {
      throw new Error("The public comparison environment contains a reserved or credential-like variable.");
    }
  }
  const base = dirname(resolve(options.manifestPath));
  const output = resolve(options.outputDir);
  if (existsSync(output)) throw new Error("Comparison output must be a new directory.");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  const report: HarnessComparisonReport = {
    schemaVersion: HARNESS_COMPARISON_VERSION, comparisonId: manifest.id, startedAt, finishedAt: startedAt,
    manifestSha256: comparisonSha256(bytes), provenance: "local-execution-with-pinned-files-and-declared-source-commits",
    environment: { platform: process.platform, arch: process.arch, nodeVersion: process.version },
    repeat: { api: "runHarnessComparison", manifestPath: resolve(options.manifestPath), outputDirectoryMustBeNew: true,
      allowLive: options.allowLive === true, allowAdapterExecution: options.allowAdapterExecution === true,
      argv: ["amc", "bench", "harness-compare", "--manifest", resolve(options.manifestPath), "--out", "<NEW_OUTPUT_DIRECTORY>",
        ...(options.allowAdapterExecution ? ["--allow-adapter-execution"] : []), ...(options.allowLive ? ["--live"] : [])] },
    limitations: [
      "Automated conformance is not a human usability study or a coding-performance ranking.",
      "Shared manifest settings match requested conditions; effective model, permission and token/spend enforcement remain the pinned adapter's responsibility.",
      "The runner enforces wall time, isolated HOME/work directories, bounded capture and process-group termination; it is not an OS filesystem/network sandbox.",
      "Source commits are declared provenance. Determinate trials require artifact, executable, fixture, adapter and oracle file digests to match before and after execution; this does not attest a build-to-source relationship or every dynamic dependency.",
      "Latency is complete target-command wall time including adapter startup and process-group wait, not model-only latency. Failed and inconclusive executions retain their timing.",
      "Token/cache/cost/action counters remain attributed observations; missing values are unknown, and token/spend comparisons are retrospective rather than a substitute for live budget enforcement.",
      "Durable raw captures are bounded and redacted; digests identify those retained bytes, not an undisclosed original. No superiority factor is inferred."
    ], manifest, trials: [], artifacts: []
  };
  report.artifacts.push(writeComparisonArtifact(output, "manifest.redacted.json", manifest, secrets));
  const environmentMatches = process.platform === manifest.environment.platform && process.arch === manifest.environment.arch && process.version.replace(/^v/, "") === manifest.environment.nodeVersion.replace(/^v/, "");

  for (let repetition = 0; repetition < manifest.repetitions; repetition += 1) {
    for (const task of manifest.tasks) {
      const lane = manifest.lanes.find(row => row.id === task.laneId)!;
      // Rotate target order deterministically; serial execution is explicit and repeatable.
      const targets = [...manifest.targets.slice(repetition % manifest.targets.length), ...manifest.targets.slice(0, repetition % manifest.targets.length)];
      for (const target of targets) {
        const trial: HarnessComparisonTrial = {
          id: `t${report.trials.length + 1}-${target.id}-${task.id}-r${repetition + 1}`, targetId: target.id, taskId: task.id, laneId: lane.id,
          repetition: repetition + 1, laneKind: lane.kind, scenario: task.scenario,
          status: "unavailable", verdict: null, reason: null, laneConfigurationSha256: comparisonSha256(JSON.stringify(lane)),
          process: null, oracle: null, observations: null, budgetStatus: "unknown", artifacts: []
        };
        report.trials.push(trial);
        const binding = target.bindings.find(row => row.taskId === task.id);
        if (!environmentMatches) trial.reason = "The actual platform, architecture or Node version does not match the manifest.";
        else if (!options.allowAdapterExecution) trial.reason = "Pinned adapter execution was not enabled.";
        else if (options.signal?.aborted) trial.reason = "Comparison cancelled before this trial started.";
        else if (!binding?.command) trial.reason = binding?.unavailableReason ?? "No executable binding is supplied for this target/scenario; source-only.";
        else if (lane.kind === "live-provider" && !options.allowLive) trial.reason = "Live-provider execution was not enabled.";
        else if (lane.kind === "live-provider" && !binding.supportsBoundedLiveExecution) trial.reason = "This adapter does not declare bounded live execution support.";
        else if (lane.requiredSecretEnv.some(name => !options.secretEnv?.[name])) trial.reason = "Required named live credentials are unavailable.";
        if (trial.reason) continue;

        let work: string | undefined;
        try {
          const artifact = resolveComparisonPin(target.artifact, base);
          const fixture = readComparisonFile(resolveComparisonPin(task.fixture, base));
          work = mkdtempSync(join(tmpdir(), "amc-harness-comparison-"));
          const home = join(work, "home");
          const workspace = join(work, "workspace");
          mkdirSync(home, { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
          const fixturePath = join(workspace, "fixture.input");
          const contextPath = join(workspace, "comparison-context.json");
          const observationsPath = join(workspace, "observations.json");
          writeFileSync(fixturePath, fixture, { mode: 0o400, flag: "wx" });
          writeFileSync(contextPath, JSON.stringify({ schemaVersion: HARNESS_COMPARISON_VERSION, trialId: trial.id,
            task, lane, target: { id: target.id, source: target.source, artifact: target.artifact },
            observationsPath, fixturePath }), { mode: 0o400, flag: "wx" });
          const variables = { workspace, fixture: fixturePath, context: contextPath, artifact, observations: observationsPath };
          const argv = commandArguments(binding!.command!, base, variables);
          const oracleArgv = commandArguments(task.oracle, base, variables);
          const publicEnv = { ...manifest.environment.variables, HOME: home, USERPROFILE: home,
            XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"), TMPDIR: work,
            AMC_COMPARISON_CONTEXT: contextPath, AMC_COMPARISON_OBSERVATIONS: observationsPath };
          const env = { ...publicEnv, ...Object.fromEntries(lane.requiredSecretEnv.map(name => [name, options.secretEnv![name]!])) };
          const running = runProcess({ argv, cwd: workspace, env, stdin: "ignore", stdout: "capture", stderr: "capture",
            maxCaptureBytes: manifest.captureBytesPerStream, scrubValues: [], graceMs: 2000,
            timeoutMs: lane.budgets.timeoutMs, ...(options.signal ? { signal: options.signal } : {}) });
          const outcome = await running.done;
          trial.process = processReceipt(outcome);
          await settleProcessGroup(running, outcome);
          trial.status = "inconclusive";
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.stdout.txt`, publishableCapture(outcome.stdout), secrets, true));
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.stderr.txt`, publishableCapture(outcome.stderr), secrets, true));
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.capture.json`, {
            stdout: { totalBytes: outcome.stdout.totalBytes, droppedBytes: outcome.stdout.droppedBytes },
            stderr: { totalBytes: outcome.stderr.totalBytes, droppedBytes: outcome.stderr.droppedBytes }
          }, secrets));
          if (outcome.stdout.droppedBytes || outcome.stderr.droppedBytes) { trial.reason = "Target capture was truncated; the oracle does not receive an apparently complete transcript."; continue; }
          if (!outcome.treeExitProven || outcome.terminatedBy !== null) { trial.reason = "Target execution was interrupted or process-group cleanup was not proven."; continue; }
          if (existsSync(observationsPath)) {
            const raw = readComparisonFile(observationsPath).toString("utf8");
            trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.observations.txt`, raw, secrets, true));
            trial.observations = comparisonObservationsSchema.parse(JSON.parse(raw));
          }
          trial.budgetStatus = budgetStatus(lane, trial.observations);
          const oracleInput = JSON.stringify({ schemaVersion: HARNESS_COMPARISON_VERSION, trialId: trial.id,
            taskId: task.id, lane, process: trial.process, stdout: outcome.stdout.text, stderr: outcome.stderr.text,
            observations: trial.observations, fixtureSha256: task.fixture.sha256 });
          // The oracle sees the bounded original captures through stdin, before
          // publication redaction. Otherwise runner redaction could fake a pass.
          const oracleRun = runProcess({ argv: oracleArgv, cwd: workspace, env: publicEnv, stdin: "pipe", stdout: "capture", stderr: "capture",
            maxCaptureBytes: manifest.captureBytesPerStream, scrubValues: [], graceMs: 2000,
            timeoutMs: Math.min(lane.budgets.timeoutMs, 60_000), ...(options.signal ? { signal: options.signal } : {}) });
          const delivered = await oracleRun.write(Buffer.from(oracleInput)); oracleRun.endStdin();
          const oracleOutcome = await oracleRun.done;
          await settleProcessGroup(oracleRun, oracleOutcome);
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.oracle.stdout.txt`, publishableCapture(oracleOutcome.stdout), secrets, true));
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.oracle.stderr.txt`, publishableCapture(oracleOutcome.stderr), secrets, true));
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.oracle.capture.json`, {
            process: processReceipt(oracleOutcome), stdout: { totalBytes: oracleOutcome.stdout.totalBytes, droppedBytes: oracleOutcome.stdout.droppedBytes },
            stderr: { totalBytes: oracleOutcome.stderr.totalBytes, droppedBytes: oracleOutcome.stderr.droppedBytes }
          }, secrets));
          if (!delivered || !oracleOutcome.treeExitProven || oracleOutcome.terminatedBy !== null || oracleOutcome.exitCode !== 0 || oracleOutcome.stdout.droppedBytes || oracleOutcome.stderr.droppedBytes) {
            trial.reason = "The independent oracle did not complete with an intact result."; continue;
          }
          trial.oracle = comparisonOracleSchema.parse(JSON.parse(oracleOutcome.stdout.text));
          // Detect changed inputs rather than claiming a repeatable pinned run.
          resolveComparisonPin(target.artifact, base); resolveComparisonPin(task.fixture, base);
          commandArguments(binding!.command!, base, variables); commandArguments(task.oracle, base, variables);
          if (comparisonSha256(readComparisonFile(fixturePath)) !== task.fixture.sha256) throw new Error("The trial fixture changed.");
          if (trial.oracle.verdict === "unsupported") { trial.reason = "The executed oracle identified an unsupported capability."; continue; }
          if (trial.oracle.verdict === "inconclusive") { trial.reason = "The independent oracle could not determine the scenario outcome."; continue; }
          if (trial.budgetStatus === "unknown") { trial.reason = "Required token/spend observations were not recorded."; continue; }
          trial.status = "executed";
          trial.verdict = trial.budgetStatus === "exceeded" ? "fail" : trial.oracle.verdict;
          trial.reason = trial.budgetStatus === "exceeded" ? "Recorded usage exceeded a declared limit." : null;
        } catch {
          trial.status = trial.process ? "inconclusive" : "unavailable";
          trial.verdict = null;
          trial.reason = "A pin, input, process or observation contract could not be established; no outcome was fabricated.";
        } finally {
          if (work) {
            try { rmSync(work, { recursive: true, force: true }); }
            catch { trial.status = "inconclusive"; trial.verdict = null; trial.reason = "The trial's temporary workspace could not be removed."; }
          }
          trial.artifacts.push(writeComparisonArtifact(output, `${trial.id}.receipt.json`, trial, secrets));
        }
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.artifacts.push(writeComparisonArtifact(output, "summary.json", summarizeHarnessComparison(report), secrets));
  report.artifacts.push(writeComparisonArtifact(output, "report.md", renderHarnessComparisonReport(report), secrets, true));
  writeComparisonArtifact(output, "report.json", report, secrets);
  return redactComparisonValue(report, secrets) as HarnessComparisonReport;
}
