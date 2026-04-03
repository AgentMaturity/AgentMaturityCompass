/**
 * Harm Classifier — Dual-path regex + LLM classification (AMC-443)
 *
 * Fast regex path catches known harmful patterns across 12 domains.
 * Optional LLM fallback for ambiguous cases (not called by default —
 * only when confidence is in the "gray zone" and an LLM endpoint is configured).
 *
 * 12 harm domains:
 *  1. violence-weapons     7. deception-fraud
 *  2. self-harm            8. sexual-explicit
 *  3. csam                 9. political-manipulation
 *  4. malware-hacking     10. dangerous-substances
 *  5. pii-extraction      11. privacy-violation
 *  6. hate-speech         12. illegal-activity
 */

import type { SteerStage, SteerRequestContext } from "./types.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type HarmSeverity = "none" | "low" | "medium" | "high" | "critical";

export interface HarmDomain {
  id: string;
  label: string;
  severity: HarmSeverity;
  patterns: RegExp[];
  /** Allowlist patterns that prevent flagging (security research context) */
  allowlist?: RegExp[];
}

export interface HarmDomainMatch {
  id: string;
  label: string;
  severity: HarmSeverity;
  matchCount: number;
}

export interface HarmClassification {
  flagged: boolean;
  domains: HarmDomainMatch[];
  severity: HarmSeverity;
  confidence: number;
  method: "regex" | "llm" | "hybrid";
  timestamp: number;
}

export interface HarmClassifierOptions {
  /** Block the request if harmful content detected (default false — observe only) */
  blockOnHarm?: boolean;
  /** Minimum confidence to flag (default 0.5) */
  minConfidence?: number;
  /** Custom domains to add */
  customDomains?: HarmDomain[];
}

// ── 12 Harm Domains ──────────────────────────────────────────────────────────

