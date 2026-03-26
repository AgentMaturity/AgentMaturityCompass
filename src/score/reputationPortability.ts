/**
 * Agent Discovery & Reputation Portability — AMC gap closure
 * Source: Community research (eudaemon_0 "TIL no search engine", S1nth "agent-to-agent bridge")
 * 
 * Scores how portable an agent's reputation/identity is across platforms.
 * Agents shouldn't be locked to one platform for their trust record.
 */

export interface ReputationPortabilityProfile {
  agentId: string;
  hasPortableIdentity: boolean;        // Can identity be verified cross-platform?
  hasCapabilityDeclaration: boolean;   // Published capability manifest?
  hasExportableMaturityScore: boolean; // AMC score exportable as credential?
  hasCrossPlatformHistory: boolean;    // Evidence history portable?
  platformCount: number;               // How many platforms recognize this agent
  signedCredentials: boolean;          // Are credentials cryptographically signed?
  discoverability: "none" | "manual" | "directory" | "searchable" | "federated";
  overallScore: number;
  level: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  recommendations: string[];
}

export function assessReputationPortability(input: {
  hasPortableIdentity?: boolean;
  hasCapabilityDeclaration?: boolean;
  hasExportableMaturityScore?: boolean;
  hasCrossPlatformHistory?: boolean;
  platformCount?: number;
  signedCredentials?: boolean;
  discoverability?: ReputationPortabilityProfile["discoverability"];
}): ReputationPortabilityProfile {
  const portable = input.hasPortableIdentity ?? false;
  const capability = input.hasCapabilityDeclaration ?? false;
  const exportable = input.hasExportableMaturityScore ?? false;
  const crossPlatform = input.hasCrossPlatformHistory ?? false;
  const platforms = input.platformCount ?? 1;
  const signed = input.signedCredentials ?? false;
  const discover = input.discoverability ?? "none";

  let score = 0;
  if (portable) score += 20;
  if (capability) score += 15;
  if (exportable) score += 15;
  if (crossPlatform) score += 15;
  if (signed) score += 15;
  const discoverScores: Record<string, number> = {
    none: 0, manual: 5, directory: 10, searchable: 15, federated: 20,
  };
  score += discoverScores[discover] ?? 0;

  let level: ReputationPortabilityProfile["level"];
  if (score >= 90) level = "L5";
  else if (score >= 75) level = "L4";
  else if (score >= 55) level = "L3";
  else if (score >= 35) level = "L2";
  else if (score >= 15) level = "L1";
  else level = "L0";

  const recommendations: string[] = [];
  if (!portable) recommendations.push("Implement Agent Passport for cross-platform identity verification");
  if (!capability) recommendations.push("Publish capability declaration in Open Compass Standard format");
  if (!exportable) recommendations.push("Enable AMC score export as verifiable credential");
  if (!crossPlatform) recommendations.push("Enable evidence history export for cross-platform portability");
  if (!signed) recommendations.push("Sign credentials cryptographically for tamper-evidence");
  if (discover === "none") recommendations.push("Register in agent directory for discoverability");

  return {
    agentId: "",
    hasPortableIdentity: portable,
    hasCapabilityDeclaration: capability,
    hasExportableMaturityScore: exportable,
    hasCrossPlatformHistory: crossPlatform,
    platformCount: platforms,
    signedCredentials: signed,
    discoverability: discover,
    overallScore: score,
    level,
    recommendations,
  };
}
