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
  SOC2: "SOC 2", NIST_AI_RMF: "NIST AI RMF", ISO_27001: "ISO 27001", ISO_42001: "ISO 42001", EU_AI_ACT: "EU AI Act"
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

/** The same as HTML: the words, with the code on the title. */
export function plainCodeHtml(value) {
  const text = String(value ?? "");
  const esc = (part) => part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const words = plainCode(text);
  return words === text ? esc(text) : `<span class="code-word" title="Code: ${esc(text)}">${esc(words)}</span>`;
}
