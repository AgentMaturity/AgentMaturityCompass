// A4 engine requests (an effect gate's request, an outcome_unknown resolution) are decided through the project's own route,
// bound to the request digest the project published (src/a4/assembleResolve.ts decideEngineRequest). The Assemble card and
// the general approvals inbox (app.js) both decide them here: Studio's generic /approvals decide carries no digest, and
// A4 counts only decisions bound to it (src/a4/a4Effects.ts verifyAndConsumeEffect).
import { apiNativeRequest, whoami } from "./api.js";

const API = "/api/v1/a4/projects";

/** The A4 project an approval request names in its intent id (`a4-<projectId>-…`, src/a4), else null. */
export const a4ProjectOf = (intentId) => /^a4-(a4p_[0-9a-f]{32})-/.exec(String(intentId ?? ""))?.[1] ?? null;

/** The digest the project's readiness publishes for `approvalRequestId` (APPROVAL_REQUEST:/RESOLUTION_REQUESTED: codes), else null. */
export function publishedDigest(readiness, approvalRequestId) {
  for (const item of readiness?.items ?? []) {
    for (const code of item.reasonCodes ?? []) {
      const parts = String(code).split(":");
      const at = parts.indexOf(approvalRequestId);
      if (at > 0 && /^[0-9a-f]{64}$/.test(parts[at + 1] ?? "")) return parts[at + 1];
    }
  }
  return null;
}

/** The project route and body that decide one engine request bound to `digest`. */
export const engineDecision = (projectId, approvalRequestId, verb, reason, digest) => ({
  path: `${API}/${encodeURIComponent(projectId)}/approvals/${encodeURIComponent(approvalRequestId)}/${verb === "deny" ? "deny" : "approve"}`,
  body: { reason, expectedRequestDigestSha256: digest }
});

/**
 * For the inbox: the A4 project among `projectIds` whose readiness (at its current stage) publishes a digest for
 * `approvalRequestId`, with that digest; null when none does (not an A4 engine request, or one no project names now).
 */
export async function a4EngineRequest(projectIds, approvalRequestId) {
  for (const projectId of projectIds) {
    const project = await apiNativeRequest(`${API}/${encodeURIComponent(projectId)}`);
    const stage = project?.project?.stage ?? project?.stage;
    const readiness = await apiNativeRequest(`${API}/${encodeURIComponent(projectId)}/readiness?stage=${encodeURIComponent(stage)}`);
    const digest = publishedDigest(readiness?.readiness ?? readiness, approvalRequestId);
    if (digest !== null) return { projectId, stage, digest };
  }
  return null;
}

/** Records the inbox's decision on an A4 engine request through the project route, bound to the published digest. */
export async function decideA4EngineRequest(found, approvalRequestId, verb, reason) {
  const { path, body } = engineDecision(found.projectId, approvalRequestId, verb, reason, found.digest);
  const me = await whoami();
  return apiNativeRequest(path, { method: "POST", body: { ...body, clientRequestId: crypto.randomUUID() }, nativeCsrfToken: me?.nativeCsrfToken ?? undefined });
}

/** The A4 projects this user can see ({ projectId, agentId }); [] when the A4 preview is off or the list is refused. */
export async function a4Projects() {
  try {
    const data = await apiNativeRequest(API);
    const projects = Array.isArray(data) ? data : Array.isArray(data?.projects) ? data.projects : [];
    return projects.filter((project) => typeof project?.projectId === "string" && typeof project.agentId === "string")
      .map(({ projectId, agentId }) => ({ projectId, agentId }));
  } catch {
    return [];
  }
}
