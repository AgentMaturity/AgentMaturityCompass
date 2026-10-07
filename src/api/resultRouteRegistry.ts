/**
 * Routes that return results, and the claim each result carries (P0-23). The dispatcher binds
 * the matched route to the response and the success helper labels whatever the route returns:
 * a single result gets `claimKind`, `statusDimensions` and `claimLabel` beside it, and each item
 * of a list result gets a `claim` object. The kind and dimensions come from the shared service in
 * src/claims/eligibility, so no route computes its own status.
 */
import { z } from "zod";
import {
  claimFields,
  claimKindSchema,
  envelopeForDiagnosticReport,
  envelopeForUnboundResult,
  statusDimensionsSchema,
  type ClaimEnvelope,
  type ClaimFields,
  type ClaimMethod,
  type DiagnosticReportClaimInput
} from "../claims/eligibility/index.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { pathParam } from "./apiHelpers.js";

/** `diagnostic_report`: the body is a sealed run and carries the run's own claim. A method: no adapter binds the result to evidence yet. */
export type ClaimSource = "diagnostic_report" | ClaimMethod;

export interface ResultRoute {
  method: "GET" | "POST";
  path: string;
  producer: string;
  shape: "single" | "list";
  source: ClaimSource;
  /** Asserts conformity with a law, regulation, standard or framework mapping. */
  regulated: boolean;
  /** List routes: the body property holding the items. */
  items?: string;
  /** Path-parameter values that belong to sibling routes, never to this one. */
  except?: readonly string[];
}

export type ResultEntry = [ResultRoute["method"], string, Partial<Pick<ResultRoute, "source" | "regulated" | "items" | "except">>?];

/** Builds one surface's routes that share a claim source; `prefix` joins the surface's path root to each path. */
export function resultFamily(surface: string, prefix: string, source: ClaimSource, entries: ResultEntry[], regulated = false): ResultRoute[] {
  return entries.map(([method, path, extra]) => ({
    method, path: `${prefix}${path}`, producer: `${surface}:${method} ${path}`, shape: extra?.items ? "list" : "single",
    source, regulated, ...extra
  }));
}

const DIAGNOSTIC = { source: "diagnostic_report" } as const;
const SELF_ANSWERS = { source: "numeric_self_answer" } as const;
const PROVIDER_DRIFT = ["provider-drift", "promptfoo-provider-drift", "inspect-provider-drift",
  "tensorzero-provider-drift", "helm-provider-drift"];
const V1 = "/api/v1/";

