/**
 * `amc comply risk-classify`: options, the six-question "what applies to my agent" guide (--guide), and the output,
 * which lists provider duties and deployer duties apart, each with the date it applies from.
 * Nothing here says an agent meets the EU AI Act: it lists what the declared answers point to.
 */
import type { Command } from "commander";
import chalk from "chalk";
import type { AgentCapabilities, EuAiActClassification, EuAiActDuty } from "./euAiActClassifier.js";
import type { EuAiActRole } from "./euAiActDuties.js";
import { printClaimResult, unverifiedClaim, withClaimFields } from "../cli/claimOutput.js";

/** Flag name → capability. Order is the order of `--help`. */
const FLAGS: ReadonlyArray<readonly [string, keyof AgentCapabilities, string]> = [
  ["--biometric", "biometricIdentification", "agent performs biometric identification"],
  ["--critical-infra", "criticalInfrastructure", "agent manages critical infrastructure"],
  ["--education", "education", "agent makes education/assessment decisions"],
  ["--employment", "employment", "agent makes employment decisions"],
  ["--essential-services", "essentialServices", "agent controls access to essential services"],
  ["--law-enforcement", "lawEnforcement", "agent assists law enforcement"],
  ["--migration", "migrationBorderControl", "agent handles migration/border control"],
  ["--justice", "justiceAdministration", "agent assists judicial/democratic processes"],
  ["--realtime-biometric", "realtimeBiometricPublicSpaces", "agent performs real-time biometric ID in public spaces"],
  ["--social-scoring", "socialScoring", "agent performs social scoring"],
  ["--subliminal", "subliminalManipulation", "agent uses subliminal manipulation techniques"],
  ["--exploits-vulnerabilities", "exploitsVulnerabilities", "agent exploits vulnerabilities (age, disability)"],
  ["--crime-prediction", "crimePredictionProfiling", "agent predicts a person's risk of crime from profiling alone (Art. 5(1)(d))"],
  ["--face-scraping", "facialImageScraping", "agent builds face databases by untargeted scraping (Art. 5(1)(e))"],
  ["--emotion-recognition", "emotionRecognition", "agent infers emotions in the workplace or in education (prohibited by Art. 5(1)(f) unless for medical or safety reasons)"],
  ["--sensitive-biometric-categorisation", "sensitiveBiometricCategorisation", "agent infers race, religion, politics, union membership or sexuality from biometrics (Art. 5(1)(g))"],
  ["--intimate-imagery", "nonConsensualIntimateImagery", "agent makes intimate images of a real person without consent (Art. 5(1)(ba), from 2 Dec 2026)"],
  ["--child-abuse-material", "childSexualAbuseMaterial", "agent makes child sexual abuse material (Art. 5(1)(bb), from 2 Dec 2026)"],
  ["--chatbot", "chatbot", "agent is a chatbot/conversational system"],
  ["--synthetic-content", "syntheticContentGeneration", "agent generates synthetic audio/image/video/text"],
  ["--deep-fakes", "deepFakes", "you publish deep fakes or AI-written text that informs the public (Art. 50(4))"],
  ["--human-interaction", "humanInteraction", "agent interacts with humans"],
  ["--safety-component", "safetyComponent", "agent is a safety component of a regulated product"],
];

const camel = (flag: string) => flag.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function addRiskClassifyOptions(cmd: Command): Command {
  cmd.option("--agent <agentId>", "agent ID (overrides global --agent)")
    .option("--capabilities <json>", "JSON object of agent capabilities (see docs)")
    .option("--guide", "answer six plain questions to see what applies to your agent (needs a terminal)", false);
  for (const [flag, , help] of FLAGS) cmd.option(flag, help, false);
  return cmd.option("--json", "output as JSON", false);
}

