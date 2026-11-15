/** Plain words for A4 readiness items, shared by Studio's refusals (a4Gates.assertAllowed) and `amc a4 readiness`. */

/** The items a refusal most often names, in plain words with the next step; any other item says its own next action. */
const NOT_READY_WORDS: Readonly<Record<string, string>> = {
  "sod.self_provisioned": "Every approver here was created in this one workspace, so AMC cannot show they are different people. A project owner "
    + "acknowledges this once, with a reason, on the Missing requirements card; it holds for 90 days.",
  sod: "Someone other than the person who wrote, built or asked for this step must approve it (separation of duties). Add a second person on the "
    + "project's Members card first.",
  ask_complete: "Some questions still need an answer, or an answer is not one AMC accepts. Answer them under Ask and press Save answers.",
  understanding_confirmed: "Run Understand, check what AMC understood from your answers, and confirm it.",
  plan_unresolved: "Some rules depend on facts that are still unknown. Answer them under Ask (on a regulated project they cannot be acknowledged instead).",
  "hold.none": "The project is on hold. A project owner resumes it.",
  "gate.direction": "This step's plan waits for approval before anything is built.",
  "gate.completion": "This step waits for the approval that completes it.",
  "resources.current": "The agent's files changed since this revision was recorded. Save an answer under Ask to record a new revision."
};

/** Alone on the project an acknowledgement only leads to a second refusal, so the words name the way out instead. */
const NOBODY_ELSE = "Nobody else on this project can approve it. Invite a second person on the Members card (Invite someone new), "
  + "or add someone who can already sign in there. To learn AMC alone, start a practice project instead.";

/** A gate the one person here may approve themselves (readiness selfApprovalAllowed), as the console's guide says it too. */
export const SELF_APPROVE = "You are the only person who can sign in here, so you approve this one yourself, and it is recorded as self-approved. "
  + "Self-approval counts once: a step that needs two approvals also needs a second person.";

/** The step of the stage that makes a record an item waits for (reason code PRODUCED_AT_<STEP>, or NOT_PROPOSED), in the console's words. */
const PRODUCED_AT: Readonly<Record<string, string>> = { UNDERSTAND: "Understand", PROPOSE: "Propose", BUILD: "Build", REVIEW: "Review" };

/**
 * One readiness item in words: NOT_READY_WORDS, else its own next action, else, for a record a later step makes
 * (PRODUCED_AT_<STEP>), when it is made. sod.self_provisioned carries NO_SECOND_APPROVER when nobody else can decide.
 */
export function notReadyWords(item: { id: string; reasonCodes: readonly string[]; nextAction?: { label?: string } | null }): string | undefined {
  if (item.id === "sod.self_provisioned" && item.reasonCodes.includes("NO_SECOND_APPROVER")) return NOBODY_ELSE;
  const step = item.reasonCodes.map((code) => code === "NOT_PROPOSED" ? "PROPOSE" : /^PRODUCED_AT_([A-Z]+)$/.exec(code)?.[1])
    .find((name) => name !== undefined && PRODUCED_AT[name] !== undefined);
  return NOT_READY_WORDS[item.id] ?? item.nextAction?.label
    ?? (step === undefined ? undefined : `Not made yet: AMC records it when you run ${PRODUCED_AT[step]} at this stage.`);
}

/** `amc a4 members` as it runs: a writer names its `amc approvals login` token and the head it read (`amc a4 guide` prints it). */
export const addApprovers = (projectId: string, label: string): { label: string; command: string } => ({ label,
  command: `amc a4 members ${projectId} --member LOCAL_USER:<userId> --project-role approver --session-token-file <file> --expect-head-seq <n>` });