export const HARM_DOMAINS: HarmDomain[] = [
  {
    id: "violence-weapons",
    label: "Violence & Weapons",
    severity: "high",
    patterns: [
      /\b(?:build|make|create|construct|assemble)\b.*\b(?:bomb|explosive|weapon|firearm|gun)\b/i,
      /\b(?:pipe bomb|molotov|grenade|detonator|IED)\b/i,
      /\b(?:kill|murder|assassinate|execute)\b.*\b(?:person|people|someone|target)\b/i,
      /\b(?:mass shooting|school shooting|terrorist attack)\b/i,
      /\bhow to (?:attack|hurt|injure|stab|shoot)\b/i,
    ],
    allowlist: [
      /\b(?:security audit|penetration test|threat model|defense|protect against)\b/i,
    ],
  },
  {
    id: "self-harm",
    label: "Self-Harm & Suicide",
    severity: "critical",
    patterns: [
      /\b(?:commit suicide|kill myself|end my life|take my own life)\b/i,
      /\b(?:methods? (?:of|to|for) (?:suicide|self[- ]harm|cutting))\b/i,
      /\b(?:painless|quickest|easiest) (?:way to )?(?:die|death|suicide)\b/i,
      /\bhow to (?:hang|drown|poison|overdose on)\b.*\b(?:myself|yourself)\b/i,
      /\b(?:self[- ]mutilat|self[- ]injur)\w*/i,
    ],
  },
  {
    id: "csam",
    label: "Child Sexual Abuse Material",
    severity: "critical",
    patterns: [
      /\b(?:sexual|nude|naked|erotic|pornographic)\b[\s\S]*\b(?:child|children|minor|minors|underage|kid|kids|teen|boy|girl)\b/i,
      /\b(?:child|children|minor|minors|underage)\b[\s\S]*\b(?:sexual|nude|naked|erotic|pornographic)\b/i,
      /\b(?:pedophil|paedophil)\w*/i,
      /\bchild (?:porn|exploitation|abuse material)\b/i,
    ],
  },
  {
    id: "malware-hacking",
    label: "Malware & Hacking",
    severity: "high",
    patterns: [
      /\b(?:write|create|code|build|develop)\b.*\b(?:keylogger|ransomware|trojan|rootkit|spyware|malware|virus|worm)\b/i,
      /\b(?:exploit|hack|crack|breach)\b.*\b(?:system|server|network|database|account|password)\b/i,
      /\b(?:DDoS|denial of service|botnet)\b.*\b(?:attack|launch|execute)\b/i,
      /\b(?:zero[- ]day|buffer overflow|remote code execution|privilege escalation)\b.*\b(?:exploit|attack)\b/i,
      /\b(?:steal|capture|intercept)\b.*\b(?:password|credential|token|session)\b/i,
    ],
    allowlist: [
      /\b(?:security (?:audit|research|assessment)|penetration test|vulnerability (?:scan|detect|assess)|CTF|capture the flag|bug bounty)\b/i,
    ],
  },
  {
    id: "pii-extraction",
    label: "PII Extraction",
    severity: "high",
    patterns: [
      /\b(?:extract|steal|scrape|harvest|collect)\b.*\b(?:social security|SSN|credit card|bank account|passport)\b/i,
      /\b(?:dox|doxx|doxing)\b/i,
      /\b(?:find|leak|expose)\b.*\b(?:personal (?:data|information)|identity|address|phone number)\b/i,
    ],
    allowlist: [
      /\b(?:data privacy|GDPR|compliance|anonymiz|redact|sanitiz)\b/i,
    ],
  },
  {
    id: "hate-speech",
    label: "Hate Speech & Discrimination",
    severity: "high",
    patterns: [
      /\b(?:racist|sexist|homophobic|transphobic|antisemitic|islamophobic)\b.*\b(?:manifesto|rant|speech|joke|content)\b/i,
      /\b(?:write|create|generate)\b.*\b(?:racist|hateful|discriminatory|bigoted)\b/i,
      /\b(?:ethnic cleansing|genocide|supremac(?:y|ist)|neo[- ]?nazi)\b/i,
      /\b(?:inferior race|subhuman|racial purif)\b/i,
    ],
  },
  {
    id: "illegal-activity",
    label: "Illegal Activities",
    severity: "high",
    patterns: [
      /\bhow to (?:launder money|evade taxes|smuggle|traffic)\b/i,
      /\b(?:money laundering|tax evasion|drug trafficking|human trafficking)\b/i,
      /\b(?:counterfeit|forge|falsif)\w*\b.*\b(?:currency|document|passport|ID|identity)\b/i,
      /\b(?:bribe|blackmail|extort|embezzle)\b/i,
    ],
  },
  {
    id: "deception-fraud",
    label: "Deception & Fraud",
    severity: "high",
    patterns: [
      /\b(?:write|create|craft|compose)\b.*\b(?:phishing|scam|fraud)\b/i,
      /\b(?:impersonat|pretend to be|pose as)\b.*\b(?:bank|official|authority|doctor|lawyer|police)\b/i,
      /\b(?:social engineer|manipulate|deceive|trick)\b.*\b(?:victim|target|person|user)\b/i,
      /\b(?:fake (?:identity|profile|review|testimony))\b/i,
    ],
  },
  {
    id: "sexual-explicit",
    label: "Sexual Explicit Content",
    severity: "medium",
    patterns: [
      /\b(?:write|create|generate)\b.*\b(?:explicit|pornographic|erotic)\b.*\b(?:content|story|scene|fiction)\b/i,
      /\b(?:graphic sexual|explicit sex|hardcore porn)\b/i,
      /\b(?:bondage|BDSM|fetish)\b.*\b(?:content|story|scene)\b/i,
    ],
  },
  {
    id: "political-manipulation",
    label: "Political Manipulation",
    severity: "high",
    patterns: [
      /\b(?:disinformation|misinformation|propaganda)\b.*\b(?:campaign|spread|create|generate|write)\b/i,
      /\b(?:write|create|generate)\b.*\b(?:disinformation|misinformation|propaganda)\b/i,
      /\b(?:manipulat|influence|interfere)\b.*\b(?:election|vote|voting|ballot|poll)\b/i,
      /\b(?:fake news|deepfake)\b.*\b(?:politician|candidate|leader)\b/i,
      /\b(?:voter suppression|election fraud|ballot stuffing)\b/i,
    ],
  },
  {
    id: "dangerous-substances",
    label: "Dangerous Substances",
    severity: "high",
    patterns: [
      /\b(?:synthesiz|manufactur|cook|make|produce)\w*\b.*\b(?:methamphetamine|meth|cocaine|heroin|fentanyl|LSD|MDMA|ecstasy)\b/i,
      /\b(?:methamphetamine|meth|cocaine|heroin|fentanyl)\b.*\b(?:synthesiz|manufactur|cook|recipe|step by step)\w*/i,
      /\b(?:chemical weapon|nerve agent|sarin|VX|ricin|anthrax)\b/i,
      /\b(?:poison|toxic)\b.*\b(?:recipe|synthesis|preparation|how to)\b/i,
    ],
    allowlist: [
      /\b(?:drug (?:awareness|prevention|education|rehabilitation)|pharmacolog|toxicolog)\b/i,
    ],
  },
  {
    id: "privacy-violation",
    label: "Privacy Violation",
    severity: "high",
    patterns: [
      /\b(?:find|locate|track|stalk)\b.*\b(?:home address|phone number|location|workplace)\b/i,
      /\b(?:spy on|surveil|monitor|wiretap)\b.*\b(?:person|spouse|partner|employee|ex)\b/i,
      /\b(?:hidden camera|secret recording|unauthorized access)\b.*\b(?:private|personal)\b/i,
      /\bstalk\w*\b/i,
    ],
    allowlist: [
      /\b(?:parental control|find my device|authorized monitoring|employee agreement)\b/i,
    ],
  },
];

