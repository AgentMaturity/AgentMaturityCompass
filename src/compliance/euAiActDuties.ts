/**
 * Who must do what under the EU AI Act, and from when: provider duties and deployer duties kept apart.
 *
 * Read on 2026-11-16 in the Official Journal texts of Regulation (EU) 2024/1689 (CELEX 32024R1689) and
 * Regulation (EU) 2026/1744 (CELEX 32026R1744, the "Digital Omnibus on AI"), both opened through
 * https://publications.europa.eu/resource/celex/<CELEX>, and checked against the European Commission's
 * AI Act page (https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai, last updated
 * 19 October 2026). Dates come from Art. 113 (as amended) and Art. 111(4) (added by 2026/1744).
 * This is a reading aid, not legal advice; it never says an agent meets the Act.
 */
import { EU_AI_ACT_TIMELINE } from "./euAiActTimeline.js";

export type EuAiActRole = "provider" | "deployer";

export interface EuAiActDuty {
  role: EuAiActRole;
  article: string;
  duty: string;
  /** YYYY-MM-DD from EU_AI_ACT_TIMELINE. */
  appliesFrom: string;
  note?: string;
}

/** What a duty list is built from: the Art. 5 points, the high-risk bases and the Art. 50 paragraphs found. */
export interface EuAiActDutyInput {
  prohibited: Array<{ article: string; appliesFrom: string }>;
  annexIII: boolean;
  /** Annex III point 2 (critical infrastructure) only: registered at national level (Art. 49(5)). */
  annexIIIPoint2Only: boolean;
  annexI: boolean;
  art50: string[];
}

const T = EU_AI_ACT_TIMELINE;

function aiLiteracy(): EuAiActDuty[] {
  const duty = "Take measures to support the AI literacy of staff and others who operate or use the system on your behalf.";
  return [
    { role: "provider", article: "Art. 4", duty, appliesFrom: T.prohibitionsAndAiLiteracy },
    { role: "deployer", article: "Art. 4", duty, appliesFrom: T.prohibitionsAndAiLiteracy },
  ];
}

function prohibitedDuties(prohibited: EuAiActDutyInput["prohibited"]): EuAiActDuty[] {
  return prohibited.flatMap(({ article, appliesFrom }) => [
    { role: "provider" as const, article, duty: "Do not place this system on the EU market or put it into service.", appliesFrom },
    { role: "deployer" as const, article, duty: "Do not use this system.", appliesFrom },
  ]);
}

function highRiskDuties(input: EuAiActDutyInput): EuAiActDuty[] {
  const dates: string[] = [];
  if (input.annexIII) dates.push(T.annexIIIHighRisk);
  if (input.annexI) dates.push(T.article6_1AnnexIHighRisk);
  const appliesFrom = [...dates].sort()[0] ?? T.annexIIIHighRisk;
  const note = dates.length > 1
    ? `Annex III use from ${T.annexIIIHighRisk}; Annex I product from ${T.article6_1AnnexIHighRisk}. The earlier date is shown.`
    : undefined;
  // Art. 113 delays only Chapter III Sections 1 to 3; Arts. 72 and 73 (Chapter IX) carry no date of their own.
  const afterMarketNote = `The Act sets no separate date for this duty; the date shown is AMC's reading, not a date the Act states.${note ? ` ${note}` : ""}`;
  const p = (article: string, duty: string, extra: Partial<EuAiActDuty> = {}): EuAiActDuty => ({ role: "provider", article, duty, appliesFrom, ...(note ? { note } : {}), ...extra });
  const d = (article: string, duty: string, extra: Partial<EuAiActDuty> = {}): EuAiActDuty => ({ role: "deployer", article, duty, appliesFrom, ...(note ? { note } : {}), ...extra });
  const duties: EuAiActDuty[] = [
    p("Art. 9", "Run a risk management system for the whole life of the system."),
    p("Art. 10", "Use training, validation and test data that meet the data quality rules, including a check for bias."),
    p("Art. 11", "Write and keep the technical documentation (Annex IV)."),
    p("Art. 12", "Make the system record events automatically (logs)."),
    p("Art. 13", "Give deployers clear instructions for use."),
    p("Art. 14", "Design the system so people can oversee it and stop it."),
    p("Art. 15", "Reach appropriate accuracy, robustness and cybersecurity."),
    p("Art. 17", "Run a quality management system."),
    p("Art. 43", "Carry out the conformity assessment before the system is placed on the market."),
    p("Art. 47, Art. 48", "Draw up the EU declaration of conformity and affix the CE marking."),
    p("Art. 72", "Monitor the system after it is on the market, following a written plan.", { note: afterMarketNote }),
    p("Art. 73", "Report serious incidents to the market surveillance authority.", { note: afterMarketNote }),
    d("Art. 26", "Use the system as its instructions say, assign trained people to oversee it, watch how it works and keep its logs."),
  ];
  if (input.annexIII && !input.annexIIIPoint2Only) {
    duties.push(
      p("Art. 49(1)", "Register yourself and the system in the EU database (Art. 71) before placing it on the market or putting it into service."),
      d("Art. 49(3)", "Public authorities and EU bodies, and those acting for them: register your use of the system in the EU database before using it.",
        { note: "Applies only to deployers that are public authorities, EU institutions or bodies, or act on their behalf." }),
      d("Art. 27", "Assess the impact on fundamental rights before first use.",
        { note: "Applies to public bodies, private bodies providing public services, and deployers of Annex III point 5(b) or 5(c) systems." }),
    );
  }
  if (input.annexIIIPoint2Only) {
    duties.push(p("Art. 49(5)", "Register the system at national level (critical infrastructure systems are not in the EU database)."));
  }
  return duties;
}

function transparencyDuties(art50: string[]): EuAiActDuty[] {
  const duties: EuAiActDuty[] = [];
  const has = (a: string) => art50.includes(a);
  if (has("Art. 50(1)")) {
    duties.push({ role: "provider", article: "Art. 50(1)", duty: "Design the system so people are told they are dealing with an AI system, unless that is obvious.", appliesFrom: T.generalApplication });
  }
  if (has("Art. 50(2)")) {
    duties.push({ role: "provider", article: "Art. 50(2)", duty: "Mark generated audio, images, video and text in a machine-readable way so they can be detected as AI-made.", appliesFrom: T.generalApplication,
      note: `A system already on the market before ${T.generalApplication} has until ${T.newProhibitionsAndArt50_2Transition} (Art. 111(4)).` });
  }
  if (has("Art. 50(4)")) {
    duties.push({ role: "deployer", article: "Art. 50(4)", duty: "Disclose that deep fake images, audio or video, and AI-written text published to inform the public, were made or changed by AI.", appliesFrom: T.generalApplication });
  }
  return duties;
}

/** Provider and deployer duties for one classification, AI literacy first. */
export function euAiActDuties(input: EuAiActDutyInput): EuAiActDuty[] {
  if (input.prohibited.length > 0) return [...aiLiteracy(), ...prohibitedDuties(input.prohibited)];
  const highRisk = input.annexIII || input.annexI ? highRiskDuties(input) : [];
  return [...aiLiteracy(), ...highRisk, ...transparencyDuties(input.art50)];
}
