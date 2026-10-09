import type { UserRole } from "../auth/roles.js";

export type ApiAccessClass = "read" | "analyze" | "verify" | "attest" | "approve" | "operate" | "owner";

export interface ApiRolePolicy {
  access: ApiAccessClass;
  roles: UserRole[];
}

const HUMAN_READ_ROLES: UserRole[] = ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"];
const OPERATOR_ROLES: UserRole[] = ["OPERATOR", "OWNER"];
const APPROVER_ROLES: UserRole[] = ["APPROVER", "OWNER"];
const VERIFIER_ROLES: UserRole[] = ["OPERATOR", "AUDITOR", "OWNER"];
const ATTESTER_ROLES: UserRole[] = ["AUDITOR", "OWNER"];
const OWNER_ROLES: UserRole[] = ["OWNER"];
/** P1-57: an A4 reviewer may request changes on a gate without being handed approval authority. */
const REVIEWER_ROLES: UserRole[] = ["APPROVER", "AUDITOR", "OWNER"];

const SUPPORTED_METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);

const HUMAN_ANALYZER_PATHS = new Set([
  "/api/v1/proof/check",
  "/api/v1/vault/redact",
  "/api/v1/vault/classify",
  "/api/v1/vault/dlp-scan",
  "/api/v1/vault/zk/verify",
  "/api/v1/enforce/evaluate",
  "/api/v1/policy/simulate",
  "/api/v1/policy/scope-templates/compile",
  "/api/v1/policy/action/evidence-logic/compile",
  "/api/v1/governor/check",
  "/api/v1/governor/explain",
  "/api/v1/sandbox/docker-args",
  "/api/v1/shield/replay-corpus/verify",
  "/api/v1/shield/live-drift/verify",
  "/api/v1/shield/judge-calibration/verify",
  "/api/v1/shield/provider-drift/verify",
  "/api/v1/shield/promptfoo-provider-drift/verify",
  "/api/v1/shield/patronus-provider-drift/verify",
  "/api/v1/shield/inspect-provider-drift/verify",
  "/api/v1/shield/tensorzero-provider-drift/verify",
  "/api/v1/shield/helm-provider-drift/verify",
  "/api/v1/shield/scan/skill",
  "/api/v1/shield/detect/injection",
  "/api/v1/shield/sanitize"
]);

const APPROVER_PATHS = new Set([
  "/api/v1/tickets/issue"
]);

const VERIFIER_PATHS = new Set([
  "/api/v1/tickets/verify",
  "/api/v1/governor/policy/verify",
  "/api/v1/ci/policy/verify",
  "/api/v1/passport/trust-token/verify",
  "/api/v1/passport/trust-token/translate"
]);

const ATTESTER_PATHS = new Set([
  "/api/v1/evidence/attest",
  "/api/v1/watch/attest",
  "/api/v1/adapters/capability-receipts"
]);

const OWNER_MUTATION_PATHS = new Set([
  "/api/v1/vault/unlock",
  "/api/v1/vault/seal",
  "/api/v1/governor/policy/init",
  "/api/v1/mode",
  "/api/v1/assurance/init",
  "/api/v1/assurance/scheduler/enable",
  "/api/v1/assurance/scheduler/disable",
  "/api/v1/assurance/waiver/revoke",
  "/api/v1/compliance/init",
  "/api/v1/waiver/revoke",
  "/api/v1/adapters/init",
  "/api/v1/adapters/configure",
  "/api/v1/adapters/init-project",
  "/api/v1/ci/init",
  "/api/v1/drift/freeze/lift",
  "/api/v1/firewall/enable",
  "/api/v1/firewall/migrate-signature",
  "/api/v1/bom/sign",
  "/api/v1/bundle/export"
]);

