// Display labels for the A4 question banks (src/a4/spec/{aspire,assemble,adapt,activate}.ts). The banks' ids and prompts
// are what Studio stores and digests, so they never change here: the page shows a plain label from this map, the bank's
// own prompt as the help sentence, and an example. tests/a4/questionLabels.test.ts checks that every bank id has a label.

/** id → [plain label, example]. An empty example means the stage's own example (a4Start.EXAMPLES) or none. */
export const QUESTION_LABELS = {
  // Aspire: say what it is for
  agent: ["What is the agent called, and what is its job?", "Invoice helper: sorts supplier invoices and flags odd ones"],
  problem: ["What problem should it solve?", "The finance team sorts supplier invoices by hand every week"],
  audience: ["Who will use it, or be affected by it?", "Accounts payable clerks; Finance manager"],
  currentWorkflow: ["How is this work done today?", "Clerks read each invoice and type it into the ledger"],
  expertise: ["How much detail do you want in explanations?", "novice"],
  goals: ["What should it achieve?", "Sort invoices by supplier and due date; Flag duplicates"],
  successMetrics: ["How will you know it works?", "Share of invoices sorted without a correction"],
  constraints: ["What rules must it respect?", "Read-only access to the ledger"],
  forbiddenActions: ["What must it never do?", "Never pay an invoice"],
  riskTier: ["How much could go wrong?", "low, med, high or critical"],
  markets: ["Which countries or regions first?", "US"],
  stations: ["Which sector is this agent for?", "wealth"],
  governance: ["How strict should approvals be?", "regulated or standard"],
  archetypeInterest: ["Start from a ready-made pattern?", "Leave empty if unsure"],
  // Assemble: build it
  capabilities: ["What must the agent be able to do?", "Read supplier invoice PDFs"],
  autonomy: ["May it act, or only advise?", "advise"],
  tools: ["Which of your workspace tools may it use?", "Leave empty for all signed tools"],
  connectors: ["Which connectors does it need?", "Leave empty for none"],
  providers: ["Which AI model builds it?", "stub (works offline, no key)"],
  existingSystems: ["Which systems will it touch?", "Ledger; Supplier email inbox"],
  budget: ["How much may building it cost?", "Small: a few build sessions"],
  path: ["How should it be built?", "native"],
  validation: ["Which checks should run while it is built?", "Leave empty for none"],
  workflow: ["Does it hand work to helper agents? (advanced)", "Leave empty if not"],
  // Adapt: fit it to your rules
  audiences: ["Who uses it or is affected, by type?", "Accounts payable clerks"],
  workflows: ["Which processes will it take part in?", "Month-end close"],
  preferences: ["How should it sound and behave?", "Short, plain answers"],
  languages: ["Which languages must it work in?", "English"],
  accessibility: ["Which accessibility needs must it meet?", "Screen reader friendly"],
  jurisdictions: ["Where does it operate, legally?", "US"],
  primaryStation: ["Which sector matters most?", "wealth"],
  domains: ["Which areas of the sector?", "Leave empty if unsure"],
  roles: ["What is your role under the rules?", "deployer"],
  entityTypes: ["What kind of organisation are you, under the rules?", "Leave empty if unsure"],
  riskClass: ["What risk class do the rules give it?", "Leave empty if unsure"],
  useCases: ["What activities will it do?", "Leave empty if unsure"],
  excludedUses: ["What must it never be used for?", "Paying or approving invoices"],
  dataClasses: ["What kinds of data does it handle?", "Leave empty if unsure"],
  dataResidency: ["Where must the data stay?", "In the EU"],
  dataRetention: ["How long is data kept?", "Seven years, then deleted"],
  processors: ["Which other companies process the data?", "Our cloud host"],
  deploymentNeeds: ["Where and how will it run?", "One office server, business hours"],
  memoryPrivacyClass: ["How private is what it remembers?", "restricted"],
  memoryRetentionDays: ["How many days may it remember something?", "90"],
  memoryReviewDays: ["After how many days is a memory reviewed?", "30"],
  memoryConsumers: ["Which parts of AMC may read its memory?", "Leave empty for all four"],
  acceptWidenings: ["Accept the wider permissions? (project owner)", "Leave empty to refuse them"],
  // Activate: release it
  target: ["How will it be deployed?", "compose"],
  destinationRef: ["Which address will it run at?", "amc.example.internal:443"],
  hostHint: ["A namespace or host hint (optional)", "finance-agents"],
  leaseScopes: ["What may the released agent reach?", "gateway:llm"],
  executeActionClasses: ["Which kinds of action may it take in production?", "READ_ONLY"],
  stagingRoutes: ["Which routes may it call while testing?", "/openai"],
  productionRoutes: ["Which routes may it call when live?", "/openai"],
  modelAllowlist: ["Which AI models may it call?", "gpt-4o-mini"],
  accessRoles: ["Who may use it, by role?", "Accounts payable clerk"],
  accessNetworks: ["Which networks may reach it?", "Office network"],
  releaseOwner: ["Who owns this release?", "Head of finance operations"],
  onCall: ["Who is on call for it?", "Finance IT rota"],
  budgetRequestsPerMinute: ["At most how many requests a minute?", "30"],
  budgetTokensPerMinute: ["At most how many tokens a minute?", "20000"],
  budgetCostUsdPerDay: ["At most how many dollars a day?", "25"],
  productionLeaseDays: ["How many days does its live permission last?", "30"],
  updateChannel: ["Which update channel?", "stable"],
  updateVersionPin: ["Which version should updates stay on?", "2.0"],
  updateApproval: ["Does an update need approval?", "required"],
  updateWindows: ["When may updates happen?", "Sundays 02:00 to 04:00"],
  autoRollbackOn: ["When should an update undo itself?", "Error rate above 5%"],
  businessOutcomes: ["Which business results should it move?", "Invoice processing time"],
  sustainabilityObjectives: ["Any environmental goals?", "Fewer printed invoices"],
  socialObjectives: ["Any social goals?", "Fewer late supplier payments"],
  monitoringExpectations: ["What should monitoring show?", "Daily count of flagged invoices"],
  rollbackAcceptance: ["How much loss is acceptable if you roll back?", "Up to one hour of data"]
};

/** The plain label, the bank's prompt as help, and an example, for one question; unknown ids fall back to the prompt. */
export function questionDisplay(question, stageExample = "") {
  const [label, example] = QUESTION_LABELS[question?.id] ?? [question?.prompt ?? question?.id ?? "", ""];
  return { label, help: label === question?.prompt ? "" : question?.prompt ?? "", example: stageExample || (example ? `For example: ${example}` : "") };
}
