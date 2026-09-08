import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { SessionPayload } from "../auth/sessionTokens.js";

export const NATIVE_INTENT_HEADER = "x-amc-native-intent";
export const NATIVE_INTENT_VALUE = "task-workspace-v1";
export const NATIVE_CSRF_HEADER = "x-amc-native-csrf";

/** The actor must come from current tracked-session/admin authentication, never request JSON. */
export interface NativeAdmissionActor {
  readonly isAdmin: boolean;
  readonly userId: string | null;
  readonly nativeCsrfToken: string | null;
}

export class NativeAdmissionError extends Error {
  constructor(readonly statusCode: 401 | 403, readonly code: string, message: string) {
    super(message);
    this.name = "NativeAdmissionError";
  }
}

/** Domain-separated proof derived from the existing signed session nonce, not a bearer credential. */
export function nativeCsrfTokenForSession(payload: Pick<SessionPayload, "nonce">): string {
  return createHash("sha256").update("amc-native-studio-csrf-v1\0").update(payload.nonce).digest("hex");
}

function canonicalOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.pathname !== "/" || /[\x00-\x20\x7f]/.test(value)) return null;
    return parsed.origin;
  } catch { return null; }
}

/** Trusted bind/configuration values only. Forwarded headers never add an allowed origin. */
export function nativeAllowedBrowserOrigins(host: string, port: number, extra: readonly string[] = []): readonly string[] {
  const bareHost = host.replace(/^\[|\]$/g, "").toLowerCase();
  const hosts = ["127.0.0.1", "localhost", "::1"].includes(bareHost)
    ? ["127.0.0.1", "localhost", "::1"] : [bareHost];
  const candidates = [...hosts.map(value => `http://${value.includes(":") ? `[${value}]` : value}:${port}`), ...extra];
  const origins = candidates.map(canonicalOrigin);
  if (origins.some(value => value === null)) throw new Error("Native browser origins must be explicit HTTP(S) origins without credentials or URL paths.");
  return Object.freeze([...new Set(origins.filter((value): value is string => value !== null))]);
}

export function isNativeStudioPath(pathname: string): boolean {
  return pathname === "/api/v1/native-tasks" || pathname.startsWith("/api/v1/native-tasks/");
}

/** Existing aliases all reach the same signed approval engine; none is a weaker granting path. */
export function isNativeApprovalMutationPath(pathname: string, method: string): boolean {
  return method.toUpperCase() === "POST"
    && /^\/approvals\/(?:[^/]+\/(?:approve|deny)|requests\/[^/]+\/(?:decide|cancel))$/.test(pathname);
}

export function isNativeProtectedPath(pathname: string, method: string): boolean {
  return isNativeStudioPath(pathname) || isNativeApprovalMutationPath(pathname, method);
}

function sameProof(actual: string | undefined, expected: string | null): boolean {
  if (actual === undefined || expected === null || !/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

/**
 * Browser boundary for native routes; role and run ownership checks remain mandatory at each handler.
 * A hosted router applies the same check before preserving Origin/Host for the inner Studio server.
 */
export function assertNativeBrowserAdmission(options: {
  readonly req: Pick<IncomingMessage, "headers" | "method">;
  readonly actor: NativeAdmissionActor;
  readonly allowedOrigins: readonly string[];
}): void {
  const { req, actor } = options;
  if (!actor.isAdmin && (!actor.userId || actor.nativeCsrfToken === null)) {
    throw new NativeAdmissionError(401, "NATIVE_HUMAN_AUTH_REQUIRED", "Native tasks require an authenticated human workspace session or an explicit admin token.");
  }
  const method = (req.method ?? "GET").toUpperCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const origin = req.headers.origin;
  const allowed = new Set(options.allowedOrigins);
  const host = req.headers.host;
  // Cookie reads include the CSRF/bootstrap response: an arbitrary DNS-rebinding Host must not read it.
  if ((!actor.isAdmin || origin !== undefined) && (!host || !options.allowedOrigins.some(value => new URL(value).host === host))) {
    throw new NativeAdmissionError(403, "NATIVE_HOST_DENIED", "Native browser requests require the configured Studio host.");
  }
  if (origin !== undefined) {
    const canonical = typeof origin === "string" ? canonicalOrigin(origin) : null;
    if (canonical === null || canonical !== origin || !allowed.has(canonical) || new URL(canonical).host !== host) {
      throw new NativeAdmissionError(403, "NATIVE_ORIGIN_DENIED", "Native browser requests must come from the same configured Studio origin.");
    }
  }
  if (!mutation) return;
  if (req.headers[NATIVE_INTENT_HEADER] !== NATIVE_INTENT_VALUE) {
    throw new NativeAdmissionError(403, "NATIVE_INTENT_REQUIRED", "Native mutations require the explicit task-workspace intent header.");
  }
  if (!actor.isAdmin) {
    if (origin === undefined) throw new NativeAdmissionError(403, "NATIVE_ORIGIN_REQUIRED", "Cookie-authenticated native mutations require a same-origin browser request.");
    const proof = req.headers[NATIVE_CSRF_HEADER];
    if (!sameProof(typeof proof === "string" ? proof : undefined, actor.nativeCsrfToken)) {
      throw new NativeAdmissionError(403, "NATIVE_CSRF_REQUIRED", "Refresh the authenticated native workspace before submitting a mutation.");
    }
  }
}

/** A local demonstration session's broad UI roles cannot authorize provider credentials or real tools. */
export function assertNativeExecutionIdentity(options: {
  readonly actor: NativeAdmissionActor;
  readonly provider: string;
  readonly tools: "none" | "workspace";
}): void {
  if (!options.actor.isAdmin && !options.actor.userId) {
    throw new NativeAdmissionError(401, "NATIVE_HUMAN_AUTH_REQUIRED", "Native tasks require an authenticated human workspace session.");
  }
  if (options.actor.userId === "local-demo" && (options.provider !== "stub" || options.tools !== "none")) {
    throw new NativeAdmissionError(403, "NATIVE_DEMO_EXECUTION_DENIED", "Sign in as an existing workspace user to run a live model or workspace tools. The local demo permits only stub with no tools.");
  }
}

/** UI demo roles are not an authenticated reviewer's authority to sign a decision or alter its lifecycle. */
export function assertNativeApprovalIdentity(actor: NativeAdmissionActor): void {
  if (!actor.isAdmin && !actor.userId) {
    throw new NativeAdmissionError(401, "NATIVE_HUMAN_AUTH_REQUIRED", "Approval decisions require an authenticated workspace reviewer.");
  }
  if (actor.userId === "local-demo") {
    throw new NativeAdmissionError(403, "NATIVE_DEMO_APPROVAL_DENIED", "Sign in as an existing authorized reviewer before deciding or cancelling an approval. Demo roles do not grant approval authority.");
  }
}
