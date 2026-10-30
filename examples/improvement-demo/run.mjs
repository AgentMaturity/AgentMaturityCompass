/** DEMO ONLY. Source-checkout example; no model, credentials, sockets or maturity evidence. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { initWorkspace } from "../../dist/workspace.js";
import { initBudgets } from "../../dist/budgets/budgets.js";
import { initApprovalPolicy } from "../../dist/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../../dist/runtime/firewall.js";
import { signWithPurposeKey } from "../../dist/keys/purposeProviders.js";
import { sha256Hex } from "../../dist/utils/hash.js";
import { getAgentPaths } from "../../dist/fleet/paths.js";
import { createExperiment, loadExperiment, gateExperiment, setExperimentBaseline, setExperimentCandidate } from "../../dist/experiments/experimentRunner.js";
import { runExecutedExperimentAsync } from "../../dist/experiments/executedExperiment.js";
import { nativeTrialRunner } from "../../dist/experiments/nativeTrialRunner.js";
import { stubProviderAdapter, stubProviderRoute, stubProviderTransport } from "../../dist/agent/stubProvider.js";
import { AdapterRegistry } from "../../dist/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../dist/llm/adapter/llmRuntime.js";
import { bodyFromChunks, readBodyText } from "../../dist/llm/adapter/transport.js";
import { openLedger } from "../../dist/ledger/ledger.js";
import { readEventPayload } from "../../dist/session/eventPayload.js";
import { effectiveTrustTier, evidenceProducer } from "../../dist/claims/evidenceProvenance.js";
import { fromRegisteredEmitter } from "../../dist/diagnostic/evidenceEmitters.js";

const here = dirname(fileURLToPath(import.meta.url));
const LABEL = "DEMO ONLY — synthetic fixture; never maturity evidence";
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function verifyPins(fixtureDir = here) {
  const manifest = readJson(join(fixtureDir, "manifest.json"));
  assert.equal(manifest.demoOnly, true);
  assert.equal(manifest.maturityEvidence, false);
  for (const file of ["baseline.json", "candidate.json", "casebook.json", "oracle.mjs", "run.mjs"]) {
    assert.equal(sha256Hex(readFileSync(join(fixtureDir, file))), manifest.files[file], `pin mismatch: ${file}`);
  }
  return manifest;
}

async function signFile(workspace, file, purpose) {
  const digestSha256 = sha256Hex(readFileSync(file));
  const signed = await signWithPurposeKey(workspace, purpose, Buffer.from(digestSha256, "hex"));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" }));
}

// The stock stub ignores personas. This fixture-only decoder scripts a single fs.read from the admitted config
// and the task's filename, then reuses the stock stub decoder and in-process transport. No judge/answers enter it.
function scriptedStubRunner(workspace, agentId) {
  return async (input) => {
    const config = JSON.parse(input.config.toString("utf8"));
    const adapter = { ...stubProviderAdapter, id: "amc-demo-only-scripted-stub", decode: async function* (response) {
      const echoed = JSON.parse(await readBodyText(response.body));
      if (!echoed.messages.some(message => message.content.some(block => block.type === "tool_result"))) {
        echoed.messages = [{ role: "user", content: [{ type: "text", text: JSON.stringify({ tool: "fs.read",
          arguments: { path: `${config.directory}/${input.view.context.filename}` } }) }] }];
      }
      yield* stubProviderAdapter.decode({ ...response, body: bodyFromChunks([JSON.stringify(echoed)]) });
    } };
    const route = { ...stubProviderRoute(), adapter };
    const registry = new AdapterRegistry();
    registry.register(route);
    const credentials = { resolve: () => { throw new Error("DEMO ONLY: credentials must never be requested"); } };
    const runTrial = nativeTrialRunner({ workspace, agentId, harnessVersion: "demo-only/1", maxSteps: 4,
      route: { providerId: route.providerId, model: route.models[0], params: { max_tokens: 512 } },
      makeLlm: session => new LlmRuntime({ session, registry, credentials, transport: stubProviderTransport() }) });
    return await runTrial({ ...input, stamp: { ...input.stamp, demoOnly: true, claimKind: "synthetic_example", trustTier: "SELF_REPORTED" } });
  };
}

export async function runDemo({ fixtureDir = here } = {}) {
  const manifest = verifyPins(fixtureDir);
  const book = readJson(join(fixtureDir, "casebook.json"));
  const { oracle } = await import(pathToFileURL(join(fixtureDir, "oracle.mjs")).href);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "amc-demo-only-")));
  const workspace = join(scratch, "workspace");
  mkdirSync(workspace);
  const environment = { AMC_VAULT_PASSPHRASE: randomBytes(32).toString("hex"), AMC_HOME: join(scratch, "home"),
    AMC_GUARD_EVENTS_DB_PATH: join(workspace, ".amc", "guard_events.sqlite"), AMC_GUARD_RECEIPTS_WORKSPACE: workspace,
    AMC_CONTROL_CHECKPOINT_DIR: join(scratch, "checkpoints") };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    const agentId = "demo-only";
    initWorkspace({ workspacePath: workspace, agentId, trustBoundaryMode: "isolated" });
    initBudgets(workspace, agentId);
    initApprovalPolicy(workspace);
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    const root = getAgentPaths(workspace, agentId).rootDir;
    const bookDir = join(root, "casebooks", book.casebookId);
    mkdirSync(join(bookDir, "cases"), { recursive: true });
    mkdirSync(join(workspace, "workspace", "demo-only-notes"), { recursive: true });
    const index = join(bookDir, "casebook.yaml");
    writeFileSync(index, YAML.stringify({ casebook: { version: 1, casebookId: book.casebookId, agentId,
      title: LABEL, description: LABEL, createdTs: 0, caseIds: book.cases.map(kase => kase.caseId) } }));
    await signFile(workspace, index, "config-signature");
    for (const kase of book.cases) {
      writeFileSync(join(workspace, "workspace", "demo-only-notes", kase.filename), kase.content);
      const file = join(bookDir, "cases", `${kase.caseId}.json`);
      writeFileSync(file, JSON.stringify({ v: 1, caseId: kase.caseId, title: LABEL, description: LABEL, riskTier: "low",
        requestedMode: "EXECUTE", allowedActionClasses: ["READ_ONLY"],
        inputs: { prompt: "DEMO ONLY: read the task's note using fs.read.", context: { filename: kase.filename } },
        validators: { requiredToolActions: ["fs.read"], forbiddenAudits: ["TOOL_CALL_FAILED", "TOOL_CALL_DENIED"], minCorrelationRatio: 0, requireReceipts: true },
        scoring: { successPoints: 60, valuePoints: 100 } }));
      await signFile(workspace, file, "config-signature");
    }
    const created = createExperiment({ workspace, agentId, name: LABEL, casebookId: book.casebookId });
    // The existing definition schema accepts a pinned experiment ID; it seeds the ordinary holdout partition.
    const definition = loadExperiment(workspace, agentId, created.experimentId);
    definition.experiment.experimentId = manifest.experimentId;
    const experimentDir = join(root, "experiments", manifest.experimentId);
    mkdirSync(experimentDir, { recursive: true });
    writeFileSync(join(experimentDir, "experiment.yaml"), YAML.stringify(definition));
    const baselineFile = join(workspace, "baseline-demo-only.json"), candidateFile = join(workspace, "candidate-demo-only.json");
    writeFileSync(baselineFile, readFileSync(join(fixtureDir, "baseline.json")));
    writeFileSync(candidateFile, readFileSync(join(fixtureDir, "candidate.json")));
    setExperimentBaseline({ workspace, agentId, experimentId: manifest.experimentId, config: { path: baselineFile } });
    await signFile(workspace, candidateFile, "artifact-seal");
    setExperimentCandidate({ workspace, agentId, experimentId: manifest.experimentId, candidateFile });
    const { report } = await runExecutedExperimentAsync({ workspace, agentId, experimentId: manifest.experimentId, mode: "supervise",
      trials: { runTrial: scriptedStubRunner(workspace, agentId), executorIdentity: "native:stub/amc-demo-only-scripted-stub/1",
        limits: { maxExecutions: 6, trialTimeoutMs: 30_000, concurrency: 1 } } });
    const policyPath = join(workspace, "gate-demo-only.json");
    writeFileSync(policyPath, JSON.stringify(manifest.gate));
    const gate = gateExperiment({ workspace, agentId, experimentId: manifest.experimentId, policyPath });
    const ledger = openLedger(workspace);
    let cases, provenance;
    try {
      const events = ledger.getAllEvents();
      const results = (execution) => events.filter(event => event.event_type === "tool/result" && execution.eventIds.includes(event.id))
        .map(event => { const payload = readEventPayload(workspace, event); assert.equal(payload.status, "ok");
          return { outcome: JSON.parse(event.meta_json).outcome, content: payload.bytes.toString("utf8") }; });
      cases = report.cases.filter(kase => report.execution.caseIds.includes(kase.caseId)).map(kase => ({ demoOnly: true,
        caseId: kase.caseId, baseline: kase.baselineStatus, candidate: kase.candidateStatus,
        baselineOracle: oracle(kase.caseId, results(kase.baselineExecution)), candidateOracle: oracle(kase.caseId, results(kase.candidateExecution)) }));
      provenance = { syntheticRows: events.filter(event => evidenceProducer(event) === "synthetic").length,
        bookkeepingRows: events.filter(event => JSON.parse(event.meta_json).auditType === "EXPERIMENT_CASE_TRIAL").length,
        maturityRows: events.filter(event => { const meta = JSON.parse(event.meta_json);
          return fromRegisteredEmitter({ event_type: event.event_type, meta, trustTier: effectiveTrustTier(event, { trustList: null }) }); }).length };
    } finally { ledger.close(); }
    assert.ok(cases.length === 3 && cases.every(kase => kase.baseline === "failed" && !kase.baselineOracle && kase.candidate === "passed" && kase.candidateOracle)
      && gate.status === "pass" && gate.decision === "promote-candidate" && provenance.maturityRows === 0, `demo-only acceptance failed: gate=${gate.status}/${gate.decision}`);
    return { demoOnly: true, maturityEvidence: false, label: LABEL, manifestSha256: sha256Hex(readFileSync(join(fixtureDir, "manifest.json"))),
      method: report.execution.method, evaluatedSplit: report.execution.evaluatedSplit, cases,
      baseline: { failed: cases.filter(kase => kase.baseline === "failed").length }, candidate: { passed: cases.filter(kase => kase.candidate === "passed").length },
      gate: { status: gate.status, decision: gate.decision }, provenance };
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runDemo(), null, 2)); }
  catch (error) { console.error(`${LABEL}: ${error.message}`); process.exitCode = 1; }
}