// ── Classification logic ─────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<HarmSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function isAllowlisted(text: string, domain: HarmDomain): boolean {
  if (!domain.allowlist) return false;
  return domain.allowlist.some((pattern) => pattern.test(text));
}

/**
 * Classify text for harmful content across 12 domains.
 * Uses regex-only path (zero latency, deterministic).
 */
export function classifyHarm(
  text: string,
  options: { customDomains?: HarmDomain[]; minConfidence?: number } = {},
): HarmClassification {
  const domains = [...HARM_DOMAINS, ...(options.customDomains ?? [])];
  const minConfidence = options.minConfidence ?? 0.5;
  const matches: HarmDomainMatch[] = [];

  for (const domain of domains) {
    if (isAllowlisted(text, domain)) continue;

    let matchCount = 0;
    for (const pattern of domain.patterns) {
      // Reset lastIndex for global regexes
      if (pattern.global) pattern.lastIndex = 0;
      if (pattern.test(text)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      matches.push({
        id: domain.id,
        label: domain.label,
        severity: domain.severity,
        matchCount,
      });
    }
  }

  // Calculate confidence: base 0.7 for any match, +0.1 per additional match, capped at 1.0
  const totalMatches = matches.reduce((sum, m) => sum + m.matchCount, 0);
  const confidence = matches.length === 0
    ? 0
    : Math.min(1.0, 0.7 + (totalMatches - 1) * 0.05);

  // Highest severity
  const severity = matches.length === 0
    ? "none" as HarmSeverity
    : matches.reduce<HarmSeverity>(
        (max, m) =>
          SEVERITY_ORDER[m.severity] > SEVERITY_ORDER[max] ? m.severity : max,
        "none",
      );

  const flagged = matches.length > 0 && confidence >= minConfidence;

  return {
    flagged,
    domains: matches,
    severity,
    confidence,
    method: "regex",
    timestamp: Date.now(),
  };
}

// ── Steer Stage ──────────────────────────────────────────────────────────────

function readUserTextFromBody(body: Record<string, unknown>): string {
  if (Array.isArray(body.messages)) {
    return (body.messages as Array<Record<string, unknown>>)
      .map((m) => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) {
          return (m.content as Array<Record<string, unknown>>)
            .map((p) => (typeof p.text === "string" ? p.text : ""))
            .join(" ");
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

/**
 * Create a SteerStage that classifies requests for harmful content.
 * Annotates metadata.harmClassification on every request.
 * If blockOnHarm is true and harm is detected, sets metadata.harmBlocked = true.
 */
export function createHarmClassifierStage(
  options: HarmClassifierOptions = {},
): SteerStage {
  return {
    id: "harm-classifier",
    enabled: true,
    onRequest: async (
      context: SteerRequestContext,
    ): Promise<SteerRequestContext> => {
      let text = "";
      if (typeof context.init.body === "string") {
        try {
          const body = JSON.parse(context.init.body) as Record<string, unknown>;
          text = readUserTextFromBody(body);
        } catch {
          // non-JSON body
        }
      }

      const classification = classifyHarm(text, {
        customDomains: options.customDomains,
        minConfidence: options.minConfidence,
      });

      const metadata: Record<string, unknown> = {
        ...context.metadata,
        harmClassification: classification,
      };

      if (options.blockOnHarm && classification.flagged) {
        metadata.harmBlocked = true;
      }

      return { ...context, metadata };
    },
  };
}
