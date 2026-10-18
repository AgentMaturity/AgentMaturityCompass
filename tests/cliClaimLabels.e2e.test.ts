import { execFile } from "node:child_process";
import { generateKeyPairSync, createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { RESULT_COMMANDS } from "../src/cli/resultCommandRegistry.js";
import { CLAIM_KINDS, statusDimensionsSchema } from "../src/claims/eligibility/index.js";
import { createIndustryPackLicenseKey } from "../src/domains/industryPackEntitlement.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";

/** P0-22 actual stdout qualification. No recorded-label boolean substitutes for emitted claim fields.
 * Every registry path has an explicit recipe below. Named missing fixtures may refuse; parser errors,
 * timeouts, signals and strict exit 70 always fail. Literal empty arrays remain acceptance failures.
 */
interface Recipe { path: string; args: string[]; json?: boolean; output?: "markdown" | "info-badge" | "badge-url"; refusal?: { reason: string; pattern: string };
  /** Sid's open P0-22 decision: a successful empty JSON array carries no claim fields. Held as RED evidence in the receipt. */
  emptyArrayHeld?: string }
const recipes: Recipe[] = [
  {"path": "fix", "args": ["--dry-run", "--yes", "--json"], "json": true},
  {"path": "improve", "args": ["--json"], "json": true, "refusal": {"reason": "The isolated process has no TTY or survey answers.", "pattern": "terminal|interactive|No diagnostic|No evidence|not found|requires"}},
  {"path": "quickscore", "args": ["--auto", "--json"], "json": true},
  {"path": "run", "args": ["--score-only", "--json"], "json": true},
  {"path": "report", "args": ["@RUN@"], "output": "markdown"},
  {"path": "verify all", "args": ["--json"], "json": true, "refusal": {"reason": "The private monitor trust root is not independently pinned; optional policies do not grant anchoring.", "pattern": "Ledger verification FAILED: UNANCHORED"}},
  {"path": "eval import", "args": ["--format", "openai", "--file", "@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "eval status", "args": ["--json"], "json": true},
  {"path": "eval run", "args": ["--format", "json"], "json": true},
  {"path": "bundle export", "args": ["--run", "@RUN@", "--out", "@OUT@"]},
  {"path": "bundle verify", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "bundle inspect", "args": ["@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "bundle diff", "args": ["@MISSING@", "@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "ci check", "args": ["--json"], "json": true, "refusal": {"reason": "The signed empty-evidence run cannot meet the actual CI maturity gate.", "pattern": "threshold|score|level|No.*evidence|fail|FAIL|below|INVALID"}},
  {"path": "ci redteam", "args": ["default", "--plugins", "injection", "--strategies", "direct", "--no-sign", "--json"], "json": true, "refusal": {"reason": "No live agent adapter or gaming-resistance evidence is registered.", "pattern": "P0_22_OFFLINE_FIXTURE|No real agent target available|no model configured"}},
  {"path": "export grc", "args": ["--framework", "EU_AI_ACT", "--out", "@OUT@", "--json"], "json": true},
  {"path": "export badge", "args": ["--run", "@RUN@", "--out", "@OUT@"]},
  {"path": "assurance toctou", "args": ["--agent", "default", "--json"], "json": true, "refusal": {"reason": "No live model or assurance adapter is configured.", "pattern": "No real agent target available: no model configured for the agent under test"}},
  {"path": "assurance compound-threats", "args": ["--agent", "default", "--json"], "json": true, "refusal": {"reason": "No live model or assurance adapter is configured.", "pattern": "No real agent target available: no model configured for the agent under test"}},
  {"path": "assurance shutdown-compliance", "args": ["--agent", "default", "--json"], "json": true, "refusal": {"reason": "No live model or assurance adapter is configured.", "pattern": "No real agent target available: no model configured for the agent under test"}},
  {"path": "assurance advanced-threats", "args": ["--agent", "default", "--json"], "json": true, "refusal": {"reason": "No live model or assurance adapter is configured.", "pattern": "No real agent target available: no model configured for the agent under test"}},
  {"path": "assurance run", "args": ["--agent", "default", "--pack", "injection", "--no-sign", "--format", "text"], "refusal": {"reason": "No live agent adapter is registered; native transport is denied.", "pattern": "P0_22_OFFLINE_FIXTURE|no model configured|no agent under test was reachable"}},
  {"path": "assurance runs", "args": []},
  {"path": "assurance show", "args": ["--run", "fixture-missing-run"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "assurance cert-issue", "args": ["--run", "fixture-missing-run"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "assurance cert-verify", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "assurance scheduler run-now", "args": [], "refusal": {"reason": "No live model or assurance adapter is configured.", "pattern": "No real agent target available: no model configured for the agent under test"}},
  {"path": "assurance verify", "args": ["--assuranceRun", "fixture-missing-run"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "cert generate", "args": ["--agent", "default", "--output", "@OUT@", "--preview"], "refusal": {"reason": "No mature evidence or qualified certification record exists.", "pattern": "not found|No.*run|No.*evidence|refus|not.*eligible|insufficient|not.*valid|fail|FAIL"}},
  {"path": "cert verify", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "cert inspect", "args": ["@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "notary attest", "args": ["--out", "@OUT@", "--notary-dir", "@NOTARY@", "--workspace", "@WORKSPACE@"], "refusal": {"reason": "No independently initialized notary trust directory or service exists.", "pattern": "P0_22_OFFLINE_FIXTURE|ENOENT|not found|not initialized|Notary|notary"}},
  {"path": "notary verify-attest", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "loop run", "args": ["--days", "1"], "refusal": {"reason": "No live model or assurance adapter is configured for the recurring assurance stage.", "pattern": "No real agent target available: no model configured for the agent under test"}},
  {"path": "transparency verify", "args": []},
  {"path": "transparency verify-bundle", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "transparency report", "args": ["default", "--format", "json"], "json": true},
  {"path": "compliance report", "args": ["--framework", "EU_AI_ACT", "--json"], "json": true},
  {"path": "compliance fleet", "args": ["--framework", "EU_AI_ACT", "--window", "30d", "--out", "@OUT@"]},
  {"path": "compliance diff", "args": ["@MISSING@", "@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "compliance matrix", "args": ["--json"], "json": true},
  {"path": "compliance risk-classify", "args": ["--json"], "json": true},
  {"path": "compliance roadmap", "args": ["--framework", "EU_AI_ACT", "--json"], "json": true},
  {"path": "outcomes attest", "args": ["--metric", "fixture-missing-metric", "--value", "0", "--reason", "P0-22 fixture attestation"], "refusal": {"reason": "The named outcome metric is absent from the signed contract.", "pattern": "metric|contract|not found|unknown|ENOENT"}},
  {"path": "audit binder create", "args": ["--scope", "agent", "--id", "default", "--out", "@OUT@"], "refusal": {"reason": "No auditor request, review record or complete evidence binder exists.", "pattern": "not found|ENOENT|refus|required|No.*request|invalid|unavailable"}},
  {"path": "audit binder verify", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "No audit binder file exists; the actual verifier must report UNREADABLE.", "pattern": "UNREADABLE: cannot read audit file|\"code\": \"UNREADABLE\""}},
  {"path": "audit verify", "args": []},
  {"path": "passport create", "args": ["--scope", "agent", "--id", "default", "--out", "@OUT@"], "refusal": {"reason": "No signed Passport policy is installed in this minimal workspace.", "pattern": "passport policy signature invalid: file missing"}},
  {"path": "passport verify", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "passport show", "args": ["@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "passport badge", "args": ["--scope", "agent", "--id", "default"], "refusal": {"reason": "No qualified Passport exists in this private fixture.", "pattern": "not found|No.*passport|No.*Passport|ENOENT|refus"}, "output": "info-badge"},
  {"path": "passport export-latest", "args": ["--scope", "agent", "--id", "default", "--out", "@OUT@"], "refusal": {"reason": "No previously generated Passport exists.", "pattern": "not found|No.*passport|No.*Passport|ENOENT"}},
  {"path": "passport share", "args": ["--agent", "default", "--format", "json", "--out", "@OUT@"], "json": true},
  {"path": "passport compare", "args": ["default", "fixture-missing-agent"], "refusal": {"reason": "The second named agent has no recorded run or Passport.", "pattern": "not found|No.*run|No.*passport|No.*Passport|ENOENT"}},
  {"path": "passport search", "args": ["--capability", "p0-22-empty-capability"], "json": true, "emptyArrayHeld": "qualification/2026-10-14-P0-22/red-cases-held-out-of-root-suite.md"},
  {"path": "passport verify-token", "args": ['{"tokenId":"fixture","expiresAt":0,"claims":[],"signature":"invalid"}', "--json"], "json": true, "refusal": {"reason": "No signed trust token is supplied; the empty JSON object must fail verification.", "pattern": "token|missing|invalid|signature|fail|FAIL|unverified"}},
  {"path": "passport translate-score", "args": ["--from", "amc", "--to", "nist_ai_rmf", "--score", "0", "--json"], "json": true},
  {"path": "gate", "args": ["--bundle", "@MISSING@", "--policy", "@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|missing"}},
  {"path": "certify", "args": ["--run", "@RUN@", "--policy", "@MISSING@", "--out", "@OUT@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|missing"}},
  {"path": "fleet report", "args": ["--format", "md", "--output", "@OUT@"], "json": false},
  {"path": "fleet score", "args": ["--json"], "json": true, "refusal": {"reason": "The signed empty-evidence run may fail the actual fleet readiness gate.", "pattern": "threshold|score|level|No.*evidence|fail|FAIL|below|INVALID|signature"}},
  {"path": "fleet health", "args": ["--json"], "json": true},
  {"path": "fleet status", "args": ["--json"], "json": true},
  {"path": "fleet overview", "args": ["--json"], "json": true},
  {"path": "fleet slo status", "args": []},
  {"path": "fleet trust-report", "args": [], "refusal": {"reason": "The private ledger has no usable observed fleet evidence.", "pattern": "not found|No.*run|No.*evidence|refus|insufficient|signature|INVALID"}},
  {"path": "agent diagnose", "args": ["--token-file", "@MISSING@", "--studio", "http://127.0.0.1:1"], "refusal": {"reason": "No Studio token file exists and the fixture denies network transport.", "pattern": "ENOENT|P0_22_OFFLINE_FIXTURE"}},
  {"path": "ingest", "args": ["@MISSING@", "--type", "generic_text"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "attest", "args": ["--ingest-session", "fixture-missing-session", "--attested-by", "fixture-operator", "--statement", "P0-22 fixture only"], "refusal": {"reason": "No matching ingested session exists.", "pattern": "session|not found|missing|ENOENT"}},
  {"path": "transform attest", "args": ["--agent", "default", "--task", "fixture-missing-task", "--statement", "P0-22 fixture only"], "refusal": {"reason": "No matching transformation task exists.", "pattern": "task|not found|missing|ENOENT"}},
  {"path": "transform attest-verify", "args": ["@MISSING@"], "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "org score", "args": []},
  {"path": "org community score", "args": ["--platform", "fixture-community"]},
  {"path": "benchmark verify", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "benchmark report", "args": ["--out", "@OUT@"]},
  {"path": "benchmark stats", "args": []},
  {"path": "benchmark run", "args": ["--agent", "default", "--json"], "json": true, "refusal": {"reason": "No live model adapter or executed benchmark receipt is registered.", "pattern": "P0_22_OFFLINE_FIXTURE|not configured|No.*adapter|refus|unavailable|UNAVAILABLE|not measured|NO_"}},
  {"path": "benchmark compare", "args": ["default", "fixture-missing-agent", "--json"], "json": true, "refusal": {"reason": "The named secondary agent has no benchmark record.", "pattern": "No.*benchmark|not found|No.*run|No.*agent|missing|unavailable|UNAVAILABLE|NO_"}},
  {"path": "benchmark provider-drift", "args": ["--file", "@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "benchmark replay-corpus", "args": ["--file", "@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "lab-simulate", "args": ["--experiment", "@EXPERIMENT@"]},
  {"path": "a4 list", "args": ["--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "a4 show", "args": ["a4p_00000000000000000000000000000000", "--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "a4 readiness", "args": ["a4p_00000000000000000000000000000000", "--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "a4 verify", "args": ["a4p_00000000000000000000000000000000", "--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "a4 release", "args": ["a4p_00000000000000000000000000000000", "--session-token-file", "@MISSING@", "--expect-head-seq", "1", "--gate", "a4gate_00000000000000000000000000000000", "--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "a4 deploy verify", "args": ["a4p_00000000000000000000000000000000", "a4r_00000000000000000000000000000000", "--session-token-file", "@MISSING@", "--expect-head-seq", "1", "--environment", "staging", "--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "a4 export", "args": ["a4p_00000000000000000000000000000000", "--run", "@RUN@", "--out", "@OUT@", "--json"], "json": true, "refusal": {"reason": "A4 Forge is a preview this fixture does not enable (AMC_A4_PREVIEW unset).", "pattern": "A4_PREVIEW_DISABLED"}},
  {"path": "lab-report", "args": ["--experiment", "@EXPERIMENT@"]},
  {"path": "lab-compare", "args": ["--baseline", "@LAB_BASELINE@", "--candidate", "@LAB_CANDIDATE@"]},
  {"path": "insider-risk-scores", "args": []},
  {"path": "attestation-export", "args": ["--tenant", "fixture-tenant"]},
  {"path": "residency-report", "args": ["--tenant", "fixture-tenant"], "refusal": {"reason": "No signed data residency policy has been configured for this tenant.", "pattern": "residency|policy|ENOENT|not found"}, "output": "markdown"},
  {"path": "why-capped", "args": []},
  {"path": "confidence-drift", "args": []},
  {"path": "unknowns", "args": []},
  {"path": "meta-confidence", "args": []},
  {"path": "shield analyze-runtime", "args": ["--agent", "default", "--action", "read", "--tool", "fixture-read", "--parameters", "{}", "--json"], "json": true},
  {"path": "shield reputation", "args": ["fixture-missing-tool", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "shield trust-pipeline", "args": ["--agent", "default", "--action", "read", "--tool", "fixture-read", "--json"], "json": true},
  {"path": "shield posture", "args": ["--json"], "json": true},
  {"path": "shield analyze-mcp", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "enforce formal-verify", "args": []},
  {"path": "enforce verify-certificate", "args": ['{"certificateHash":"invalid","proofTree":{"id":"fixture","rule":"axiom","conclusion":{"text":"fixture","predicate":"fixture","freeVars":[]},"premises":[],"verified":true,"hash":"invalid"}}', "--json"], "json": true, "refusal": {"reason": "No signed certificate is supplied; the empty JSON object must fail verification.", "pattern": "certificate|missing|invalid|signature|fail|FAIL|unverified"}},
  {"path": "watch attest", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "product autonomy", "args": ["default", "supervised", "--json"], "json": true},
  {"path": "domain apply", "args": ["--agent", "default", "--pack", "clinical-trials", "--audit", "--dry-run", "--json"], "json": true},
  {"path": "domain pack run", "args": ["--pack", "clinical-trials", "--baseline", "--json"], "json": true},
  {"path": "domain assess", "args": ["--agent", "default", "--domain", "health", "--example", "--json"], "json": true},
  {"path": "domain gaps", "args": ["--agent", "default", "--domain", "health", "--example", "--json"], "json": true},
  {"path": "domain report", "args": ["--agent", "default", "--domain", "health", "--output", "@OUT@", "--example", "--json"], "json": true},
  {"path": "domain assurance", "args": ["--agent", "default", "--domain", "health", "--example", "--json"], "json": true},
  {"path": "domain roadmap", "args": ["--agent", "default", "--domain", "health", "--example", "--json"], "json": true},
  {"path": "domain conformance", "args": ["--station", "health", "--agent", "default", "--max-evidence-age", "24h", "--json"], "json": true, "refusal": {"reason": "No signed active station operating profile or conformance responses exist.", "pattern": "not found|ENOENT|profile|unavailable|refus|operating"}},
  {"path": "score", "args": []},
  {"path": "score formal-spec", "args": ["default", "--json"], "json": true},
  {"path": "score adversarial", "args": ["default", "--json"], "json": true},
  {"path": "score collect-evidence", "args": ["default", "--json"], "json": true},
  {"path": "score production-ready", "args": ["--json"], "json": true},
  {"path": "score operational-independence", "args": ["default", "--json"], "json": true},
  {"path": "score behavioral-contract", "args": ["--json"], "json": true},
  {"path": "score fail-secure", "args": ["--json"], "json": true},
  {"path": "score output-integrity", "args": ["--json"], "json": true},
  {"path": "score state-portability", "args": ["--json"], "json": true},
  {"path": "score eu-ai-act", "args": ["--json"], "json": true},
  {"path": "score owasp-llm", "args": ["--json"], "json": true},
  {"path": "score regulatory-readiness", "args": ["--agent", "default", "--json"], "json": true},
  {"path": "score self-knowledge", "args": ["--json"], "json": true},
  {"path": "score kernel-sandbox", "args": ["--json"], "json": true},
  {"path": "score runtime-identity", "args": ["--json"], "json": true},
  {"path": "score calibration-gap", "args": ["--json"], "json": true},
  {"path": "score evidence-conflict", "args": ["--json"], "json": true},
  {"path": "score density-map", "args": ["--json"], "json": true},
  {"path": "score evidence-ingest", "args": ["--json"], "json": true},
  {"path": "score level-transition", "args": ["--json"], "json": true},
  {"path": "score gaming-resistance", "args": ["--json"], "json": true},
  {"path": "score sleeper-detection", "args": ["--json"], "json": true},
  {"path": "score audit-depth", "args": ["--json"], "json": true},
  {"path": "score policy-consistency", "args": ["--json"], "json": true},
  {"path": "score autonomy-duration", "args": ["--json"], "json": true},
  {"path": "score pause-quality", "args": ["--json"], "json": true},
  {"path": "score task-horizon", "args": ["--json"], "json": true},
  {"path": "score factuality", "args": ["--json"], "json": true},
  {"path": "score alignment-index", "args": ["--json"], "json": true},
  {"path": "score interpretability", "args": ["--json"], "json": true},
  {"path": "score faithfulness", "args": ["--json"], "json": true},
  {"path": "score a2a-protocol", "args": ["--json"], "json": true},
  {"path": "score distributed-agents", "args": ["--json"], "json": true},
  {"path": "score memory-integrity", "args": ["--json"], "json": true},
  {"path": "score memory-depth", "args": ["--json"], "json": true},
  {"path": "score output-attestation", "args": ["--json"], "json": true},
  {"path": "score mutual-verification", "args": ["--json"], "json": true},
  {"path": "score transparency-log", "args": ["--json"], "json": true},
  {"path": "score tier", "args": ["--json"], "json": true},
  {"path": "score industry-adjust", "args": ["--industry", "healthcare", "--score", "0", "--json"], "json": true},
  {"path": "score industry-benchmark", "args": ["--industry", "healthcare", "--json"], "json": true},
  {"path": "score simulation-lane", "args": ["--system-type", "simulation-engine", "--json"], "json": true},
  {"path": "score safety-research", "args": ["--json"], "json": true},
  {"path": "memory assess", "args": ["default", "--json"], "json": true},
  {"path": "dag score", "args": ["--json"], "json": true},
  {"path": "quickstart", "args": [], "refusal": {"reason": "No TTY is attached; the interactive result path must refuse instead of inventing a score.", "pattern": "Interactive quickstart requires a terminal"}},
  {"path": "demo run", "args": ["--gateway", "http://127.0.0.1:1", "--json"], "json": true, "refusal": {"reason": "No gateway is started; the explicit owned fixture denies all network transport.", "pattern": "P0_22_OFFLINE_FIXTURE|not.*connect|ECONNREFUSED|fail|FAIL|unavailable"}},
  {"path": "demo prospect", "args": ["--json", "--out", "@OUT@"], "json": true},
  {"path": "demo share", "args": ["--json", "--out", "@OUT@"], "json": true},
  {"path": "observe timeline", "args": ["--agent", "default", "--json"], "json": true},
  {"path": "import", "args": ["@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "strategy compare", "args": ["--file", "@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "lite-score", "args": ["--json"], "json": true},
  {"path": "business kpi", "args": ["--json"], "json": true},
  {"path": "business risk", "args": ["--json"], "json": true},
  {"path": "business grc-export", "args": ["--portfolio", "@MISSING@", "--json"], "json": true, "refusal": {"reason": "This fixture deliberately has no external artifact, imported export, receipt, or named secondary run.", "pattern": "ENOENT|not found|No .*found|missing|unavailable|unknown.*run|does not exist"}},
  {"path": "business report", "args": ["--json"], "json": true},
  {"path": "executive brief", "args": ["--run", "@RUN@", "--format", "markdown"], "json": false},
  {"path": "leaderboard show", "args": ["--json"], "json": true, "emptyArrayHeld": "qualification/2026-10-14-P0-22/red-cases-held-out-of-root-suite.md"},
  {"path": "leaderboard export", "args": ["--format", "json", "--output", "@OUT@"], "json": false},
  {"path": "leaderboard public-export", "args": ["--output", "@OUT@", "--dataset-id", "p0-22-fixture", "--name", "P0-22 fixture", "--license", "CC0-1.0", "--salt", "p0-22-owned-salt", "--json"], "json": true, "refusal": {"reason": "The private fixture has zero scored fleet agents; retain the actual default five-agent public cohort gate.", "pattern": "Public leaderboard export requires at least 5 scored agents; found [0-4]\\b"}},
  {"path": "comms-check", "args": ["--text", "Fixture system supports human review.", "--json"], "json": true},
  {"path": "badge", "args": ["--agent", "default"], "json": false, "output": "info-badge"},
  {"path": "mirofish run", "args": ["--scenario", "@SCENARIO@", "--iterations", "2", "--seed", "7", "--output", "json"], "json": true},
  {"path": "mirofish compare", "args": ["@SCENARIO@", "@SCENARIO@", "--iterations", "2", "--seed", "7"]},
  {"path": "mirofish stress", "args": ["@SCENARIO@", "--seed", "7"]},
  {"path": "session verify", "args": ["--json"], "json": true, "refusal": {"reason": "The private monitor key is not independently pinned; local chain integrity cannot imply anchoring.", "pattern": "not-pinned|not pinned"}},
];

const cli = resolve(process.cwd(), "dist/cli.js");
const root = mkdtempSync(join(tmpdir(), "amc-p022-cli-labels-"));
const workspace = join(root, "workspace");
const home = join(root, "home");
const logs = resolve(process.cwd(), "tmp", `p0-22-claim-labels-${Date.now()}-${process.pid}`);
const guard = join(root, "offline.mjs");
let runId = "";
let experimentId = "";
let labBaselineId = "";
let labCandidateId = "";
let environment: NodeJS.ProcessEnv;
const records: Array<Record<string, unknown>> = [];

// One signed workspace is shared. Serial permits prevent two subprocesses changing its signed ledger
// concurrently; describe.concurrent still schedules the complete bounded corpus, including refusals.
let tail = Promise.resolve();
async function withWorkspacePermit<T>(body: () => Promise<T>): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((done) => { release = done; });
  await previous;
  try { return await body(); } finally { release(); }
}

function hash(text: string): string { return createHash("sha256").update(text).digest("hex"); }
function materialize(value: string, path: string): string {
  const tag = path.replaceAll(" ", "-");
  return ({ "@RUN@": runId, "@EXPERIMENT@": experimentId, "@LAB_BASELINE@": labBaselineId, "@LAB_CANDIDATE@": labCandidateId, "@WORKSPACE@": workspace,
    "@NOTARY@": join(root, "uninitialized-notary"), "@SCENARIO@": join(root, "scenario.yaml"),
    "@MISSING@": join(root, "deliberately-absent-fixture.json"), "@OUT@": join(root, "outputs", `${tag}.json`) } as Record<string, string>)[value] ?? value;
}

async function invoke(name: string, args: string[]) {
  const started = Date.now();
  const result = await new Promise<{ status: number | null; signal: string | null; error?: string; stdout: string; stderr: string }>((done) => {
    execFile(process.execPath, ["--import", guard, cli, ...args], {
      cwd: workspace, env: environment, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024
    }, (error, stdout, stderr) => {
      const failure = error as (Error & { code?: string | number; signal?: string; killed?: boolean }) | null;
      done({ status: !failure ? 0 : typeof failure.code === "number" ? failure.code : null,
        signal: failure?.signal ?? null,
        ...(failure && typeof failure.code !== "number" ? { error: failure.message } : {}), stdout, stderr });
    });
  });
  const tag = name.replace(/[^a-z0-9]+/gi, "-");
  writeFileSync(join(logs, `${tag}.stdout`), result.stdout);
  writeFileSync(join(logs, `${tag}.stderr`), result.stderr);
  const record = { name, args, ...result, durationMs: Date.now() - started,
    stdoutSha256: hash(result.stdout), stderrSha256: hash(result.stderr) };
  records.push(record);
  writeFileSync(join(logs, "commands.json"), JSON.stringify(records, null, 2));
  return result;
}

function completed(result: Awaited<ReturnType<typeof invoke>>): void {
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).not.toBeNull();
  expect(result.status, "strict result path emitted no canonical claim").not.toBe(70);
  expect(`${result.stdout}\n${result.stderr}`, "Commander errors do not qualify missing-fixture behavior")
    .not.toMatch(/unknown option|missing required argument|required option .+ not specified|unknown command/i);
}

function jsonDocument(stdout: string): unknown {
  // Some current commands print a progress title before their JSON document. Parse the actual suffix;
  // trailing non-JSON output still fails, and nothing is synthesized or read from an internal marker.
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  const start = trimmed.search(/^[\[{]/m);
  expect(start, `No JSON document on stdout: ${trimmed.slice(0, 300)}`).toBeGreaterThanOrEqual(0);
  return JSON.parse(trimmed.slice(start));
}

function assertClaimFields(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    // Deliberate literal acceptance: every successful registered JSON result needs claim fields.
    // [] cannot carry fields. Do not use vacuous every(), a skip or an exemption while its contract is pending.
    expect(value.length, `${path}: successful [] has no claim fields`).toBeGreaterThan(0);
    for (const row of value) assertClaimFields(row, path);
    return;
  }
  expect(value, path).toBeTypeOf("object");
  expect(value, path).not.toBeNull();
  const row = value as Record<string, unknown>;
  expect(CLAIM_KINDS, `${path}: emitted claimKind`).toContain(row.claimKind);
  expect(statusDimensionsSchema.safeParse(row.statusDimensions).success, `${path}: emitted statusDimensions`).toBe(true);
  expect(row.claimLabel, `${path}: emitted canonical claimLabel`).toMatch(/^Claim: /);
}

beforeAll(async () => {
  expect(process.versions.node.split(".")[0], "qualified runtime required; importing CLI under another major may rebuild SQLite").toMatch(/^(22|24)$/);
  expect(existsSync(cli), "run the normal build before this corpus").toBe(true);
  for (const dir of [workspace, home, logs, join(root, "outputs")]) mkdirSync(dir, { recursive: true });
  // Deny transport rather than returning canned results. This applies to real CLI calls and their
  // inherited Node children. No provider credentials, host HOME, external endpoint or server is used.
  writeFileSync(guard, `import http from "node:http"; import https from "node:https"; import net from "node:net";
import dns from "node:dns"; import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("P0_22_OFFLINE_FIXTURE: network transport is unavailable in this fixture"); };
http.request = http.get = https.request = https.get = deny; net.connect = net.createConnection = deny;
net.Socket.prototype.connect = deny; dns.lookup = dns.resolve = deny; globalThis.fetch = deny;
syncBuiltinESMExports();\n`);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const licenseEnvironment = {
    AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString()
  };
  environment = {
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`, HOME: home, NO_COLOR: "1", TERM: "dumb",
    AMC_VAULT_PASSPHRASE: "p0-22-private-fixture-only", AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"),
    AMC_CLAIM_LABELS_STRICT: "1", NODE_OPTIONS: `--import=${guard}`,
    AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: licenseEnvironment.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY,
    AMC_INDUSTRY_PACKS_LICENSE_KEY: createIndustryPackLicenseKey({ expiresAt: "2099-01-01T00:00:00.000Z", env: licenseEnvironment })
  };
  expect(Object.keys(environment).some((key) => /OPENAI|ANTHROPIC|GEMINI|API_KEY|TOKEN|SECRET/.test(key))).toBe(false);
  const init = await invoke("seed-init", ["init", "--trust-boundary", "isolated", "--profile", "ci"]);
  completed(init); expect(init.status, init.stderr).toBe(0);
  const signedConfig = await invoke("seed-sign-config", ["verify", "--sign-config"]);
  completed(signedConfig); expect(signedConfig.status, signedConfig.stderr).toBe(0);
  const seeded = await invoke("seed-signed-diagnostic", ["run", "--score-only", "--json"]);
  completed(seeded); expect(seeded.status, seeded.stderr).toBe(0);
  const report = jsonDocument(seeded.stdout) as Record<string, unknown>;
  assertClaimFields(report, "seed-signed-diagnostic");
  runId = report.runId as string;
  expect(runId).toBeTypeOf("string"); expect(runId.length).toBeGreaterThan(0);
  const reportPath = join(getAgentPaths(workspace, "default").runsDir, `${runId}.json`);
  expect(existsSync(reportPath)).toBe(true);
  const recorded = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
  expect(recorded.trustBoundaryViolated, "fixture config must retain its actual auditor signature").toBe(false);
  expect(sealedRunReportVerifies(workspace, recorded), "seed must retain an actual signed diagnostic artifact").toBe(true);
  // A separately named, unsealed historic-version fixture. It selects legacy display, never upgrades truth.
  const legacyRun = { ...recorded, runId: "p0-22-legacy-1-1-1", methodology: {
    ...(recorded.methodology as Record<string, unknown>), amcVersion: "1.1.1" } };
  writeFileSync(join(dirname(reportPath), `${legacyRun.runId}.json`), JSON.stringify(legacyRun));
  writeFileSync(join(root, "scenario.yaml"), `name: p0-22-fixture\ndescription: Offline synthetic scenario\nversion: 1.0.0\nbehavior:\n  autonomy: 0.5\n  errorRate: 0.1\n  escalationFrequency: 0.3\n  toolUsage: 0.5\n  responseLatency: 0.3\n  hallucinationRate: 0.05\n  complianceAdherence: 0.8\n`);
  const lab = await invoke("seed-lab", ["lab-create", "--kind", "typed_attention", "--name", "p0-22-fixture", "--model", "offline-fixture"]);
  completed(lab); expect(lab.status, lab.stderr).toBe(0);
  experimentId = /Experiment created: ([^\s]+)/.exec(lab.stdout)?.[1] ?? "";
  expect(experimentId.length, lab.stdout).toBeGreaterThan(0);
  const labRecordPath = join(workspace, ".amc", "lab", "experiments", `${experimentId}.json`);
  expect(existsSync(labRecordPath), "CLI-created experiment must actually exist in its durable store").toBe(true);
  const labBytes = readFileSync(labRecordPath, "utf8");
  const labRecord = JSON.parse(labBytes) as { experimentId: string; probes: unknown[]; signature: string };
  expect(labRecord.experimentId).toBe(experimentId);
  expect(labRecord.probes.length, "the persisted experiment is not an absent or probe-less fixture").toBeGreaterThan(0);
  expect(labRecord.signature).not.toBe("unsigned");
  writeFileSync(join(logs, "persisted-lab-fixture.json"), labBytes);
  // lab-compare reads both sides from the workspace store: two same-kind experiments, each simulated in its own process.
  labBaselineId = await createSimulatedLab("seed-lab-baseline", "typed_attention");
  labCandidateId = await createSimulatedLab("seed-lab-candidate", "typed_attention");
}, 120_000);

/** lab-create then lab-simulate, each a separate CLI process; returns the experiment id. */
async function createSimulatedLab(name: string, kind: string): Promise<string> {
  const created = await invoke(`${name}-create`, ["lab-create", "--kind", kind, "--name", name, "--model", "offline-fixture"]);
  completed(created); expect(created.status, created.stderr).toBe(0);
  const id = /Experiment created: ([^\s]+)/.exec(created.stdout)?.[1] ?? "";
  expect(id.length, created.stdout).toBeGreaterThan(0);
  const simulated = await invoke(`${name}-simulate`, ["lab-simulate", "--experiment", id]);
  completed(simulated); expect(simulated.status, simulated.stderr).toBe(0);
  return id;
}

afterAll(() => {
  if (existsSync(logs)) writeFileSync(join(logs, "qualification-summary.json"), JSON.stringify({ registryPaths: RESULT_COMMANDS.map(({ path }) => path),
    attempted: records, fixture: root, concurrency: 1, strict: true, credentialsInherited: false, transport: "denied",
    acceptance: "literal; empty successful arrays remain failures" }, null, 2));
  rmSync(root, { recursive: true, force: true });
}, 120_000);

describe.concurrent("actual strict CLI result labels in a signed, keyless private workspace", () => {
  test("lists one explicit valid-syntax recipe and named refusal scope for every registered path", () => {
    expect(recipes.map(({ path }) => path).sort()).toEqual(RESULT_COMMANDS.map(({ path }) => path).sort());
    expect(new Set(recipes.map(({ path }) => path)).size).toBe(recipes.length);
    for (const recipe of recipes) {
      expect(recipe.args).not.toContain("--help");
      if (recipe.refusal) { expect(recipe.refusal.reason.trim().length).toBeGreaterThan(0); expect(recipe.refusal.pattern.length).toBeGreaterThan(0); }
    }
  });

  for (const recipe of recipes) {
    test(`amc ${recipe.path}${recipe.refusal ? ` — fixture refusal permitted: ${recipe.refusal.reason}` : " — actual result required"}`, async () => {
      await withWorkspacePermit(async () => {
        const args = [...recipe.path.split(" "), ...recipe.args.map((arg) => materialize(arg, recipe.path))];
        const result = await invoke(recipe.path, args);
        completed(result);
        if (result.status !== 0) {
          expect(recipe.refusal, `${recipe.path} unexpectedly failed: ${result.stderr}\n${result.stdout}`).toBeDefined();
          expect(`${result.stderr}\n${result.stdout}`, recipe.refusal?.reason).toMatch(new RegExp(recipe.refusal!.pattern, "i"));
          return;
        }
        const document = recipe.json || /^[\[{]/.test(result.stdout.trim()) ? jsonDocument(result.stdout) : undefined;
        if (recipe.emptyArrayHeld && Array.isArray(document) && document.length === 0) {
          // Held RED, not waived: the strict claim-field assertion for this empty array is kept in recipe.emptyArrayHeld.
          expect(existsSync(join(dirname(cli), "..", recipe.emptyArrayHeld)), recipe.emptyArrayHeld).toBe(true);
        } else if (document !== undefined) assertClaimFields(document, recipe.path);
        else if (recipe.output === "markdown") {
          // docs/CLAIM_KINDS.md Rendering: markup changes, words do not. Require an anchored canonical line.
          expect(result.stdout, recipe.path).toMatch(/^\*\*Claim:\*\* (?:Synthetic example|Self-reported|Observed|Independently reviewed|Legacy \(1\.x\), self-reported).+\*\*Result:\*\* .+\*\*Evidence:\*\* .+\*\*Enforcement:\*\* .+\*\*Review:\*\* .+\*\*Applicability:\*\* /m);
        } else if (recipe.output === "info-badge" || recipe.output === "badge-url") {
          // Named pipeable formats only: docs/CLAIM_KINDS.md permits labels on stderr, never on a hidden marker.
          // The badge reads the recorded run (P0-28): the seeded signed run's level, or UNKNOWN without one.
          if (recipe.output === "info-badge") expect(result.stdout).toMatch(/^AMC INFO • maturity=(?:UNKNOWN|\d\.\d)\/5 • assurance=UNKNOWN • risks=UNKNOWN • value=UNKNOWN • ts=\d{4}-\d{2}-\d{2}T[^\n]+\n$/);
          else expect(result.stdout).toMatch(/^https:\/\/img\.shields\.io\/badge\/AMC-L0_\(0\.0\)-red\?logo=[^\n]+\n$/);
          expect(result.stderr).toMatch(/^Claim: Self-reported · Result: .+ · Evidence: .+ · Enforcement: .+ · Review: .+ · Applicability: .+\n$/);
          expect(result.stdout).not.toContain("Claim:");
        } else expect(result.stdout, recipe.path).toMatch(/^Claim: /m);
      });
    }, 600_000);
  }

  test("a cold lab-report after lab-simulate labels the stored placeholder scores synthetic", async () => withWorkspacePermit(async () => {
    const simulated = await invoke("exact-lab-simulate", ["lab-simulate", "--experiment", experimentId]);
    completed(simulated); expect(simulated.status, simulated.stderr).toBe(0);
    const report = await invoke("exact-lab-report", ["lab-report", "--experiment", experimentId]);
    completed(report); expect(report.status, report.stderr).toBe(0);
    expect(report.stdout).toMatch(/^Claim: Synthetic example/m);
    expect(report.stdout).toContain("Scores are deterministic placeholders derived from ids, not measurements.");
    expect(report.stdout).toMatch(/Average scores|Aggregate Scores/i);
  }), 600_000);

  test("a cold lab-compare of two simulated same-kind experiments labels its deltas synthetic; no overlap exits 1", async () => withWorkspacePermit(async () => {
    const compared = await invoke("exact-lab-compare", ["lab-compare", "--baseline", labBaselineId, "--candidate", labCandidateId]);
    completed(compared); expect(compared.status, compared.stderr).toBe(0);
    expect(compared.stdout).toMatch(/^Claim: Synthetic example/m);
    expect(compared.stdout).toContain(`Comparison: ${labBaselineId} vs ${labCandidateId}`);
    expect(compared.stdout).toContain("ta-policy-focus:");
    const otherKind = await createSimulatedLab("exact-lab-other-kind", "trace_memory");
    const disjoint = await invoke("exact-lab-compare-disjoint", ["lab-compare", "--baseline", labBaselineId, "--candidate", otherKind]);
    completed(disjoint); expect(disjoint.status, disjoint.stderr).toBe(1);
    expect(disjoint.stdout).toContain("No matching probes to compare.");
  }), 600_000);

  test("domain --example emits synthetic claim fields on actual stdout", async () => withWorkspacePermit(async () => {
    const result = await invoke("exact-domain-example", ["domain", "assess", "--agent", "default", "--domain", "health", "--example", "--json"]);
    completed(result); expect(result.status, result.stderr).toBe(0);
    const document = jsonDocument(result.stdout) as Record<string, unknown>;
    assertClaimFields(document, "domain assess --example"); expect(document.claimKind).toBe("synthetic_example");
  }), 600_000);

  test("domain baseline emits self-reported claim fields and eligibleLevel at most one", async () => withWorkspacePermit(async () => {
    const result = await invoke("exact-domain-baseline", ["domain", "pack", "run", "--pack", "clinical-trials", "--baseline", "--json"]);
    completed(result); expect(result.status, result.stderr).toBe(0);
    const document = jsonDocument(result.stdout) as Record<string, unknown>;
    assertClaimFields(document, "domain pack run --baseline"); expect(document.claimKind).toBe("self_reported");
    if (document.eligibleLevel === null) {
      // docs/CLAIM_KINDS.md: an unanswered baseline has no level, never an invented zero.
      expect(document.statusDimensions).toMatchObject({ result: "not_evaluated", evidence: "incomplete" });
      expect(document.eligibleLevel).toBeNull();
    } else {
      expect(document.eligibleLevel).toBeTypeOf("number"); expect(document.eligibleLevel as number).toBeLessThanOrEqual(1);
    }
  }), 600_000);

  test("quickscore --auto labels actual stdout without inventing independent review", async () => withWorkspacePermit(async () => {
    const result = await invoke("exact-quickscore-auto", ["quickscore", "--auto", "--json"]);
    completed(result); expect(result.status, result.stderr).toBe(0);
    const document = jsonDocument(result.stdout) as Record<string, unknown>;
    assertClaimFields(document, "quickscore --auto"); expect(document.claimKind).not.toBe("independently_reviewed");
  }), 600_000);

  test("a real stored 1.1.1 run fixture prints the legacy self-reported boundary", async () => withWorkspacePermit(async () => {
    const result = await invoke("exact-legacy-run", ["report", "p0-22-legacy-1-1-1"]);
    completed(result); expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^\*\*Claim:\*\* Legacy \(1\.x\), self-reported/m);
    expect(result.stdout).not.toContain("Claim: Independently reviewed");
  }), 600_000);
});
