// The words a person reads for a failed request (C-10): no class names, no internal codes, the next step named. The raw
// server text stays on the error (error.message, error.data) for "Show the record".

const ROLE_WORDS = { OWNER: "owner", OPERATOR: "operator", APPROVER: "approver", AUDITOR: "auditor", VIEWER: "viewer" };

const roleList = (text) => text.split(/[|,]/).map((role) => ROLE_WORDS[role.trim()] || role.trim().toLowerCase()).join(" or ");

const RULES = [
  [/^missing or invalid token$/i, () => "You are signed out. Sign in again to go on."],
  [/^internal server error$/i, () => "AMC Studio hit a problem it did not expect, and nothing was changed. Try again; if it happens again, run amc doctor in the workspace folder."],
  [/^(?:Not permitted: )?requires role: (.+)$/i, (m) => `This needs the ${roleList(m[1])} role. A workspace owner can give it to you on the Users page.`],
  [/^Failed to fetch$|^NetworkError|^Load failed$/i, () => "AMC did not answer. Check that it is running (amc up in the workspace folder), then try again."],
  [/^HTTP 404$|^not found$/i, () => "Not found. It may not have been made yet."],
  [/^HTTP 409$/i, () => "That could not be done in the current state. Refresh the page and try again."],
  [/^HTTP (\d+)$/i, (m) => `AMC Studio refused this (code ${m[1]}). Refresh the page and try again.`],
  [/^action \S+ requires approval request before execution$/i, () => "This change needs an approval first. Request the approval, and apply the change once it is approved."],
  [/cannot move from (\w+) to \1$/i, (m) => `It is already ${m[1]}; nothing to change.`],
  [/must match pattern/i, () => "That value is not in the form AMC expects. Copy it again from where it was shown and try again."],
  [/^invalid JSON body$/i, () => "The request was not readable. Refresh the page and try again."],
  [/^payload too large$/i, () => "That is too large to send. Make it shorter and try again."],
  [/^value contract missing$/i, () => "No value data yet: this workspace has no value contract. Create one with amc value init in the workspace folder."]
];

/** The plain sentence for an error or a raw message. */
export function plainErrorText(error) {
  let text = typeof error?.message === "string" ? error.message : String(error ?? "");
  // Class names and internal code prefixes ("ConsoleApiError: ", "Error: ", "BODY_INVALID: ", "transition_illegal: ").
  text = text.replace(/^(?:\s*(?:[A-Z][A-Za-z]*Error|Error)\s*:\s*)+/, "").replace(/^[A-Za-z]+(?:_[A-Za-z]+)+:\s*/, "").trim();
  for (const [pattern, words] of RULES) {
    const match = text.match(pattern);
    if (match) return words(match);
  }
  return text || "Something went wrong. Refresh the page and try again.";
}