export const API_RESULT_ROUTES: readonly ResultRoute[] = [
  ...resultFamily("api", V1, "runtime_observation", [
    ["GET", "score/latest", DIAGNOSTIC], ["GET", "score/history", { items: "runs" }], ["GET", "score/runs"],
    ["POST", "score/run", DIAGNOSTIC], ["GET", "score/run/:runId", DIAGNOSTIC], ["GET", "score/report", DIAGNOSTIC],
    ["GET", "score/report/:runId", DIAGNOSTIC], ["GET", "score/result/:sessionId", SELF_ANSWERS],
    ["POST", "score/quick", SELF_ANSWERS], ["POST", "score/quickscore", SELF_ANSWERS], ["GET", "score/compare"],
    ["POST", "score/compare"], ["POST", "score/formal-spec"], ["POST", "score/adversarial"],
    ["GET", "score/evidence-drilldown/:runId/:questionId"], ["POST", "score/industry/adjust", SELF_ANSWERS],
    ["GET", "score/industry/models"], ["GET", "score/industry/model/:industryId"],
    ["POST", "score/lane/safety-research", SELF_ANSWERS], ["POST", "score/judge-calibration"], ["POST", "score/live-drift"],
    ...[...PROVIDER_DRIFT, "patronus-provider-drift"].map((name): ResultEntry => ["POST", `score/${name}`]),
    ["POST", "score/trust/verify-claim"], ["POST", "score/trust/transitive"], ["POST", "score/trust/decay"],
    ["POST", "score/trust/inherited"],
    ["GET", "passport/:id"], ["GET", "passport/:id/verify"], ["GET", "passports", { items: "items" }],
    ["POST", "passport/trust-token/verify"], ["POST", "passport/trust-token/translate"],
    ["POST", "badge/export"], ["POST", "bundle/verify"], ["POST", "bundle/inspect"], ["POST", "bundle/diff"],
    ["POST", "bundle/export"], ["POST", "bom/verify"],
    ["POST", "attest/notary"], ["POST", "attest/notary/verify"], ["POST", "attest/outcome"], ["POST", "export/badge"],
    ["GET", "export/badge/generate"], ["GET", "export/badge/url"],
    ["GET", "security/sleeper-detection", { source: "path_presence" }],
    ["GET", "security/gaming-resistance", { source: "path_presence" }], ["POST", "security/adversarial"],
    ["GET", "security/insider/scores"], ["GET", "security/insider/report"],
    ["POST", "crypto/cert/issue"], ["POST", "crypto/cert/verify"], ["POST", "crypto/cert/inspect"],
    ["POST", "crypto/cert/verify-revocation"], ["POST", "crypto/notary/verify-attest"], ["GET", "crypto/notary/log-verify"],
    ["POST", "crypto/merkle/verify-proof"], ["POST", "enforce/formal/certificate"], ["POST", "enforce/formal/verify"],
    ["GET", "fleet/report"], ["GET", "fleet/agents/:agentId"], ["POST", "ci/gate"], ["POST", "ci/predict"],
    ["POST", "proof/check"], ["GET", "proof/status"], ["GET", "compliance/verify"]
  ]),
  ...resultFamily("api", V1, "executed_test", [
    ["POST", "assurance"], ["GET", "assurance", { items: "runs" }], ["GET", "assurance/:runId", { except: ["packs", "policy", "scheduler", "waiver", "fp"] }],
    ["GET", "assurance/history", { items: "runs" }], ["GET", "assurance/readiness"], ["POST", "assurance/verify"],
    ["GET", "assurance/workspace/verify"], ["POST", "assurance/lab/:packName"], ["POST", "assurance/cert"],
    ["GET", "assurance/cert/latest"], ["POST", "assurance/cert/verify"],
    ["GET", "benchmarks/stats"], ["POST", "benchmarks/verify"],
    ...PROVIDER_DRIFT.map((name): ResultEntry => ["POST", `benchmarks/${name}`]),
    ["POST", "shield/red-team/run"], ["POST", "shield/trust-pipeline/run"], ["POST", "shield/exploit-confirmation/run"],
    ...["replay-corpus", "live-drift", "judge-calibration", ...PROVIDER_DRIFT, "patronus-provider-drift"]
      .map((name): ResultEntry => ["POST", `shield/${name}/verify`])
  ]),
  ...resultFamily("api", V1, "runtime_observation", [
    ["POST", "compliance/report"], ["POST", "compliance/fleet"], ["POST", "compliance/diff"],
    ["POST", "compliance/regulatory/check"], ["GET", "regulatory/eu-ai-act"], ["GET", "regulatory/owasp-llm"],
    ["GET", "regulatory/readiness"],
    // P1-17: deadlines computed from operator-stated trigger and notice times; never a filing or compliance verdict.
    ["GET", "incidents/:id/clocks"]
  ], true)
];

/** An exact path wins over a parameterised one, so `assurance/history` never reads as `assurance/:runId`. */
export function matchResultRoute(routes: readonly ResultRoute[], method: string, pathname: string): ResultRoute | undefined {
  const candidates = routes.filter((route) => route.method === method);
  return candidates.find((route) => route.path === pathname) ?? candidates.find((route) => {
    const params = route.path.includes("/:") ? pathParam(pathname, route.path) : null;
    return params !== null && !Object.values(params).some((value) => route.except?.includes(value));
  });
}

function isDiagnosticReport(data: unknown): data is DiagnosticReportClaimInput & Record<string, unknown> {
  const report = data as Partial<DiagnosticReportClaimInput> | null;
  return typeof report?.runId === "string" && Array.isArray(report.layerScores)
    && typeof report.evidenceTrustCoverage === "object" && report.evidenceTrustCoverage !== null;
}

