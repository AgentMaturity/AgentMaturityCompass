/**
 * EU AI Act application dates, shared by the classifier (euAiActClassifier.ts) and the duty list (euAiActDuties.ts).
 * Re-checked on 2026-11-16 in the Official Journal text of Regulation (EU) 2026/1744 (Art. 1 points (39) and (40):
 * Art. 111(2) and (4), Art. 113 third paragraph points (a), (c) and (d)) and its Art. 3 (entry into force on the third
 * day after publication on 24.7.2026), opened through https://publications.europa.eu/resource/celex/32026R1744.
 * First read on 2026-10-03 from the Commission's AI Act Service Desk.
 * Each key must equal the verified keyDate of the same id in the regulatory
 * register entry "eu-ai-act" (src/compliance/regulatory/register.json);
 * tests/euAiActTimeline.test.ts enforces the parity.
 */
export const EU_AI_ACT_TIMELINE = {
  entryIntoForce: "2024-08-01",
  prohibitionsAndAiLiteracy: "2025-02-02",
  gpaiObligationsAndGovernance: "2025-08-02",
  omnibusEntryIntoForce: "2026-07-27",
  generalApplication: "2026-08-02",
  newProhibitionsAndArt50_2Transition: "2026-12-02",
  gpaiLegacyModelsDeadline: "2027-08-02",
  annexIIIHighRisk: "2027-12-02",
  article6_1AnnexIHighRisk: "2028-08-02",
  // Art. 111(2) as amended (OJ text of Regulation (EU) 2026/1744, CELEX 32026R1744) and Art. 111(1)
  // (CELEX 32024R1689), read 2026-10-04 via https://publications.europa.eu/resource/celex/<CELEX> by the
  // round-2 register batch (program-records/2026-10-03/round2/register-eu-intl).
  publicAuthorityHighRiskDeadline: "2030-08-02",
  annexXLargeScaleIt: "2030-12-31",
} as const;
