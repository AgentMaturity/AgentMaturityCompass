/** Next-step wording of the A4 readiness headline (kept out of a4Readiness.ts, which sits at its line cap). */
import type { A4Step } from "./a4Schema.js";

/** The way back to Propose once a stage is past Explain: Propose runs only at step explained (A4_STEP_ORDER). */
export const REDO_PROPOSAL = "Answer again (a new revision returns this stage to Ask), then understand, confirm, explain and propose";

export const STEP_NEXT: Partial<Record<A4Step, string>> = { asked: "Run Understand, then confirm it", understood: "Run Explain", explained: "Run Propose",
  proposed: "Request the direction gate", direction_approved: "Run Build", built: "Run Review", reviewed: "Request the completion gate" };

/** Review refuses an open build session, which readiness cannot read, so the way there is named up front. */
export const ASSEMBLE_REVIEW = "Close the build session first: in Studio, on the Assemble page's Build card, choose Open on Native Tasks and "
  + "press Close and verify. Then run Review";