/** A run counts as evidence only when this workspace's auditor key sealed it (as in P0-15's domain evidence). */
export function resultEnvelope(route: ResultRoute, data: unknown, workspace: string, now = Date.now()): ClaimEnvelope {
  if (route.source === "diagnostic_report" && isDiagnosticReport(data) && sealedRunReportVerifies(workspace, data)) {
    return envelopeForDiagnosticReport(data, now);
  }
  const method = route.source === "diagnostic_report" ? "runtime_observation" : route.source;
  return envelopeForUnboundResult({ producer: route.producer, method, regulated: route.regulated, now });
}

export interface LabelledResult { data: unknown; claim?: ClaimFields }

export function labelResult(route: ResultRoute, data: unknown, workspace: string, now = Date.now()): LabelledResult {
  const list = route.items === undefined ? undefined : (data as Record<string, unknown> | null)?.[route.items];
  if (route.shape === "single" || !Array.isArray(list)) {
    return { data, claim: claimFields(resultEnvelope(route, data, workspace, now)) };
  }
  const items = list.map((item: unknown) => typeof item === "object" && item !== null && !Array.isArray(item)
    ? { ...item, claim: claimFields(resultEnvelope(route, item, workspace, now)) } : item);
  return { data: { ...(data as Record<string, unknown>), [route.items!]: items } };
}

/**
 * Component schemas for ClaimKind, StatusDimensions and ClaimResult, generated from P0-08's zod schemas.
 * The `openapi-3.0` target also reads as 3.1, so the published 3.0 file and the 3.1 generator share them.
 */
export function claimOpenApiSchemas(): Record<string, Record<string, unknown>> {
  const json = (schema: z.ZodType) => {
    const { $schema: _, ...rest } = z.toJSONSchema(schema, { target: "openapi-3.0" }) as Record<string, unknown>;
    return rest;
  };
  return {
    ClaimKind: json(claimKindSchema),
    StatusDimensions: json(statusDimensionsSchema),
    // No additionalProperties: responses join ClaimResult to their own schema with allOf.
    ClaimResult: {
      type: "object",
      required: ["claimKind", "statusDimensions", "claimLabel"],
      properties: {
        claimKind: { $ref: "#/components/schemas/ClaimKind" },
        statusDimensions: { $ref: "#/components/schemas/StatusDimensions" },
        claimLabel: { type: "string", description: "The canonical claim line, as printed on every surface" }
      }
    }
  };
}

/** The 200 schema of a labelled route: its own schema joined with the claim fields. `envelope`: the API's `{ ok, data }` body. */
export function claimResponseSchema(route: ResultRoute, envelope: boolean, existing?: unknown): Record<string, unknown> {
  const ref = { $ref: "#/components/schemas/ClaimResult" };
  const list = { type: "object", properties: { [route.items ?? "items"]: {
    type: "array", items: { type: "object", properties: { claim: ref } } } } };
  const claim = route.shape === "single" ? ref : envelope ? { type: "object", properties: { data: list } } : list;
  if (existing === undefined) return claim;
  const allOf = (existing as { allOf?: unknown[] }).allOf;
  return Array.isArray(allOf) ? { ...existing, allOf: [...allOf, claim] } : { allOf: [existing, claim] };
}

type Operation = { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> };

/** References ClaimResult from the 200 response of every listed route that `paths` documents. */
export function withClaimResponses(paths: Record<string, Record<string, unknown>>, routes: readonly ResultRoute[],
  envelope: boolean): Record<string, Record<string, unknown>> {
  const out = { ...paths };
  for (const route of routes) {
    const shape = route.path.replace(/:\w+/g, "{}");
    const key = Object.keys(out).find((candidate) => candidate.replace(/\{[^}]+\}/g, "{}") === shape) ?? shape;
    const verb = route.method.toLowerCase();
    const operation = out[key]?.[verb] as Operation | undefined;
    const ok = operation?.responses?.["200"];
    if (!operation || !ok) continue;
    const json = ok.content?.["application/json"];
    const content = { ...ok.content, "application/json": { ...json, schema: claimResponseSchema(route, envelope, json?.schema) } };
    out[key] = { ...out[key], [verb]: { ...operation, responses: { ...operation.responses, "200": { ...ok, content } } } };
  }
  return out;
}
