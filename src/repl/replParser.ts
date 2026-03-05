/**
 * Natural language → AMC command resolver.
 * Pure keyword matching — no LLM, instant, offline.
 * 60+ natural language patterns across scoring, compliance, improvement, and ops.
 */

export interface ParsedCommand {
  /** The resolved AMC command (without 'amc' prefix), or workflow ID */
  command: string;
  /** Whether this was a natural language match (vs exact command) */
  natural: boolean;
  /** Human-readable description of what will happen */
  description: string;
  /** If true, this is a multi-step workflow, not a single command */
  workflow?: boolean;
  /** For workflows: ordered list of commands to execute */
  steps?: string[];
  /** Built-in response (no command execution needed) */
  builtinResponse?: string;
}

interface NaturalMapping {
  patterns: RegExp[];
  command: string;
  description: string;
  workflow?: boolean;
  steps?: string[];
}

const NATURAL_MAPPINGS: NaturalMapping[] = [
  // ════════════════════════════════════════════════════
  // SCORING & ASSESSMENT
  // ════════════════════════════════════════════════════
  {
    patterns: [/^score/i, /^how am i doing/i, /^rate\b/i, /^assess me/i, /^check.*score/i, /^run.*score/i, /^quickscore/i, /^qs$/i, /^how.*(?:mature|trust|ready)/i, /^what.*my score/i, /^get.*score/i],
    command: "quickscore",
    description: "Running quickscore assessment",
  },
  {
    patterns: [/^formal/i, /^full.*score/i, /^deep.*score/i, /^formal.*spec/i, /^crypto.*score/i],
    command: "score formal-spec default",
    description: "Running full cryptographic formal-spec scoring",
  },

  // ════════════════════════════════════════════════════
  // GAPS, PROBLEMS & DIAGNOSIS
  // ════════════════════════════════════════════════════
  {
    patterns: [/^what.*(?:gap|wrong|weak|miss|problem|issue|fail)/i, /^show.*gap/i, /^find.*gap/i, /^gap$/i, /^gaps$/i, /^where.*(?:fail|weak|gap)/i],
    command: "mechanic gap",
    description: "Analyzing gaps and weaknesses",
  },
  {
    patterns: [/^biggest.*gap/i, /^worst/i, /^weakest/i, /^mechanic/i, /^top.*gap/i, /^priority.*gap/i, /^critical.*gap/i],
    command: "mechanic gap",
    description: "Finding weakest dimensions",
  },
  {
    patterns: [/^why.*(?:low|score|fail|bad)/i, /^reason/i, /^root.*cause/i, /^diagnos/i],
    command: "mechanic gap",
    description: "Diagnosing low scores",
  },

  // ════════════════════════════════════════════════════
  // IMPROVEMENT & GUIDES
  // ════════════════════════════════════════════════════
  {
    patterns: [/^improve$/i, /^guide$/i, /^how.*(?:improve|fix|better|raise|increase)/i, /^make.*better/i, /^next.*step/i, /^what.*(?:should i|can i|to) do/i, /^recommend/i, /^advice/i, /^suggest/i],
    command: "guide",
    description: "Generating improvement guide",
  },
  {
    patterns: [/^apply.*(?:guide|fix|improve|change)/i, /^auto.*fix/i, /^apply$/i],
    command: "guide --apply",
    description: "Applying improvement guide to agent config",
  },
  {
    patterns: [/^fix\s+(\w+)/i, /^improve\s+(\w+)/i],
    command: "guide --apply",
    description: "Improving specific area",
  },

  // ════════════════════════════════════════════════════
  // ASSURANCE & TESTING (specific patterns before general)
  // ════════════════════════════════════════════════════
  {
    patterns: [/^run.*all.*(?:pack|assurance|test)/i, /^test.*all/i, /^assurance.*run.*all/i, /^full.*test/i],
    command: "assurance run --all",
    description: "Running all assurance packs",
  },
  {
    patterns: [/^run\s+(\w+)\s+pack/i],
    command: "assurance run $1",
    description: "Running assurance pack",
  },
  {
    patterns: [/^(?:run|check)\s+sycoph/i],
    command: "assurance run sycophancy",
    description: "Running sycophancy pack",
  },
  {
    patterns: [/^(?:run|check)\s+halluc/i],
    command: "assurance run hallucination",
    description: "Running hallucination pack",
  },
  {
    patterns: [/^(?:run|check)\s+toxic/i],
    command: "assurance run toxicity",
    description: "Running toxicity pack",
  },
  {
    patterns: [/^(?:run|check)\s+priv/i],
    command: "assurance run privacy",
    description: "Running privacy pack",
  },
  {
    patterns: [/^(?:run|check)\s+secur/i],
    command: "assurance run security",
    description: "Running security pack",
  },
  {
    patterns: [/^(?:run|check)\s+over.?compl/i],
    command: "assurance run overCompliance",
    description: "Running over-compliance pack",
  },
  {
    patterns: [/^tests?$/i, /^run\s+tests?$/i, /^verify$/i, /^assurance$/i, /^run\s+packs?$/i, /^check.*behav/i, /^list.*pack/i, /^pack/i, /^what.*pack/i],
    command: "assurance list",
    description: "Listing assurance packs",
  },

  // ════════════════════════════════════════════════════
  // EVIDENCE
  // ════════════════════════════════════════════════════
  {
    patterns: [/^collect.*evidence/i, /^gather.*evidence/i, /^evidence.*collect/i, /^get.*proof/i, /^capture.*evidence/i],
    command: "evidence collect",
    description: "Collecting execution evidence",
  },
  {
    patterns: [/^ingest/i, /^evidence.*ingest/i, /^import.*evidence/i, /^upload.*evidence/i],
    command: "evidence ingest",
    description: "Ingesting evidence file",
  },
  {
    patterns: [/^evidence$/i, /^proof$/i, /^show.*evidence/i, /^evidence.*(?:gap|list|status)/i],
    command: "mechanic gap",
    description: "Showing evidence gaps",
  },

  // ════════════════════════════════════════════════════
  // DOMAINS & COMPLIANCE (specific before general)
  // ════════════════════════════════════════════════════
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:hipaa|health|medical|clinical|patient)/i],
    command: "domain assess --domain health",
    description: "Assessing health domain compliance (HIPAA, FDA, EU MDR)",
  },
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:gdpr|education|school|university|k-?12|ferpa)/i],
    command: "domain assess --domain education",
    description: "Assessing education domain compliance (GDPR, FERPA)",
  },
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:environment|green|climate|sustain|carbon|esg)/i],
    command: "domain assess --domain environment",
    description: "Assessing environment domain compliance (ESG, ISO 14001)",
  },
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:mobility|transport|auto|vehicle|fleet)/i],
    command: "domain assess --domain mobility",
    description: "Assessing mobility domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:governance|gov|public|citizen|democracy)/i],
    command: "domain assess --domain governance",
    description: "Assessing governance domain compliance",
  },
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:tech|technology|artificial|ml\b|machine.?learn)/i, /\bai\s+act\b/i, /\beu\s+ai\b/i],
    command: "domain assess --domain technology",
    description: "Assessing technology domain compliance (EU AI Act)",
  },
  {
    patterns: [/^(?:am i |is.*agent |check\s+)?(?:wealth|financ|fintech|bank|payment|trading|crypto)/i],
    command: "domain assess --domain wealth",
    description: "Assessing wealth domain compliance (SOX, PCI-DSS)",
  },
  {
    patterns: [/^apply.*domain\s+(\w+)/i, /^domain.*apply.*(\w+)/i],
    command: "domain apply --domain $1",
    description: "Applying domain guardrails",
  },
  {
    patterns: [/^domain$/i, /^domains$/i, /^compliance$/i, /^regulat/i, /^what.*domain/i, /^list.*domain/i, /^which.*domain/i],
    command: "domain list",
    description: "Listing available domains (health, education, environment, mobility, governance, technology, wealth)",
  },

  // ════════════════════════════════════════════════════
  // GUARDRAILS
  // ════════════════════════════════════════════════════
  {
    patterns: [/^enable\s+(.+)/i, /^turn on\s+(.+)/i, /^activate\s+(.+)/i],
    command: "guardrails enable $1",
    description: "Enabling guardrail",
  },
  {
    patterns: [/^disable\s+(.+)/i, /^turn off\s+(.+)/i, /^deactivate\s+(.+)/i],
    command: "guardrails disable $1",
    description: "Disabling guardrail",
  },
  {
    patterns: [/^guardrail/i, /^guard$/i, /^protection/i, /^safety$/i, /^what.*guardrail/i, /^list.*guard/i, /^show.*guard/i],
    command: "guardrails list",
    description: "Listing guardrails",
  },

  // ════════════════════════════════════════════════════
  // EXPLAIN (with capture groups)
  // ════════════════════════════════════════════════════
  {
    patterns: [/^explain\s+(AMC-[\w.]+)/i, /^what.*(?:is|does|mean)\s+(AMC-[\w.]+)/i, /^tell.*about\s+(AMC-[\w.]+)/i, /^(AMC-[\w.]+)\??$/i],
    command: "explain $1",
    description: "Explaining question",
  },
  {
    patterns: [/^explain\s+(\w[\w-]*)/i],
    command: "explain $1",
    description: "Explaining concept",
  },

  // ════════════════════════════════════════════════════
  // REPORTS, HISTORY & COMPARISON
  // ════════════════════════════════════════════════════
  {
    patterns: [/^report$/i, /^summary$/i, /^generate.*report/i, /^export.*report/i, /^markdown.*report/i],
    command: "report --executive latest",
    description: "Generating executive report",
  },
  {
    patterns: [/^sarif$/i, /^export.*sarif/i],
    command: "export sarif",
    description: "Exporting SARIF report",
  },
  {
    patterns: [/^history$/i, /^past.*score/i, /^prev/i, /^trend$/i, /^score.*history/i, /^how.*progress/i, /^show.*trend/i],
    command: "history",
    description: "Showing score history",
  },
  {
    patterns: [/^compare$/i, /^diff$/i, /^what.*changed/i, /^delta$/i, /^before.*after/i],
    command: "history",
    description: "Showing run history (use 'amc compare <runA> <runB>' with specific IDs)",
  },

  // ════════════════════════════════════════════════════
  // SYSTEM & OPS
  // ════════════════════════════════════════════════════
  {
    patterns: [/^doctor$/i, /^health.*check$/i, /^diagnos$/i, /^check.*(?:system|env|health)/i, /^is.*(?:everything|all).*ok/i],
    command: "doctor",
    description: "Running system diagnostics",
  },
  {
    patterns: [/^status$/i, /^(?:who|what).*(?:am i|agent)/i, /^info$/i, /^about$/i, /^show.*(?:status|info)/i, /^current.*state/i],
    command: "status",
    description: "Showing agent status",
  },
  {
    patterns: [/^dashboard$/i, /^open.*dash/i, /^ui$/i, /^web$/i, /^open.*ui/i, /^browser$/i, /^gui$/i],
    command: "dashboard open",
    description: "Opening dashboard in browser",
  },
  {
    patterns: [/^setup$/i, /^config$/i, /^configure$/i, /^settings$/i],
    command: "setup",
    description: "Running setup wizard",
  },
  {
    patterns: [/^init$/i, /^initialize$/i, /^start.*new/i, /^create.*workspace/i],
    command: "init",
    description: "Initializing AMC workspace",
  },
  {
    patterns: [/^up$/i, /^start.*studio/i, /^launch.*studio/i, /^studio.*start/i, /^start.*server/i],
    command: "up",
    description: "Starting Studio server",
  },
  {
    patterns: [/^down$/i, /^stop.*studio/i, /^kill.*studio/i, /^studio.*stop/i, /^stop.*server/i],
    command: "down",
    description: "Stopping Studio server",
  },
  {
    patterns: [/^logs$/i, /^show.*log/i, /^tail.*log/i],
    command: "logs",
    description: "Showing logs",
  },
  {
    patterns: [/^adapters$/i, /^what.*adapt/i, /^list.*adapt/i, /^framework/i, /^integrat/i],
    command: "adapters list",
    description: "Listing framework adapters (LangChain, CrewAI, AutoGen, etc.)",
  },
  {
    patterns: [/^tools$/i, /^mcp$/i, /^what.*tool/i, /^list.*tool/i],
    command: "mcp list-tools",
    description: "Listing MCP tools",
  },
  {
    patterns: [/^target$/i, /^target.*profile/i, /^what.*target/i, /^show.*target/i],
    command: "target show",
    description: "Showing target profile",
  },
  {
    patterns: [/^glossary$/i, /^what.*(?:mean|definition)/i],
    command: "glossary --help",
    description: "Opening glossary (use 'glossary lookup <term>' to search)",
  },
  {
    patterns: [/^define\s+(.+)/i, /^glossary\s+lookup\s+(.+)/i, /^look\s*up\s+(.+)/i],
    command: "glossary lookup $1",
    description: "Looking up term",
  },
  {
    patterns: [/^version$/i, /^what.*version/i, /^v$/i],
    command: "--version",
    description: "Showing AMC version",
  },

  // ════════════════════════════════════════════════════
  // MULTI-STEP WORKFLOWS
  // ════════════════════════════════════════════════════
  {
    patterns: [/^onboard/i, /^getting.*start/i, /^get.*start/i, /^new.*here/i, /^first.*time/i, /^begin$/i, /^tutorial$/i],
    command: "workflow:onboard",
    description: "Starting onboarding workflow",
    workflow: true,
    steps: ["doctor", "quickscore", "mechanic gap", "guide"],
  },
  {
    patterns: [/^full.*audit/i, /^complete.*audit/i, /^audit$/i, /^thorough/i, /^comprehensive/i],
    command: "workflow:audit",
    description: "Running full trust audit",
    workflow: true,
    steps: ["quickscore", "mechanic gap", "assurance run --all", "mechanic gap", "report --executive latest"],
  },
  {
    patterns: [/^prepare.*prod/i, /^production.*ready/i, /^ship.*ready/i, /^deploy.*ready/i, /^go.*live/i, /^release.*check/i],
    command: "workflow:production",
    description: "Running production readiness check",
    workflow: true,
    steps: ["quickscore", "assurance run --all", "mechanic gap", "guardrails list", "domain assess --domain technology"],
  },
  {
    patterns: [/^ci.*check/i, /^ci.*gate/i, /^pipeline.*check/i, /^pr.*check/i],
    command: "workflow:ci",
    description: "Running CI gate checks",
    workflow: true,
    steps: ["quickscore --json", "assurance run --all", "guide --ci --target 3"],
  },
  {
    patterns: [/^security.*audit/i, /^security.*review/i, /^sec.*check/i, /^pentest/i, /^threat/i],
    command: "workflow:security",
    description: "Running security-focused audit",
    workflow: true,
    steps: ["assurance run security", "assurance run overCompliance", "guardrails list", "mechanic gap"],
  },
  {
    patterns: [/^quick.*(?:check|look|glance|overview)/i, /^tldr$/i, /^summary.*quick/i],
    command: "workflow:quickcheck",
    description: "Quick status overview",
    workflow: true,
    steps: ["status", "mechanic gap"],
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
        return {
          command: cmd,
          natural: true,
          description: mapping.description,
          workflow: mapping.workflow,
          steps: mapping.steps,
        };
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
    suggestions.push("score my agent", "onboard me", "help");
    return suggestions;
  }

  if (score < 1.5) {
    suggestions.push("what are my gaps?", "improve", "onboard me");
  } else if (gaps !== null && gaps > 0) {
    suggestions.push("what are my gaps?", "improve", "collect evidence");
  } else {
    suggestions.push("run all tests", "check compliance", "generate report");
  }

  if (packsRun === 0) {
    suggestions.push("run all packs");
  }

  if (score >= 3.0) {
    suggestions.push("prepare for production");
  }

  return suggestions.slice(0, 4);
}

