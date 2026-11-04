/**
 * Pack questions, deep questions, the station guides and the regulatory calendar are AI-drafted regulatory
 * content that no qualified expert has reviewed (truth rule 8; D-08). They ship as experimental questionnaires
 * whose answers are self-reported (truth rule 3), and nothing in them is evaluated until someone answers.
 */
import { envelopeForSelfAssessment } from "../claims/eligibility/adapters.js";
import { formatClaimLabel, renderClaimLabel } from "../claims/eligibility/render.js";

export const QUESTIONNAIRE_CONTENT_STATUS = "experimental" as const;
export const QUESTIONNAIRE_NOTICE = "AI-drafted; not reviewed by a qualified expert; not legal advice.";

/** The status line and the report-surface claim label for a generated questionnaire page. */
export function questionnaireLabelLines(producer: string): string[] {
  // No answers: the envelope is self-reported and not evaluated. `now` does not reach the label text.
  const envelope = envelopeForSelfAssessment({ producer, regulated: true, answers: [], now: 0 });
  return [`**Status:** ${QUESTIONNAIRE_CONTENT_STATUS}. ${QUESTIONNAIRE_NOTICE}`, "", formatClaimLabel(renderClaimLabel(envelope), "report")];
}
