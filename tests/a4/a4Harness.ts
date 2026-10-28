/**
 * P2-35 harness: the A4 HTTP entry (`handleA4Route`) in process, with the identity a Studio session would carry. Users
 * are real signed users.yaml rows (the governance fixture's keyed workspace), so principals, roles, population and SoD
 * read live records; nothing about identity is mocked. The preview gate is on unless a case turns it off.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { vi } from "vitest";
import { handleA4Route } from "../../src/a4/a4Router.js";
import type { NativeTaskApiContext } from "../../src/api/nativeTasksRouter.js";
import { addUser, initUsersConfig } from "../../src/auth/authApi.js";
import { governanceFixture } from "../governor/governanceFixture.js";

export type Who = { userId: string } | "admin" | "demo" | "none";
export interface Reply { status: number; body: { ok?: boolean; data?: Record<string, unknown>; code?: string; error?: string; detail?: unknown } }

export interface A4Workspace { workspace: string; owner: { userId: string }; alice: { userId: string }; bob: { userId: string } }

/**
 * A keyed workspace with three ACTIVE local users: the bootstrap OWNER and two OWNER-role users (alice, bob). `solo`
 * leaves the bootstrap OWNER alone (the single-user workspace of design §5.3); alice and bob then name that user.
 */
export function a4Workspace(options: { solo?: boolean } = {}): A4Workspace {
  const { workspace } = governanceFixture();
  vi.stubEnv("AMC_A4_PREVIEW", "1");
  const owner = { userId: initUsersConfig({ workspace, username: "a4-owner", password: "p235-owner-password" }).owner.userId };
  if (options.solo === true) return { workspace, owner, alice: owner, bob: owner };
  const alice = addUser({ workspace, username: "alice", roles: ["OWNER"], password: "p235-alice-password" });
  const bob = addUser({ workspace, username: "bob", roles: ["OWNER"], password: "p235-bob-password" });
  return { workspace, owner, alice: { userId: alice.userId }, bob: { userId: bob.userId } };
}

function context(who: Who, executionAllowed: boolean): NativeTaskApiContext | undefined {
  if (who === "none") return undefined;
  const principalId = who === "admin" ? "bootstrap-admin" : who === "demo" ? "demo" : `session:LOCAL_USER:${who.userId}`;
  return { service: {} as never, principalId, demo: who === "demo", nativeCsrfToken: null, admissionActor: {} as never, executionAllowed: () => executionAllowed };
}

/** One request through the A4 HTTP entry; a body is sent as JSON bytes. */
export async function a4(workspace: string, who: Who, method: string, path: string, body?: unknown,
  options: { executionAllowed?: boolean; rawBody?: string } = {}): Promise<Reply> {
  const text = options.rawBody ?? (body === undefined ? null : JSON.stringify(body));
  const req = Object.assign(Readable.from(text === null ? [] : [Buffer.from(text, "utf8")]), {
    headers: text === null ? {} : { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) }, url: path, method });
  let status = 0, out = "";
  const res = { headersSent: false, setHeader: () => undefined, getHeader: () => undefined,
    writeHead(code: number) { status = code; this.headersSent = true; return this; },
    end(chunk?: string) { out += chunk ?? ""; } };
  const handled = await handleA4Route(new URL(path, "http://a4.test").pathname, method, req as unknown as IncomingMessage, res as unknown as ServerResponse,
    { workspace, nativeTasks: context(who, options.executionAllowed ?? true), revalidateAuthority: () => true });
  if (!handled) throw new Error(`${method} ${path} is not an A4 route`);
  return { status, body: out === "" ? {} : JSON.parse(out) as Reply["body"] };
}

let counter = 0;
/** A fresh owner-scoped idempotency key. */
export const requestId = (): string => `p235req${(++counter).toString().padStart(8, "0")}`;

const ANSWERS: ReadonlyArray<[string, unknown]> = [["agent", "Refund helper: drafts refund replies"], ["problem", "Refund replies are slow"],
  ["audience", ["support staff"]], ["expertise", "practitioner"], ["goals", ["faster replies"]], ["successMetrics", ["median reply under one hour"]],
  ["constraints", ["no payment actions"]], ["forbiddenActions", ["issue refunds"]], ["riskTier", "low"], ["markets", []], ["stations", ["technology"]],
  ["governance", "standard"]];