export const GUIDE_BANNED_CHOICES: ReadonlyArray<readonly [keyof AgentCapabilities, string]> = [
  ["subliminalManipulation", "Steers people with hidden or manipulative techniques"],
  ["exploitsVulnerabilities", "Takes advantage of people's age, disability or hardship"],
  ["socialScoring", "Scores people on their social behaviour or personality, to their harm"],
  ["crimePredictionProfiling", "Predicts whether a person will commit a crime from profiling alone"],
  ["facialImageScraping", "Collects faces from the internet or CCTV to build face recognition databases"],
  ["emotionRecognition", "Reads people's emotions at work or at school"],
  ["sensitiveBiometricCategorisation", "Uses faces or other biometrics to guess race, religion, politics, union membership or sexuality"],
  ["realtimeBiometricPublicSpaces", "Identifies people in public places in real time for the police"],
  ["nonConsensualIntimateImagery", "Makes intimate images of a real person without their consent"],
  ["childSexualAbuseMaterial", "Makes sexual material involving children"],
];

export const GUIDE_AREA_CHOICES: ReadonlyArray<readonly [keyof AgentCapabilities, string]> = [
  ["biometricIdentification", "Identifies or sorts people by face, voice or other biometrics"],
  ["criticalInfrastructure", "Runs safety parts of roads, digital infrastructure, water, gas, heating or electricity"],
  ["education", "Decides admission, grades, levels or exam monitoring in schools or training"],
  ["employment", "Hires, promotes, fires, assigns tasks to or monitors workers"],
  ["essentialServices", "Decides public benefits, credit, life or health insurance prices, or emergency calls"],
  ["lawEnforcement", "Helps the police assess people or evidence"],
  ["migrationBorderControl", "Helps with visas, asylum or border checks"],
  ["justiceAdministration", "Helps judges apply the law, or tries to influence how people vote"],
];

/** The six answers of the guide; each maps to capabilities, and the last one picks whose duties to show. */
export interface GuideAnswers {
  banned: Array<keyof AgentCapabilities>;
  areas: Array<keyof AgentCapabilities>;
  safetyComponent: boolean;
  talksToPeople: boolean;
  makesContent: boolean;
  role: EuAiActRole | "both";
}

export function guideCapabilities(answers: GuideAnswers): AgentCapabilities {
  const caps: AgentCapabilities = {};
  for (const key of [...answers.banned, ...answers.areas]) caps[key] = true;
  if (answers.safetyComponent) caps.safetyComponent = true;
  if (answers.talksToPeople) caps.humanInteraction = true;
  if (answers.makesContent) caps.syntheticContentGeneration = true;
  return caps;
}

async function askGuide(): Promise<GuideAnswers> {
  const inq = await import("inquirer");
  const ask = inq.default.prompt;
  console.log(chalk.bold("\nWhat applies to my agent? Six questions about the EU AI Act."));
  console.log(chalk.gray("Answer for what the agent is meant to do. Space ticks a choice, Enter goes on. Tick nothing if none apply.\n"));
  const a = await ask<{ banned: Array<keyof AgentCapabilities>; areas: Array<keyof AgentCapabilities>; safetyComponent: boolean;
    talksToPeople: boolean; makesContent: boolean; role: GuideAnswers["role"] }>([
    { type: "checkbox", name: "banned", message: "1 of 6. Does the agent do any of these? (banned in the EU)", choices: GUIDE_BANNED_CHOICES.map(([value, name]) => ({ name, value })) },
    { type: "checkbox", name: "areas", message: "2 of 6. Does the agent work in any of these areas?", choices: GUIDE_AREA_CHOICES.map(([value, name]) => ({ name, value })) },
    { type: "confirm", name: "safetyComponent", default: false, message: "3 of 6. Is the agent a safety part of a product that already needs an EU safety check (for example a medical device, machine, lift or toy)?" },
    { type: "confirm", name: "talksToPeople", default: false, message: "4 of 6. Does the agent talk or chat with people?" },
    { type: "confirm", name: "makesContent", default: false, message: "5 of 6. Does the agent make text, images, audio or video?" },
    { type: "select", name: "role", message: "6 of 6. Who are you for this agent?", choices: [
      { name: "I build it and offer it under my name (provider)", value: "provider" },
      { name: "I use it in my own work (deployer)", value: "deployer" },
      { name: "Both", value: "both" },
    ] },
  ]);
  return a;
}

