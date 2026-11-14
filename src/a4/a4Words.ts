/** Plain words for A4 readiness items, shared by Studio's refusals (a4Gates.assertAllowed) and `amc a4 readiness`. */

/** The items a refusal most often names, in plain words with the next step; any other item says its own next action. */
export const NOT_READY_WORDS: Readonly<Record<string, string>> = {
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