// Codes a page shows as a value (status, reason, class, role) in plain words. The code itself stays on the element's
// title so support can still read it; API responses are unchanged.
const CODE_WORDS = {
  INSUFFICIENT_EVIDENCE: "Not enough evidence yet", NO_TRUSTED_RUN: "No trusted run yet", NOT_INITIALIZED: "Not set up yet",
  HOOK_NOT_INSTALLED: "Hook not installed", NOT_INSTALLED: "Not installed", NOT_BOUND: "Not connected",
  INTEGRITY_BELOW_MIN: "Integrity is below the minimum", CORRELATION_NOT_MEASURED: "Not yet measured against outcomes",
  OBSERVED_EVIDENCE_INSUFFICIENT: "Too little observed evidence", GATE_PENDING: "Waiting for an approval", NOT_PROPOSED: "Not proposed yet",
  READ_ONLY: "Reading only", WRITE_LOW: "Small changes", WRITE_HIGH: "Bigger changes", DEPLOY: "Releasing",
  SECURITY: "Security settings", FINANCIAL: "Money", NETWORK_EXTERNAL: "Outside network", DATA_EXPORT: "Data leaving",
  IDENTITY: "Identity and access", PENDING: "Waiting", QUORUM_MET: "Approved, not used yet", DENIED: "Turned down",
  EXPIRED: "Expired", CANCELLED: "Cancelled", CONSUMED: "Approved and used", APPROVED: "Approved", OWNER: "Owner", AUDITOR: "Auditor", APPROVER: "Approver",
  OPERATOR: "Operator", VIEWER: "Viewer", ACTIVE: "Active", REVOKED: "Revoked", LOCAL_VAULT: "Local vault",
  VALID: "Checks out", INVALID: "Does not check out", PASS: "Passed", FAIL: "Failed", WARN: "Needs a look", ENFORCE: "Enforced",
  UNKNOWN: "Not known", MISSING: "Missing", UNVERIFIED: "Not verified", ELIGIBLE: "Can be claimed", BLOCKED: "Blocked", NOT_CONFIGURED: "Not set up",
  SOC2: "SOC 2", NIST_AI_RMF: "NIST AI RMF", ISO_27001: "ISO 27001", ISO_42001: "ISO 42001", EU_AI_ACT: "EU AI Act",
  // Server codes the console printed raw (open-items2 lane): readiness, evidence, advisories, A4 blockers.
  RESOURCE_DRIFTED: "The agent's files changed since it was approved", WAITING: "Waiting", NO_SECOND_APPROVER: "Nobody else can approve",
  NOT_EVALUATED: "Not checked yet", EMPTY_EVIDENCE: "No evidence recorded", SIGNATURE_INVALID: "A signature does not check out",
  APPLICABILITY_UNRESOLVED: "Not yet known whether it applies", ASSURANCE_BASELINE_MISSING: "No assurance run yet",
  MANIFEST_SCOPE_INVALID: "The record's scope does not check out", OBSERVED_HARDENED: "Observed and hardened", OBSERVED: "Observed",
  CRITICAL: "Critical", INFO: "Information", INTEGRITY: "Integrity", DRIFT: "Drift", ANOMALY: "Something unusual",
  RISK_INDEX: "Risk level", VALUE_REGRESSION: "Value went down", STABLE: "Steady", WORSENING: "Getting worse", IMPROVING: "Getting better",
  LEGACY_MIGRATION: "Carried over from an older AMC", REASSESSMENT_REQUIRED: "Needs a new assessment", REVIEW_EXPIRED: "Its review ran out",
  SELF_REPORTED: "Self-reported",
  // Trace failure classes (src/watch/traceFailureIndex.ts) and typed-graph issues (src/fleet/typedGraph.ts).
  PROMPT_ERROR: "Prompt problem", TOOL_MISUSE: "Tool used wrongly", INVALID_SCHEMA: "Wrong format", REFUSAL_OVERREACH: "Refused too much",
  HALLUCINATED_CLAIM: "Made-up claim", UNSAFE_ACTION: "Risky action", LATENCY_TIMEOUT: "Too slow", COST_SPIKE: "Cost jumped",
  RETRIEVAL_ERROR: "Lookup failed", MEMORY_ERROR: "Memory problem", HUMAN_REVIEW_GAP: "No human review", ORCHESTRATION_DEAD_END: "Agents got stuck",
  POLICY_VIOLATION: "Broke a rule", UNKNOWN_FAILURE: "Other failure", DUPLICATE_NODE: "A part is listed twice", MISSING_NODE: "A part is missing",
  CYCLE_DETECTED: "Goes round in a loop", AGENT: "Agent", NODE: "Team", WORKSPACE: "Workspace"
};
// Words joined by underscores are codes; a single word only when the table names it (so "AMC" stays "AMC").
const isCode = (text) => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[a-z]+(?:_[a-z]+)+$/.test(text) || Object.hasOwn(CODE_WORDS, text);

/** The plain words for a code ("INTEGRITY_BELOW_MIN:0.000<0.850" keeps its numbers); any other text comes back unchanged. */
export function plainCode(value) {
  const text = String(value ?? "");
  const [head, ...rest] = text.split(":");
  const key = head.toUpperCase();
  if (!isCode(head)) return text;
  const words = CODE_WORDS[key] || `${key.charAt(0)}${key.slice(1).toLowerCase().replaceAll("_", " ")}`;
  const detail = rest.join(":").replace(/^([\d.]+)<([\d.]+)$/, "$1, minimum $2");
  return detail ? `${words} (${detail})` : words;
}

const escHtml = (part) => String(part).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * The same as HTML: the words, with the code on the title. With `{ small: true }` the code also shows, as small
 * secondary text after the words (a title is not seen on a phone); then only a code the table names is put in words,
 * and any other code is shown as it came.
 */
export function plainCodeHtml(value, { small = false } = {}) {
  const text = String(value ?? "");
  if (small) {
    const known = Object.hasOwn(CODE_WORDS, text.split(":")[0].toUpperCase()) && isCode(text.split(":")[0]);
    if (!known) return escHtml(text);
    // Words that only re-case the code ("CRITICAL" as "Critical") need no second copy of it.
    const words = plainCode(text);
    const same = words.toLowerCase() === text.toLowerCase().replaceAll("_", " ");
    return `<span class="code-word">${escHtml(words)}</span>${same ? "" : ` <small class="code-note">${escHtml(text)}</small>`}`;
  }
  const words = plainCode(text);
  return words === text ? escHtml(text) : `<span class="code-word" title="Code: ${escHtml(text)}">${escHtml(words)}</span>`;
}

/**
 * A server sentence with codes inside it ("evidence is INSUFFICIENT_EVIDENCE and not claim-ready"): each code the table
 * names reads as its words in lower case, the code on the title; everything else, unknown codes included, is unchanged.
 */
export function plainCodesInTextHtml(value) {
  return String(value ?? "").split(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/).map((part, at) => {
    if (at % 2 === 0 || !Object.hasOwn(CODE_WORDS, part)) return escHtml(part);
    const words = CODE_WORDS[part];
    const lower = /^[A-Z][a-z]/.test(words) ? `${words.charAt(0).toLowerCase()}${words.slice(1)}` : words;
    return `<span class="code-word" title="Code: ${escHtml(part)}">${escHtml(lower)}</span>`;
  }).join("");
}
