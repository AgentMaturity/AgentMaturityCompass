/** Retain one operator submission in this page only; never persist prompt or credentials. */
export function captureNativeSubmission({ url, body, agentId, taskId, workspaceScope, csrfToken, adminToken }) {
  const copy = JSON.parse(JSON.stringify(body));
  const freeze = value => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  return Object.freeze({ url, body: freeze(copy), id: copy.clientRequestId, prompt: copy.prompt,
    agentId, taskId, kind: taskId ? "turn" : "create", workspaceScope, csrfToken, adminToken });
}

export function nativeSubmissionScopeMatches(submission, { agentId, workspaceScope, csrfToken, adminToken }) {
  return submission.agentId === agentId && submission.workspaceScope === workspaceScope
    && submission.csrfToken === csrfToken && submission.adminToken === adminToken;
}

/** Polls only identify the first/last admission. A direct exact replay also acknowledges older turns. */
export function nativeSubmissionAcknowledged(submission, view, directResponse = false) {
  if (view.agentId !== submission.agentId) return false;
  if (submission.kind === "create") return view.clientRequestId === submission.id;
  return view.taskId === submission.taskId && view.revision >= submission.body.expectedRevision + 1
    && (directResponse || view.clientRequestId === submission.id || view.lastClientRequestId === submission.id);
}

export function definiteNativeSubmissionRefusal(error, previouslyUnconfirmed = false) {
  // Refusing a retry says nothing about whether the earlier request was admitted.
  // In particular, auth, rate-limit and ownership checks precede idempotent lookup.
  if (previouslyUnconfirmed) return false;
  // A proxy timeout or malformed response cannot establish whether admission happened.
  return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 408
    && error.code !== "INVALID_RESPONSE" && error.data?.ok === false && typeof error.data.error === "string";
}
