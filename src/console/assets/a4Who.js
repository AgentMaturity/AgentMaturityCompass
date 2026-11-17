// Who may do what on an A4 project, in the words the "What to do now" panel, the start form, the Approvals card and Home
// share, and Home's look for an approval that waits for this person. No imports, so a4View.js and a4Start.js both use it.
// Studio decides every rule; this only says what readiness and the gate records already report.

/** The words while self-approval can meet the gate (readiness.selfApprovalAllowed; src/a4/a4Words.ts SELF_APPROVE). */
export const SELF_APPROVE = "You are the only person who can sign in here, so you approve this one yourself, and it is recorded as self-approved.";

/** The start form's practice choice (docs/A4_FORGE.md, "How many people a walk needs"). */
export const PRACTICE_CHOICE = "You may approve your own work. Each such approval is recorded and shown as self-approved, and a practice project "
  + "stops being one as soon as a second person can sign in. Alone you can get as far as building the agent in step 2, Build it (Assemble); "
  + "its final approval and every later step need two other people. Do not use it for real work.";

/**
 * Whether the one person alone approves this gate themselves: the single-user rule is open (readiness.selfApprovalAllowed)
 * and one approval meets the gate. Self-approval counts once, so a gate that needs two (QUORUM_UNREACHABLE) needs new people.
 */
export function selfApproves(readiness, required) {
  const sod = Array.isArray(readiness?.items) ? readiness.items.find((item) => item?.id === "sod") : null;
  return readiness?.selfApprovalAllowed === true && !(Number(required) > 1)
    && !(Array.isArray(sod?.reasonCodes) && sod.reasonCodes.includes("QUORUM_UNREACHABLE"));
}

/** Alone, at a gate one self-approval cannot meet: what the person's own approval does, and what the gate needs instead. */
export const selfCountsOnce = (required) => `You may approve it yourself, recorded as self-approved, but that counts once and this approval needs `
  + `${Number(required)}. Adding a person cancels this request and ends self-approval, so it then needs ${Number(required)} people other than you.`;

/** The Approvals card's line on who may not approve the gate shown; `names` are the excluded people, already escaped. */
export function exclusionLine(readiness, row, names) {
  if (selfApproves(readiness, row.required)) return `<p>${SELF_APPROVE}</p>`;
  if (readiness?.selfApprovalAllowed === true) return `<p>${selfCountsOnce(row.required)}</p>`;
  return `<p>Cannot approve (separation of duties); may still deny: ${names.join(", ")}</p>`;
}

/**
 * Studio's role check answers 403 with no A4 code to anyone else, which the page cannot tell from a lost acknowledgement,
 * so the create form and the home card are offered only to OPERATOR or OWNER in a workspace Studio reports writable.
 */
export const isOwner = (who) => Array.isArray(who?.roles) && who.roles.includes("OWNER");
export const canCreate = (who, options) => Array.isArray(who?.roles) && who.roles.some((role) => role === "OPERATOR" || role === "OWNER")
  && options?.workspace?.readOnly === false;

/**
 * Engine requests (a stage's second request) this tab recorded a decision on, per username: readiness names no engine
 * decisions, and a second one is refused (distinct_approvers). Kept in sessionStorage so a reload in the same tab
 * remembers; Studio still refuses any repeat. The panel and the effect card both read it.
 */
const DECIDED_KEY = "amc.a4.decidedEngineRequests";
const decidedHere = (() => {
  try { return new Set(JSON.parse(sessionStorage.getItem(DECIDED_KEY) ?? "[]")); } catch { return new Set(); }
})();
const decidedKey = (username, approvalRequestId) => `${username ?? ""}:${approvalRequestId}`;
export const decidedByMe = (username, approvalRequestId) => decidedHere.has(decidedKey(username, approvalRequestId));
export const rememberDecided = (approvalRequestId, username) => {
  decidedHere.add(decidedKey(username, approvalRequestId));
  try { sessionStorage.setItem(DECIDED_KEY, JSON.stringify([...decidedHere].slice(-200))); } catch { /* storage unavailable: this load still remembers */ }
};

const listOf = (data, key) => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []);

/**
 * The first open project whose gate waits for this person's decision: a PENDING gate Studio lets them decide
 * (readiness.allowed.decide) that does not exclude them, unless self-approval is open. At most ten projects are read,
 * each through `request` (the page's apiNativeRequest).
 */
export async function approvalWaiting(projects, who, request, api = "/api/v1/a4") {
  for (const project of projects.filter((row) => row.stage !== "retired").slice(0, 10)) {
    const path = `${api}/projects/${encodeURIComponent(project.projectId)}`;
    const reply = await request(`${path}/readiness`).catch(() => null);
    const readiness = reply?.readiness !== null && typeof reply?.readiness === "object" ? reply.readiness : reply;
    // A gate's own approval, or the second request that applies what was built (effect_gate, decided like requestChanges).
    const effect = readiness?.gates?.completion?.status === "QUORUM_MET" && readiness.allowed?.requestChanges?.allowed === true
      && listOf(readiness.items, "items").some((item) => (item.id === "effect_gate" || item.id === "plan_review_opened") && listOf(item.reasonCodes, "codes").includes("APPROVAL_STATUS:PENDING"));
    const kind = ["direction", "completion"].find((name) => readiness?.gates?.[name]?.status === "PENDING" && readiness.allowed?.decide?.allowed === true) ?? (effect ? "effect" : null);
    if (!kind) continue;
    const gate = listOf(await request(`${path}/gates`).catch(() => null), "gates").find((row) => row.gateId === readiness.gates[kind === "effect" ? "completion" : kind].gateId);
    const excluded = Array.isArray(gate?.excludedKeys) && gate.excludedKeys.some((key) => String(key).endsWith(`:${who?.userId}`));
    if (gate && (!excluded || readiness.selfApprovalAllowed === true)) return { project, kind };
  }
  return null;
}
