/**
 * Node client for the /api/v1/a4 routes (P1-64; design §12.1, §12.3). It sends what the merged router reads and returns
 * the server's answer, status and body unchanged: on a result route the wrapper's `claimKind`, `statusDimensions` and
 * `claimLabel` are the server's, the same object as the body's `claim`, and the client computes no verdict, readiness or
 * label. An error (400 SOD_VIOLATION, 409 A4_STALE_HEAD, …) is returned, not rethrown; only a failed transport or a
 * non-JSON answer throws. Identity is the caller's Studio session (its cookie and native CSRF proof) or the admin
 * token, which reads only; no body names a user. Every route answers 404 A4_PREVIEW_DISABLED unless the server runs
 * with AMC_A4_PREVIEW=1. Nothing is cached, so a one-time token in a response reaches the caller once.
 * Release, deployment and rollback routes arrive with Activate (P1-62).
 */
import { randomUUID } from "node:crypto";
import type { a4Events } from "../a4/a4Events.js";
import type { ClaimEnvelope, ClaimFields } from "../claims/eligibility/index.js";
import type { A4_STAGES, A4Member, A4ProjectV1 } from "../contracts/v1/a4Project.js";
import type { A4ReadinessV1 } from "../contracts/v1/a4Readiness.js";
import { NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE } from "../studio/nativeAdmission.js";
import type { VerifierReportV1 } from "../trust/verifierReport.js";
import { AMCSDKError } from "./errors.js";

type Stage = (typeof A4_STAGES)[number];

export interface A4Session {
  /** Cookie header of a signed-in Studio session. */
  readonly cookie?: string;
  /** The session's native CSRF proof (`nativeCsrfToken` from GET /auth/me); mutations need it with a cookie. */
  readonly nativeCsrfToken?: string;
  /** The bootstrap admin token: A4 reads only. */
  readonly adminToken?: string;
}

/** The server's JSON exactly as sent. */
export interface A4ApiResponse<T> {
  readonly status: number;
  readonly body: ({ readonly ok: true; readonly data: T } & Partial<ClaimFields>)
    | { readonly ok: false; readonly error: string; readonly code?: string; readonly detail?: unknown; readonly head?: unknown; readonly diff?: string };
}

/** A recorded transition, or the recorded answer of a retried clientRequestId (`replay: true`). */
export interface A4MutationResult { projectId: string; seq: number; kind: string; bodyDigest: string; replay: boolean; attemptId?: string }

/** Every mutation names the head it read; a clientRequestId is generated when omitted (pass one to retry safely). */
interface Control { readonly expectedHeadSeq: number; readonly clientRequestId?: string }
interface Decision { readonly reason: string; readonly expectedGateSeq: number; readonly clientRequestId?: string }

