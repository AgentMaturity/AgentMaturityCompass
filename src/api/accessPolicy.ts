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

const SUPPORTED_METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);

const HUMAN_ANALYZER_PATHS = new Set([
  "/api/v1/proof/check",
  "/api/v1/vault/redact",
  "/api/v1/vault/classify",
  "/api/v1/vault/dlp-scan",
  "/api/v1/vault/zk/verify",
  "/api/v1/enforce/evaluate",
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
  "/api/v1/watch/attest"
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

function isPassportRevocation(pathname: string): boolean {
  return /^\/api\/v1\/passport\/[^/]+\/revoke$/.test(pathname);
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

  if (method === "POST" && APPROVER_PATHS.has(pathname)) {
    return { access: "approve", roles: [...APPROVER_ROLES] };
  }

  if (method === "POST" && (VERIFIER_PATHS.has(pathname) || isWorkOrderVerification(pathname))) {
    return { access: "verify", roles: [...VERIFIER_ROLES] };
  }

  if (method === "POST" && ATTESTER_PATHS.has(pathname)) {
    return { access: "attest", roles: [...ATTESTER_ROLES] };
  }

  if (
    OWNER_MUTATION_PATHS.has(pathname) ||
    isPassportRevocation(pathname) ||
    OWNER_MUTATION_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  ) {
    return { access: "owner", roles: [...OWNER_ROLES] };
  }

  return { access: "operate", roles: [...OPERATOR_ROLES] };
}
