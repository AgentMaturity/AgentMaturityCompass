/**
 * Natural language → AMC command resolver.
 * Pure keyword matching — no LLM, instant, offline.
 */

export interface ParsedCommand {
  /** The resolved AMC command (without 'amc' prefix) */
  command: string;
  /** Whether this was a natural language match (vs exact command) */
  natural: boolean;
  /** Human-readable description of what will happen */
  description: string;
}

interface NaturalMapping {
  patterns: RegExp[];
  command: string;
  description: string;
}

const NATURAL_MAPPINGS: NaturalMapping[] = [
  // Scoring
  {
    patterns: [/^score/i, /^how am i doing/i, /^rate/i, /^assess me/i, /^check.*score/i, /^run.*score/i, /^quickscore/i],
    command: "quickscore",
    description: "Running quickscore assessment",
  },

  // Gaps & problems
  {
    patterns: [/^what.*(?:gap|wrong|weak|miss|problem|issue)/i, /^show.*gap/i, /^find.*gap/i, /^gap/i],
    command: "evidence gaps",
    description: "Checking evidence gaps",
  },
  {
    patterns: [/^biggest.*gap/i, /^worst/i, /^weakest/i, /^mechanic/i],
    command: "mechanic gap",
    description: "Finding weakest dimensions",
  },

  // Improvement
  {
    patterns: [/^improve/i, /^fix/i, /^guide/i, /^how.*(?:improve|fix|better)/i, /^make.*better/i],
    command: "guide",
    description: "Generating improvement guide",
  },
  {
    patterns: [/^apply.*guide/i, /^auto.*fix/i, /^apply.*fix/i],
    command: "guide --apply",
    description: "Applying improvement guide to agent config",
  },

  // Assurance / testing — more specific patterns first
  {
    patterns: [/^run.*all.*pack/i, /^run.*all.*assurance/i, /^test.*all/i],
    command: "assurance run --all",
    description: "Running all assurance packs",
  },
  {
    patterns: [/^tests?$/i, /^run\s+tests?$/i, /^verify$/i, /^assurance$/i, /^run\s+packs?$/i, /^check.*behav/i],
    command: "assurance list",
    description: "Listing assurance packs",
  },

  // Evidence
  {
    patterns: [/^collect.*evidence/i, /^gather.*evidence/i, /^evidence.*collect/i],
    command: "evidence collect",
    description: "Collecting execution evidence",
  },
  {
    patterns: [/^evidence/i, /^proof/i, /^show.*evidence/i],
    command: "evidence gaps",
    description: "Showing evidence gaps",
  },

  // Domains / compliance
  {
    patterns: [/^(?:am i |is.*agent )?(hipaa|health)/i],
    command: "domain assess --domain health",
    description: "Assessing health domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent )?(gdpr|privacy|education)/i],
    command: "domain assess --domain education",
    description: "Assessing education domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent )?(environment|green|climate)/i],
    command: "domain assess --domain environment",
    description: "Assessing environment domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent )?(mobility|transport)/i],
    command: "domain assess --domain mobility",
    description: "Assessing mobility domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent )?(governance|gov|public)/i],
    command: "domain assess --domain governance",
    description: "Assessing governance domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent )?(tech|technology|ai)/i],
    command: "domain assess --domain technology",
    description: "Assessing technology domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent )?(wealth|finance|fintech)/i],
    command: "domain assess --domain wealth",
    description: "Assessing wealth domain compliance",
  },
  {
    patterns: [/^domain/i, /^compliance/i, /^regulat/i],
    command: "domain list",
    description: "Listing available domains",
  },

  // Guardrails
  {
    patterns: [/^guardrail/i, /^guard/i, /^protection/i, /^safety/i],
    command: "guardrails list",
    description: "Listing guardrails",
  },
  {
    patterns: [/^enable.*guard/i, /^turn on.*guard/i],
    command: "guardrails list",
    description: "Listing guardrails (use 'guardrails enable <id>' to toggle)",
  },

  // Explain
  {
    patterns: [/^explain\s+(AMC-[\w.]+)/i, /^what.*is\s+(AMC-[\w.]+)/i, /^tell.*about\s+(AMC-[\w.]+)/i],
    command: "explain $1",
    description: "Explaining question",
  },

  // Reports & history
  {
    patterns: [/^report/i, /^summary/i, /^generate.*report/i],
    command: "report md",
    description: "Generating markdown report",
  },
  {
    patterns: [/^history/i, /^past.*scores/i, /^prev/i, /^trend/i],
    command: "history",
    description: "Showing score history",
  },
  {
    patterns: [/^compare/i, /^diff/i, /^what.*changed/i],
    command: "compare",
    description: "Comparing runs",
  },

  // System
  {
    patterns: [/^doctor/i, /^health.*check/i, /^diagnos/i, /^status/i],
    command: "doctor",
    description: "Running system diagnostics",
  },
  {
    patterns: [/^dashboard/i, /^open.*dash/i, /^ui/i, /^web/i],
    command: "dashboard open",
    description: "Opening dashboard",
  },
  {
    patterns: [/^setup/i, /^config/i, /^configure/i],
    command: "setup",
    description: "Running setup wizard",
  },
  {
    patterns: [/^(?:who|what).*(?:am i|agent)/i, /^info/i, /^about/i],
    command: "status",
    description: "Showing agent info",
  },
];

/**
 * Parse user input into an AMC command.
 * Tries natural language first, then falls back to treating it as a raw command.
 */
export function parseInput(raw: string): ParsedCommand {
  const input = raw.trim();
  if (!input) return { command: "", natural: false, description: "" };

  // Strip leading "amc " if present
  const cleaned = input.replace(/^amc\s+/i, "");

  // Try natural language patterns
  for (const mapping of NATURAL_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        // Handle capture groups (e.g., explain $1)
        let cmd = mapping.command;
        if (match[1] && cmd.includes("$1")) {
          cmd = cmd.replace("$1", match[1]);
        }
        return { command: cmd, natural: true, description: mapping.description };
      }
    }
  }

  // Fall through: treat as raw AMC command
  return { command: cleaned, natural: false, description: `Running: amc ${cleaned}` };
}

/**
 * Get contextual suggestions based on current state.
 */
export function getSuggestions(score: number | null, gaps: number | null, packsRun: number): string[] {
  const suggestions: string[] = [];

  if (score === null) {
    suggestions.push("score my agent");
  } else if (gaps !== null && gaps > 0) {
    suggestions.push("what are my gaps?", "improve", "collect evidence");
  } else {
    suggestions.push("run tests", "check compliance", "generate report");
  }

  if (packsRun === 0) {
    suggestions.push("run all packs");
  }

  suggestions.push("help");
  return suggestions.slice(0, 4);
}

/**
 * Get all available completions for tab-complete.
 */
export function getCompletions(): string[] {
  return [
    "quickscore", "score my agent", "improve", "guide", "guide --apply",
    "assurance list", "assurance run", "evidence gaps", "evidence collect",
    "domain assess", "domain list", "domain apply",
    "guardrails list", "guardrails enable", "guardrails disable",
    "explain", "report md", "history", "compare", "doctor",
    "dashboard open", "setup", "status",
    "help", "exit", "quit", "clear",
  ];
}