/**
 * Get all available completions for tab-complete.
 */
export function getCompletions(): string[] {
  return [
    // Natural language
    "score my agent", "what are my gaps?", "improve", "apply guide",
    "run all tests", "run all packs", "collect evidence",
    "am I HIPAA ready?", "check compliance",
    "explain ", "report", "history", "compare",
    "onboard me", "full audit", "prepare for production", "security audit", "ci check",
    // Exact commands
    "quickscore", "guide", "guide --apply",
    "assurance list", "assurance run", "assurance run --all",
    "assurance run sycophancy", "assurance run hallucination", "assurance run toxicity",
    "mechanic gap", "evidence collect", "evidence verify",
    "domain list", "domain assess", "domain apply",
    "guardrails list", "guardrails enable", "guardrails disable",
    "doctor", "status", "setup", "dashboard", "up", "down", "logs",
    "adapters list", "mcp list-tools", "target show",
    "report --executive latest", "export sarif", "glossary", "version",
    "help", "exit", "quit", "clear",
  ];
}

/**
 * Simple fuzzy matching — checks if all chars of needle appear in order in haystack.
 * Used for tab completion fallback.
 */
export function fuzzyMatch(needle: string, haystack: string): boolean {
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (needle[ni] === haystack[hi]) ni++;
  }
  return ni === needle.length;
}

/**
 * Find closest matches for a typo using Levenshtein distance.
 */
export function findClosest(input: string, candidates: string[], maxDistance = 3): string[] {
  const lower = input.toLowerCase();
  const scored: Array<{ candidate: string; dist: number }> = [];
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const d = levenshtein(lower, cl);
    if (d <= maxDistance) {
      scored.push({ candidate: c, dist: d });
    }
  }
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, 3).map(s => s.candidate);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0]![j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}