const OWNER_MUTATION_PREFIXES = [
  "/api/v1/vault/keys",
  "/api/v1/vault/secret",
  "/api/v1/identity",
  "/api/v1/crypto",
  "/api/v1/gateway",
  "/api/v1/tools",
  "/api/v1/plugins",
  "/api/v1/guardrails",
  "/api/v1/fleet",
  "/api/v1/policy",
  "/api/v1/ci/policy",
  "/api/v1/enforce/resources",
  "/api/v1/assurance/policy",
  "/api/v1/assurance/cert",
  "/api/v1/passport/trust-token"
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isWorkOrderVerification(pathname: string): boolean {
  return /^\/api\/v1\/workorders\/[^/]+\/verify$/.test(pathname);
}

/** P1-17: an oversight record is signed with the auditor key in the reviewer's name. */
function isIncidentOversight(pathname: string): boolean {
  return /^\/api\/v1\/incidents\/[^/]+\/oversight$/.test(pathname);
}

function isPassportRevocation(pathname: string): boolean {
  return /^\/api\/v1\/passport\/[^/]+\/revoke$/.test(pathname);
}

const A4_APPROVAL = /^\/api\/v1\/a4\/projects\/[^/]+\/gates\/[^/]+\/(approve|deny)$/;
const A4_REVIEW = /^\/api\/v1\/a4\/projects\/[^/]+\/gates\/[^/]+\/request-changes$/;
const A4_MEMBER = /^\/api\/v1\/a4\/projects\/[^/]+\/(comments|presence)$/;
// `retire` is not here: the creator of a never-proposed draft may retire it (retireProject enforces owner-or-creator).
const A4_OWNER = /^\/api\/v1\/a4\/projects\/[^/]+\/(hold|resume|reopen|tune|members|gate-policy|acknowledge|releases(\/.*)?|stages\/[^/]+\/effects\/[^/]+\/(open|retry)|stages\/(adapt|activate)\/complete)$/;

/** P1-57: an A4 gate decision takes the approve class (APPROVER_PATHS holds exact paths only). */
export function isA4ApprovalPath(pathname: string): boolean {
  return A4_APPROVAL.test(pathname);
}

/** P1-57: request-changes on an A4 gate: APPROVER, AUDITOR or OWNER. */
export function isA4ReviewPath(pathname: string): boolean {
  return A4_REVIEW.test(pathname);
}

/** P1-57: comments and presence take the read roles; the A4 router requires project membership. */
export function isA4MemberPath(pathname: string): boolean {
  return A4_MEMBER.test(pathname);
}

/** P1-57: A4 owner actions (hold, members, gate policy, effects, adapt/activate completion, releases). */
export function isA4OwnerPath(pathname: string): boolean {
  return A4_OWNER.test(pathname);
}

export function resolveApiRolePolicy(pathname: string, rawMethod: string): ApiRolePolicy {
  const method = rawMethod.trim().toUpperCase();

  if (!SUPPORTED_METHODS.has(method)) {
    return { access: "owner", roles: [...OWNER_ROLES] };
  }

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    if (pathname.startsWith("/api/v1/vault/secret/")) {
      return { access: "owner", roles: [...OWNER_ROLES] };
    }
    if (pathname === "/api/v1/config/logs") {
      return { access: "verify", roles: [...VERIFIER_ROLES] };
    }
    return { access: "read", roles: [...HUMAN_READ_ROLES] };
  }

  if (method === "POST" && HUMAN_ANALYZER_PATHS.has(pathname)) {
    return { access: "analyze", roles: [...HUMAN_READ_ROLES] };
  }

  if (method === "POST" && isA4MemberPath(pathname)) {
    return { access: "read", roles: [...HUMAN_READ_ROLES] };
  }

  if (method === "POST" && (APPROVER_PATHS.has(pathname) || isA4ApprovalPath(pathname))) {
    return { access: "approve", roles: [...APPROVER_ROLES] };
  }

  if (method === "POST" && isA4ReviewPath(pathname)) {
    return { access: "approve", roles: [...REVIEWER_ROLES] };
  }

  if (method === "POST" && (VERIFIER_PATHS.has(pathname) || isWorkOrderVerification(pathname))) {
    return { access: "verify", roles: [...VERIFIER_ROLES] };
  }

  if (method === "POST" && (ATTESTER_PATHS.has(pathname) || isIncidentOversight(pathname))) {
    return { access: "attest", roles: [...ATTESTER_ROLES] };
  }

  if (
    OWNER_MUTATION_PATHS.has(pathname) ||
    isPassportRevocation(pathname) ||
    isA4OwnerPath(pathname) ||
    OWNER_MUTATION_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  ) {
    return { access: "owner", roles: [...OWNER_ROLES] };
  }

  return { access: "operate", roles: [...OPERATOR_ROLES] };
}