export const aspireAnswers = (over: Record<string, unknown> = {}) =>
  ANSWERS.map(([questionId, value]) => ({ questionId, value: Object.hasOwn(over, questionId) ? over[questionId] : value }));

/**
 * One project driven through the HTTP routes, tracking the head seq from each reply. `author` creates it and answers
 * Aspire.
 */
export class A4Project {
  head = 0;
  constructor(readonly workspace: string, readonly projectId: string, readonly author: Who) {}
  get path(): string { return `/api/v1/a4/projects/${this.projectId}`; }

  static async create(workspace: string, author: Who, name = "P2-35 scenario"): Promise<A4Project> {
    const reply = await a4(workspace, author, "POST", "/api/v1/a4/projects", { clientRequestId: requestId(), name, expertise: "practitioner" });
    if (reply.status !== 201) throw new Error(`create: ${reply.status} ${JSON.stringify(reply.body)}`);
    return new A4Project(workspace, reply.body.data!.projectId as string, author);
  }

  /** A POST under the project carrying the tracked head seq and a fresh request id unless the body names them. */
  async post(who: Who, tail: string, body: Record<string, unknown> = {}): Promise<Reply> {
    const reply = await a4(this.workspace, who, "POST", `${this.path}${tail}`, { expectedHeadSeq: this.head, clientRequestId: requestId(), ...body });
    if (reply.status < 300 && typeof reply.body.data?.seq === "number") this.head = Math.max(this.head, reply.body.data.seq);
    return reply;
  }
  async get(who: Who, tail = ""): Promise<Reply> {
    return a4(this.workspace, who, "GET", `${this.path}${tail}`);
  }
  async ok(who: Who, tail: string, body: Record<string, unknown> = {}): Promise<Reply> {
    const reply = await this.post(who, tail, body);
    if (reply.status >= 300) throw new Error(`${tail}: ${reply.status} ${JSON.stringify(reply.body)}`);
    return reply;
  }
  async addMember(who: Who, member: { userId: string }, projectRoles: string[] = ["approver"]): Promise<Reply> {
    return this.ok(who, "/members", { principalKey: `LOCAL_USER:${member.userId}`, projectRoles });
  }
  /** Aspire from answers to a proposed brief, by the author. */
  async proposeAspire(answers = aspireAnswers()): Promise<void> {
    await this.ok(this.author, "/stages/aspire/answers", { answers });
    await this.ok(this.author, "/stages/aspire/understand");
    await this.ok(this.author, "/stages/aspire/confirm-understanding", { confirmed: true });
    await this.ok(this.author, "/stages/aspire/explain", { level: "practitioner" });
    await this.ok(this.author, "/stages/aspire/propose", { spec: {} });
  }
  /** Opens a gate; returns its id, request seq and binding digest (what a decision must name). */
  async openGate(who: Who, stage = "aspire", gate = "direction"): Promise<{ gateId: string; gateSeq: number; bindingDigest: string }> {
    const reply = await this.ok(who, `/stages/${stage}/gates/${gate}/request`);
    const gates = (await this.get(who, "/gates")).body.data!.gates as Array<{ gateId: string; bindingDigest: string; stage: string; gate: string }>;
    const row = gates.filter((entry) => entry.stage === stage && entry.gate === gate).at(-1)!;
    return { gateId: row.gateId, gateSeq: reply.body.data!.seq as number, bindingDigest: row.bindingDigest };
  }
  async decide(who: Who, gate: { gateId: string; gateSeq: number; bindingDigest: string }, verdict: "approve" | "deny" = "approve",
    over: Record<string, unknown> = {}): Promise<Reply> {
    const reply = await a4(this.workspace, who, "POST", `${this.path}/gates/${gate.gateId}/${verdict}`, { reason: "P2-35 scenario decision",
      expectedRequestDigestSha256: gate.bindingDigest, expectedGateSeq: gate.gateSeq, clientRequestId: requestId(), ...over });
    if (reply.status < 300 && typeof reply.body.data?.seq === "number") this.head = Math.max(this.head, reply.body.data.seq);
    return reply;
  }
  async gate(who: Who, gateId: string): Promise<Record<string, unknown>> {
    const gates = (await this.get(who, "/gates")).body.data!.gates as Array<Record<string, unknown>>;
    return gates.find((entry) => entry.gateId === gateId)!;
  }
}

/** The status and code of a refusal, for one-line expectations. */
export const refusal = (reply: Reply): [number, string | undefined] => [reply.status, reply.body.code];