export function createA4Client(options: { baseUrl: string; session: A4Session }) {
  const origin = new URL(options.baseUrl).origin;
  const root = `${options.baseUrl.replace(/\/+$/, "")}/api/v1/a4`;
  const session = options.session;

  async function call<T>(method: "GET" | "POST", path: string, body?: object): Promise<A4ApiResponse<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (session.cookie) headers.cookie = session.cookie;
    if (session.adminToken) headers["x-amc-admin-token"] = session.adminToken;
    if (method === "POST") {
      Object.assign(headers, { "content-type": "application/json", origin, [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE });
      if (session.nativeCsrfToken) headers[NATIVE_CSRF_HEADER] = session.nativeCsrfToken;
    }
    const sent = body === undefined ? undefined : JSON.stringify({ ...body, clientRequestId: (body as { clientRequestId?: string }).clientRequestId ?? randomUUID() });
    let response: Response;
    try {
      // No redirects: a session cookie never follows one.
      response = await fetch(`${root}${path}`, { method, headers, body: sent, redirect: "error" });
    } catch (cause) {
      throw new AMCSDKError({ code: "NETWORK_ERROR", message: `A4 request failed: ${method} ${path}`, path, cause });
    }
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) as A4ApiResponse<T>["body"] };
    } catch (cause) {
      throw new AMCSDKError({ code: "INVALID_JSON", message: `A4 answered HTTP ${response.status} without JSON`, status: response.status, path, cause });
    }
  }

  const project = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;
  const query = (values: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(Object.entries(values).flatMap(([key, value]) => value === undefined ? [] : [[key, String(value)]])).toString();
    return params === "" ? "" : `?${params}`;
  };
  const step = <B extends Control>(kind: string) => (projectId: string, stage: Stage, body: B) =>
    call<A4MutationResult>("POST", `${project(projectId)}/stages/${encodeURIComponent(stage)}/${kind}`, body);

  return {
    listProjects: () => call<{ projects: A4ProjectV1[] }>("GET", "/projects"),
    getProject: (projectId: string) => call<A4ProjectV1 & { revision: Record<string, unknown> | null; gates: A4ReadinessV1["gates"]; claim: ClaimEnvelope }>(
      "GET", project(projectId)),
    readiness: (projectId: string, opts: { stage?: Stage } = {}) => call<A4ReadinessV1>("GET", `${project(projectId)}/readiness${query(opts)}`),
    answers: step<Control & { answers: Array<{ questionId: string; value?: unknown }> }>("answers"),
    understand: step<Control & { content: string }>("understand"),
    confirmUnderstanding: step<Control & { confirmed: true }>("confirm-understanding"),
    explain: step<Control & { content: string; level: "novice" | "practitioner" | "expert" }>("explain"),
    propose: step<Control & { spec: Record<string, unknown>; parentRevisionNo?: number }>("propose"),
    build: step<Control & { content: string }>("build"),
    review: step<Control & { content: string }>("review"),
    requestGate: (projectId: string, stage: Stage, gate: "direction" | "completion", body: Control) =>
      call<A4MutationResult>("POST", `${project(projectId)}/stages/${encodeURIComponent(stage)}/gates/${gate}/request`, body),
    decide: (projectId: string, gateId: string, decision: "approve" | "deny",
      body: Decision & { expectedRequestDigestSha256: string; expectedReadinessBindingDigest?: string }) =>
      call<A4MutationResult>("POST", `${project(projectId)}/gates/${encodeURIComponent(gateId)}/${decision}`, body),
    requestChanges: (projectId: string, gateId: string,
      body: Decision & { findings?: Array<{ severity: "info" | "low" | "medium" | "high" | "critical"; message: string }> }) =>
      call<A4MutationResult>("POST", `${project(projectId)}/gates/${encodeURIComponent(gateId)}/request-changes`, body),
    complete: step<Control & { gateId: string }>("complete"),
    observeHypothesis: (projectId: string, hypothesisId: string,
      body: Control & { verdict: "observed" | "refuted"; evidenceRef: { refId: string; sha256: string } }) =>
      call<A4MutationResult>("POST", `${project(projectId)}/hypotheses/${encodeURIComponent(hypothesisId)}/observe`, body),
    members: (projectId: string) => call<{ members: A4Member[]; candidates: Array<{ principalKey: string; authSource: string; userId: string; username: string }> | null;
      candidatesLimited: boolean | null }>("GET", `${project(projectId)}/members`),
    /** POST …/comments: a self-reported comment as the session's user (read roles plus project membership). */
    comment: (projectId: string, body: { body: string; cardId: string; inReplyTo?: string | null; clientRequestId?: string }) =>
      call<A4MutationResult>("POST", `${project(projectId)}/comments`, body),
    comments: (projectId: string, opts: { card?: string } = {}) => call<{ comments: Array<{ commentId: string; cardId: string; revisionNo: number; stage: string;
      authorKey: string; inReplyTo: string | null; body: string | null; reasonCode: string | null; ts: number }> }>("GET", `${project(projectId)}/comments${query(opts)}`),
    events: (projectId: string, opts: { cursor?: number; card?: string } = {}) =>
      call<ReturnType<typeof a4Events>>("GET", `${project(projectId)}/events${query(opts)}`),
    verify: (projectId: string) => call<{ schema: "amc.a4-verify/v1"; projectId: string; section: "integrity"; report: VerifierReportV1; boundary: string;
      claim: ClaimEnvelope }>("GET", `${project(projectId)}/verify`)
  };
}

export type A4Client = ReturnType<typeof createA4Client>;
