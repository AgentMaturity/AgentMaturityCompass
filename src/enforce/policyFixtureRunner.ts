import { readFileSync, statSync } from "node:fs";
import YAML, { visit } from "yaml";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  controlSimulationRequestSchema,
  simulateControlDecision,
  type ControlSimulation,
  type ControlSimulationRequest,
} from "./controlSimulation.js";

export const POLICY_FIXTURE_SCHEMA_VERSION = "2026-07-12" as const;
export const MAX_POLICY_FIXTURE_BYTES = 1_048_576;
const MAX_POLICY_FIXTURE_CASES = 100;

const boundedIdSchema = z.string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "must use lowercase letters, numbers, dots, underscores, or hyphens");

const uniqueStringListSchema = z.array(z.string().min(1).max(160)).max(50).superRefine((values, context) => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({ code: "custom", path: [index], message: `duplicate value: ${value}` });
    }
    seen.add(value);
  }
});

const policyFixtureExpectationSchema = z.object({
  outcome: z.enum(["allow", "observe", "warn", "block", "simulate", "execute", "require_approval", "deny"]),
  matched: z.boolean(),
  failClosed: z.boolean(),
  matchedRuleIds: uniqueStringListSchema,
  matchedControlIds: uniqueStringListSchema,
}).strict();

const policyFixtureCaseSchema = z.object({
  id: boundedIdSchema,
  request: controlSimulationRequestSchema,
  expect: policyFixtureExpectationSchema,
}).strict();

const policyFixtureSuiteSchema = z.object({
  schemaVersion: z.literal(POLICY_FIXTURE_SCHEMA_VERSION),
  suiteId: boundedIdSchema,
  description: z.string().trim().min(1).max(500).optional(),
  cases: z.array(policyFixtureCaseSchema).min(1).max(MAX_POLICY_FIXTURE_CASES),
}).strict().superRefine((suite, context) => {
  const seen = new Set<string>();
  for (const [index, item] of suite.cases.entries()) {
    if (seen.has(item.id)) {
      context.addIssue({ code: "custom", path: ["cases", index, "id"], message: `duplicate case id: ${item.id}` });
    }
    seen.add(item.id);
  }
});

export type PolicyFixtureSuite = z.infer<typeof policyFixtureSuiteSchema>;
export type PolicyFixtureExpectation = z.infer<typeof policyFixtureExpectationSchema>;

export type PolicyFixtureMismatchCode =
  | "CONTROL_SOURCE_UNTRUSTED"
  | "OUTCOME_MISMATCH"
  | "MATCHED_MISMATCH"
  | "FAIL_CLOSED_MISMATCH"
  | "MATCHED_RULE_IDS_MISMATCH"
  | "MATCHED_CONTROL_IDS_MISMATCH";

export interface PolicyFixtureCaseResult {
  caseId: string;
  controlId: ControlSimulation["controlId"];
  status: "passed" | "failed" | "fail_closed";
  sourceIntegrity: ControlSimulation["sourceIntegrity"];
  inputSha256: string;
  expected: PolicyFixtureExpectation;
  actual: PolicyFixtureExpectation;
  mismatchCodes: PolicyFixtureMismatchCode[];
}

export interface PolicyFixtureReport {
  schemaVersion: typeof POLICY_FIXTURE_SCHEMA_VERSION;
  suiteId: string;
  status: "passed" | "failed" | "fail_closed";
  fixtureSha256: string;
  reportSha256: string;
  total: number;
  passed: number;
  failed: number;
  sourceFailClosed: number;
  cases: PolicyFixtureCaseResult[];
  simulationOnly: true;
  recorded: false;
  proofEligible: false;
}

export interface PolicyFixtureInvalidResult {
  schemaVersion: typeof POLICY_FIXTURE_SCHEMA_VERSION;
  status: "invalid";
  errorCode: string;
  message: string;
  simulationOnly: true;
  recorded: false;
  proofEligible: false;
}

export class PolicyFixtureInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PolicyFixtureInputError";
  }
}