function capabilitiesFromFlags(opts: Record<string, unknown>): AgentCapabilities {
  const caps: AgentCapabilities = {};
  for (const [flag, key] of FLAGS) if (opts[camel(flag)] === true) caps[key] = true;
  return caps;
}

const ROLE_HEADING: Record<EuAiActRole, string> = {
  provider: "If you build the agent and offer it under your name (provider):",
  deployer: "If you use the agent in your own work (deployer):",
};

function printDuties(duties: readonly EuAiActDuty[], roles: readonly EuAiActRole[]): void {
  for (const role of roles) {
    const mine = duties.filter((d) => d.role === role);
    if (mine.length === 0) continue;
    console.log(chalk.bold(ROLE_HEADING[role]));
    for (const d of mine) {
      console.log(`  • ${d.duty} ${chalk.gray(`(${d.article}, from ${d.appliesFrom})`)}`);
      if (d.note) console.log(chalk.gray(`    ${d.note}`));
    }
    console.log("");
  }
}

function printClassification(result: EuAiActClassification, roles: readonly EuAiActRole[], claim: ReturnType<typeof unverifiedClaim>): void {
  console.log("");
  console.log(chalk.bold("🇪🇺 EU AI Act Risk Classification"));
  printClaimResult(claim, {});
  console.log("");
  console.log(`Risk Tier: ${chalk.bold(result.riskTier)}`);
  console.log(`Articles: ${result.articles.length > 0 ? result.articles.join(", ") : "none"}`);
  console.log("");
  console.log(result.summary);
  console.log("");
  if (result.findings.length > 0) {
    console.log(chalk.bold("Findings:"));
    for (const finding of result.findings) {
      const sev = finding.severity === "CRITICAL" ? chalk.red(`[${finding.severity}]`)
        : finding.severity === "HIGH" ? chalk.yellow(`[${finding.severity}]`) : chalk.gray(`[${finding.severity}]`);
      console.log(`  ${sev} ${finding.title} (${finding.article})`);
      console.log(chalk.gray(`    ${finding.description}`));
    }
    console.log("");
  }
  printDuties(result.duties ?? [], roles);
  console.log(chalk.gray("This lists what your answers point to. It is not legal advice and does not say the agent meets the EU AI Act."));
  console.log(chalk.gray("Sources: Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744 (Official Journal texts, read 2026-11-16)."));
  console.log(chalk.gray("Next: amc comply roadmap --framework EU_AI_ACT for a step-by-step plan."));
}

export async function riskClassifyAction(opts: Record<string, unknown> & { capabilities?: string; guide?: boolean; json?: boolean }): Promise<void> {
  const { classifyEuAiActRisk } = await import("./euAiActClassifier.js");
  let capabilities: AgentCapabilities;
  let roles: EuAiActRole[] = ["provider", "deployer"];
  if (opts.guide) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
      console.error(chalk.red("--guide asks six questions and needs a terminal."));
      console.error("Without a terminal, pass the flags instead, for example: amc comply risk-classify --employment --chatbot");
      process.exit(1);
    }
    const answers = await askGuide();
    capabilities = guideCapabilities(answers);
    if (answers.role !== "both") roles = [answers.role];
  } else if (opts.capabilities) {
    try {
      capabilities = JSON.parse(opts.capabilities) as AgentCapabilities;
    } catch {
      console.error(chalk.red("Invalid --capabilities JSON"));
      process.exit(1);
    }
  } else {
    capabilities = capabilitiesFromFlags(opts);
  }
  const result = classifyEuAiActRisk(capabilities);
  // Classifies the capabilities the caller declared: self-reported, and a regulated mapping.
  const claim = unverifiedClaim("compliance:euAiActRiskTier", 1, { regulated: true });
  if (opts.json) {
    console.log(JSON.stringify(withClaimFields(result, claim), null, 2));
    return;
  }
  printClassification(result, roles, claim);
}