function normalizeStringList(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizeExpectation(expectation: PolicyFixtureExpectation): PolicyFixtureExpectation {
  return {
    outcome: expectation.outcome,
    matched: expectation.matched,
    failClosed: expectation.failClosed,
    matchedRuleIds: normalizeStringList(expectation.matchedRuleIds),
    matchedControlIds: normalizeStringList(expectation.matchedControlIds),
  };
}

function normalizeSuite(suite: PolicyFixtureSuite): PolicyFixtureSuite {
  return {
    schemaVersion: suite.schemaVersion,
    suiteId: suite.suiteId,
    ...(suite.description !== undefined ? { description: suite.description } : {}),
    cases: suite.cases
      .map((item) => ({
        id: item.id,
        request: item.request,
        expect: normalizeExpectation(item.expect),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function schemaError(error: z.ZodError): PolicyFixtureInputError {
  const issue = error.issues[0];
  const location = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  const rawMessage = issue?.message ?? "fixture schema is invalid";
  const message = rawMessage.startsWith("unknown control:")
    ? "unknown control"
    : rawMessage.startsWith("Unrecognized key")
      ? "unknown field"
      : rawMessage.startsWith("duplicate value:")
        ? "duplicate value"
        : rawMessage.startsWith("duplicate case id:")
          ? "duplicate case id"
          : rawMessage;
  return new PolicyFixtureInputError(
    "FIXTURE_SCHEMA_INVALID",
    `${location}${message}`,
  );
}

export function parsePolicyFixtureSuite(raw: string): PolicyFixtureSuite {
  if (Buffer.byteLength(raw, "utf8") > MAX_POLICY_FIXTURE_BYTES) {
    throw new PolicyFixtureInputError("FIXTURE_TOO_LARGE", "policy fixture file is too large");
  }

  let document: ReturnType<typeof YAML.parseDocument>;
  try {
    document = YAML.parseDocument(raw, { uniqueKeys: true, strict: true });
  } catch {
    throw new PolicyFixtureInputError("FIXTURE_PARSE_INVALID", "policy fixture syntax is invalid");
  }
  if (document.errors.length > 0) {
    throw new PolicyFixtureInputError(
      "FIXTURE_PARSE_INVALID",
      "policy fixture syntax is invalid or contains duplicate keys",
    );
  }

  let containsAlias = false;
  visit(document, {
    Alias() {
      containsAlias = true;
    },
  });
  if (containsAlias) {
    throw new PolicyFixtureInputError("FIXTURE_ALIAS_FORBIDDEN", "policy fixture aliases are not allowed");
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 });
  } catch {
    throw new PolicyFixtureInputError("FIXTURE_PARSE_INVALID", "policy fixture syntax is invalid");
  }
  const parsed = policyFixtureSuiteSchema.safeParse(value);
  if (!parsed.success) throw schemaError(parsed.error);
  return normalizeSuite(parsed.data);
}

function parseSuiteObject(suite: PolicyFixtureSuite): PolicyFixtureSuite {
  const parsed = policyFixtureSuiteSchema.safeParse(suite);
  if (!parsed.success) throw schemaError(parsed.error);
  return normalizeSuite(parsed.data);
}

function stableActual(simulation: ControlSimulation): PolicyFixtureExpectation {
  return {
    outcome: simulation.outcome,
    matched: simulation.matched,
    failClosed: simulation.failClosed,
    matchedRuleIds: normalizeStringList(simulation.matchedRuleIds),
    matchedControlIds: normalizeStringList(simulation.matchedControlIds),
  };
}

function mismatchCodes(
  expected: PolicyFixtureExpectation,
  actual: PolicyFixtureExpectation,
): PolicyFixtureMismatchCode[] {
  const codes: PolicyFixtureMismatchCode[] = [];
  if (expected.outcome !== actual.outcome) codes.push("OUTCOME_MISMATCH");
  if (expected.matched !== actual.matched) codes.push("MATCHED_MISMATCH");
  if (expected.failClosed !== actual.failClosed) codes.push("FAIL_CLOSED_MISMATCH");
  if (canonicalize(expected.matchedRuleIds) !== canonicalize(actual.matchedRuleIds)) {
    codes.push("MATCHED_RULE_IDS_MISMATCH");
  }
  if (canonicalize(expected.matchedControlIds) !== canonicalize(actual.matchedControlIds)) {
    codes.push("MATCHED_CONTROL_IDS_MISMATCH");
  }
  return codes;
}

function runCase(workspace: string, item: PolicyFixtureSuite["cases"][number]): PolicyFixtureCaseResult {
  const simulation = simulateControlDecision({ workspace, ...item.request } as ControlSimulationRequest & { workspace: string });
  const expected = normalizeExpectation(item.expect);
  const actual = stableActual(simulation);
  if (simulation.sourceIntegrity !== "trusted") {
    return {
      caseId: item.id,
      controlId: simulation.controlId,
      status: "fail_closed",
      sourceIntegrity: simulation.sourceIntegrity,
      inputSha256: simulation.inputSha256,
      expected,
      actual,
      mismatchCodes: ["CONTROL_SOURCE_UNTRUSTED"],
    };
  }
  const mismatches = mismatchCodes(expected, actual);
  return {
    caseId: item.id,
    controlId: simulation.controlId,
    status: mismatches.length === 0 ? "passed" : "failed",
    sourceIntegrity: simulation.sourceIntegrity,
    inputSha256: simulation.inputSha256,
    expected,
    actual,
    mismatchCodes: mismatches,
  };
}

export function runPolicyFixtureSuite(input: {
  workspace: string;
  suite: PolicyFixtureSuite;
}): PolicyFixtureReport {
  const suite = parseSuiteObject(input.suite);
  const cases = suite.cases.map((item) => runCase(input.workspace, item));
  const passed = cases.filter((item) => item.status === "passed").length;
  const failed = cases.filter((item) => item.status === "failed").length;
  const sourceFailClosed = cases.filter((item) => item.status === "fail_closed").length;
  const status: PolicyFixtureReport["status"] = sourceFailClosed > 0
    ? "fail_closed"
    : failed > 0
      ? "failed"
      : "passed";
  const body = {
    schemaVersion: POLICY_FIXTURE_SCHEMA_VERSION,
    suiteId: suite.suiteId,
    status,
    fixtureSha256: sha256Hex(canonicalize(suite)),
    total: cases.length,
    passed,
    failed,
    sourceFailClosed,
    cases,
    simulationOnly: true as const,
    recorded: false as const,
    proofEligible: false as const,
  };
  return {
    ...body,
    reportSha256: sha256Hex(canonicalize(body)),
  };
}

export function runPolicyFixtureFile(input: {
  workspace: string;
  filePath: string;
}): PolicyFixtureReport {
  try {
    const stats = statSync(input.filePath);
    if (!stats.isFile()) {
      throw new PolicyFixtureInputError("FIXTURE_NOT_REGULAR_FILE", "policy fixture must be a regular file");
    }
    if (stats.size > MAX_POLICY_FIXTURE_BYTES) {
      throw new PolicyFixtureInputError("FIXTURE_TOO_LARGE", "policy fixture file is too large");
    }
  } catch (error) {
    if (error instanceof PolicyFixtureInputError) throw error;
    throw new PolicyFixtureInputError("FIXTURE_READ_FAILED", "policy fixture file could not be read");
  }
  let raw: string;
  try {
    raw = readFileSync(input.filePath, "utf8");
  } catch {
    throw new PolicyFixtureInputError("FIXTURE_READ_FAILED", "policy fixture file could not be read");
  }
  return runPolicyFixtureSuite({ workspace: input.workspace, suite: parsePolicyFixtureSuite(raw) });
}

export function policyFixtureExitCode(report: PolicyFixtureReport): 0 | 1 | 2 {
  if (report.status === "passed") return 0;
  return report.status === "failed" ? 1 : 2;
}

export function policyFixtureInvalidResult(error: unknown): PolicyFixtureInvalidResult {
  if (error instanceof PolicyFixtureInputError) {
    return {
      schemaVersion: POLICY_FIXTURE_SCHEMA_VERSION,
      status: "invalid",
      errorCode: error.code,
      message: error.message,
      simulationOnly: true,
      recorded: false,
      proofEligible: false,
    };
  }
  return {
    schemaVersion: POLICY_FIXTURE_SCHEMA_VERSION,
    status: "invalid",
    errorCode: "FIXTURE_INVALID",
    message: "policy fixture could not be evaluated",
    simulationOnly: true,
    recorded: false,
    proofEligible: false,
  };
}

export function renderPolicyFixtureReportText(report: PolicyFixtureReport): string {
  const lines = [
    "AMC Policy Fixture Suite",
    `Suite: ${report.suiteId}`,
    `Status: ${report.status.replaceAll("_", " ").toUpperCase()}`,
    `Cases: ${report.total} (${report.passed} passed, ${report.failed} failed, ${report.sourceFailClosed} source fail closed)`,
    `Fixture SHA-256: ${report.fixtureSha256}`,
    `Report SHA-256: ${report.reportSha256}`,
    `Simulation only: ${report.simulationOnly ? "YES" : "NO"}`,
    `Recorded: ${report.recorded ? "YES" : "NO"}`,
    `Proof eligible: ${report.proofEligible ? "YES" : "NO"}`,
    "",
  ];
  for (const item of report.cases) {
    const details = item.mismatchCodes.length > 0 ? ` (${item.mismatchCodes.join(", ")})` : "";
    lines.push(`- [${item.status.toUpperCase()}] ${item.caseId}: ${item.controlId}${details}`);
  }
  lines.push("", "This simulation report is not runtime or maturity evidence.");
  return `${lines.join("\n")}\n`;
}

export function renderPolicyFixtureInvalidText(result: PolicyFixtureInvalidResult): string {
  return [
    "AMC Policy Fixture Suite",
    "Status: INVALID",
    `Error: ${result.errorCode} - ${result.message}`,
    "Simulation only: YES",
    "Recorded: NO",
    "Proof eligible: NO",
    "",
    "This simulation report is not runtime or maturity evidence.",
    "",
  ].join("\n");
}
