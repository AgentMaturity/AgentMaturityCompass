/**
 * Thermostat Productization — CLI/Studio/Docs (AMC-436)
 *
 * CLI commands and Studio integration points for the steer (thermostat)
 * pipeline. Makes all steer features accessible from `amc steer` subcommands.
 */

// ── CLI command definitions ────────────────────────────────────────────────

export interface SteerCLICommand {
  name: string;
  description: string;
  flags: SteerCLIFlag[];
  examples: string[];
}

export interface SteerCLIFlag {
  name: string;
  alias?: string;
  description: string;
  type: "string" | "number" | "boolean";
  default?: string | number | boolean;
  required?: boolean;
}

export const STEER_CLI_COMMANDS: SteerCLICommand[] = [
  {
    name: "steer enable",
    description:
      "Enable the steer (thermostat) pipeline for an agent. Intercepts LLM calls and applies auto-tuning, hygiene, and micro-scoring.",
    flags: [
      { name: "--agent", alias: "-a", description: "Agent ID", type: "string", required: true },
      { name: "--autotune", description: "Enable auto-tuning", type: "boolean", default: true },
      { name: "--hygiene", description: "Enable hygiene transforms", type: "boolean", default: true },
      { name: "--micro-score", description: "Enable micro-scoring", type: "boolean", default: true },
      { name: "--feedback", description: "Enable feedback loop", type: "boolean", default: true },
    ],
    examples: [
      "amc steer enable --agent my-agent",
      "amc steer enable -a my-agent --hygiene=false",
    ],
  },
  {
    name: "steer disable",
    description: "Disable the steer pipeline for an agent.",
    flags: [
      { name: "--agent", alias: "-a", description: "Agent ID", type: "string", required: true },
    ],
    examples: ["amc steer disable --agent my-agent"],
  },
  {
    name: "steer status",
    description: "Show current steer pipeline status and stage configuration.",
    flags: [
      { name: "--agent", alias: "-a", description: "Agent ID", type: "string", required: true },
      { name: "--json", description: "Output as JSON", type: "boolean", default: false },
    ],
    examples: ["amc steer status --agent my-agent", "amc steer status -a my-agent --json"],
  },
  {
    name: "steer race",
    description: "Fan out a prompt to multiple models and select the best response.",
    flags: [
      { name: "--models", alias: "-m", description: "Comma-separated model IDs", type: "string", required: true },
      { name: "--prompt", alias: "-p", description: "Prompt text", type: "string", required: true },
      { name: "--fastest", description: "Select fastest above threshold instead of best score", type: "number" },
      { name: "--timeout", description: "Timeout per model in ms", type: "number", default: 30000 },
    ],
    examples: [
      'amc steer race --models gpt-4,claude-3 --prompt "Explain recursion"',
    ],
  },
  {
    name: "steer matrix",
    description: "Run parameter matrix stress test across temperature, top_p, etc.",
    flags: [
      { name: "--prompt", alias: "-p", description: "Prompt text", type: "string", required: true },
      { name: "--model", alias: "-m", description: "Model ID", type: "string", required: true },
      { name: "--temperature", description: "Comma-separated temperature values", type: "string", default: "0,0.3,0.7,1.0" },
      { name: "--top-p", description: "Comma-separated top_p values", type: "string", default: "0.9,1.0" },
      { name: "--max", description: "Max combinations to test", type: "number", default: 20 },
    ],
    examples: [
      'amc steer matrix --model gpt-4 --prompt "Explain AI safety" --temperature 0,0.5,1.0',
    ],
  },
  {
    name: "steer micro-score",
    description: "Run micro-score on a text string or file.",
    flags: [
      { name: "--text", alias: "-t", description: "Text to score", type: "string" },
      { name: "--file", alias: "-f", description: "File to score", type: "string" },
      { name: "--json", description: "Output as JSON", type: "boolean", default: false },
    ],
    examples: [
      'amc steer micro-score --text "The answer is 42."',
      "amc steer micro-score --file response.txt --json",
    ],
  },
  {
    name: "steer privacy",
    description: "Configure privacy tier for telemetry.",
    flags: [
      { name: "--tier", description: "Privacy tier: full, redacted, or zero", type: "string", required: true },
      { name: "--salt", description: "Custom hash salt", type: "string" },
    ],
    examples: [
      "amc steer privacy --tier zero",
      "amc steer privacy --tier redacted --salt my-org-salt",
    ],
  },
];

// ── Studio panel definitions ───────────────────────────────────────────────

export interface StudioPanel {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: string;
  features: string[];
}

export const STEER_STUDIO_PANELS: StudioPanel[] = [
  {
    id: "steer-dashboard",
    title: "Thermostat Dashboard",
    description: "Real-time view of steer pipeline activity, micro-scores, and feedback loop convergence.",
    route: "/studio/steer",
    icon: "🌡️",
    features: [
      "Live micro-score graphs",
      "Feedback loop convergence tracker",
      "Context classification distribution",
      "Hygiene transform hit rate",
    ],
  },
  {
    id: "steer-race",
    title: "Model Race",
    description: "Interactive multi-model comparison with side-by-side response quality analysis.",
    route: "/studio/steer/race",
    icon: "🏁",
    features: [
      "Side-by-side response comparison",
      "Per-model micro-score breakdown",
      "Latency waterfall chart",
      "Winner selection history",
    ],
  },
  {
    id: "steer-matrix",
    title: "Parameter Matrix",
    description: "Visual parameter sweep analysis with heatmaps and sensitivity charts.",
    route: "/studio/steer/matrix",
    icon: "📊",
    features: [
      "Parameter sensitivity heatmap",
      "Score distribution by parameter",
      "Best combination highlight",
      "Export to eval harness",
    ],
  },
  {
    id: "steer-privacy",
    title: "Privacy Controls",
    description: "Configure and audit privacy tiers for telemetry data.",
    route: "/studio/steer/privacy",
    icon: "🔒",
    features: [
      "Tier configuration",
      "Compliance validation",
      "Redaction audit log",
      "Data flow visualization",
    ],
  },
];

// ── Help text generator ────────────────────────────────────────────────────

export function generateSteerHelp(): string {
  const lines: string[] = [
    "AMC Steer (Thermostat) — Real-time agent output improvement",
    "",
    "USAGE:",
    "  amc steer <command> [flags]",
    "",
    "COMMANDS:",
  ];

  for (const cmd of STEER_CLI_COMMANDS) {
    lines.push(`  ${cmd.name.padEnd(24)} ${cmd.description}`);
  }

  lines.push("", "Use 'amc steer <command> --help' for more information.");
  return lines.join("\n");
}

/**
 * Generate detailed help for a specific steer command.
 */
export function generateCommandHelp(commandName: string): string | null {
  const cmd = STEER_CLI_COMMANDS.find(
    (c) => c.name === commandName || c.name === `steer ${commandName}`,
  );
  if (!cmd) return null;

  const lines: string[] = [
    `${cmd.name} — ${cmd.description}`,
    "",
    "FLAGS:",
  ];

  for (const flag of cmd.flags) {
    const alias = flag.alias ? `, ${flag.alias}` : "";
    const required = flag.required ? " (required)" : "";
    const defaultVal =
      flag.default !== undefined ? ` [default: ${flag.default}]` : "";
    lines.push(
      `  ${(flag.name + alias).padEnd(24)} ${flag.description}${required}${defaultVal}`,
    );
  }

  if (cmd.examples.length > 0) {
    lines.push("", "EXAMPLES:");
    for (const ex of cmd.examples) {
      lines.push(`  $ ${ex}`);
    }
  }

  return lines.join("\n");
}

export interface ParsedSteerCommand {
  command: string;
  flags: Record<string, string | number | boolean>;
}

export interface SteerCommandResult {
  ok: boolean;
  output: string;
}

export interface SteerAgentRuntimeConfig {
  enabled: boolean;
  autotune: boolean;
  hygiene: boolean;
  microScore: boolean;
  feedback: boolean;
}

export interface SteerRuntimeHandlers {
  race: (args: Record<string, string | number | boolean>) => Promise<unknown>;
  matrix: (args: Record<string, string | number | boolean>) => Promise<unknown>;
}

export interface SteerRuntime {
  handlers: SteerRuntimeHandlers;
  getAgentConfig(agent: string): SteerAgentRuntimeConfig | undefined;
  setAgentConfig(agent: string, config: SteerAgentRuntimeConfig): void;
  getPrivacyConfig(): { tier: string; salt?: string };
  setPrivacyConfig(config: { tier: string; salt?: string }): void;
}

function tokenizeCommand(input: string): string[] {
  const tokens = input.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function normalizeFlagValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

export function parseSteerCommandArgs(input: string): ParsedSteerCommand {
  const tokens = tokenizeCommand(input);
  const command = tokens.slice(0, Math.min(2, tokens.length)).join(" ");
  const flags: Record<string, string | number | boolean> = {};

  for (let i = 2; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (!token.startsWith("-")) {
      continue;
    }

    const normalized = token.replace(/^-+/, "");
    if (normalized.includes("=")) {
      const [key, value] = normalized.split(/=(.*)/s, 2);
      if (key) flags[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = normalizeFlagValue(value ?? "");
      continue;
    }

    const next = tokens[i + 1];
    const camelKey = normalized.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    if (!next || next.startsWith("-")) {
      flags[camelKey] = true;
      continue;
    }

    flags[camelKey] = normalizeFlagValue(next);
    i += 1;
  }

  return { command, flags };
}

export function createSteerRuntime(
  overrides: Partial<SteerRuntimeHandlers> = {},
): SteerRuntime {
  const agents = new Map<string, SteerAgentRuntimeConfig>();
  let privacy: { tier: string; salt?: string } = { tier: "full" };

  const handlers: SteerRuntimeHandlers = {
    race: overrides.race ?? (async (args) => ({ ok: true, ...args })),
    matrix: overrides.matrix ?? (async (args) => ({ ok: true, ...args })),
  };

  return {
    handlers,
    getAgentConfig(agent: string) {
      return agents.get(agent);
    },
    setAgentConfig(agent: string, config: SteerAgentRuntimeConfig) {
      agents.set(agent, config);
    },
    getPrivacyConfig() {
      return privacy;
    },
    setPrivacyConfig(config: { tier: string; salt?: string }) {
      privacy = config;
    },
  };
}

export async function executeSteerCommand(
  runtime: SteerRuntime,
  input: string,
): Promise<SteerCommandResult> {
  const parsed = parseSteerCommandArgs(input);
  const { command, flags } = parsed;

  if (command === "steer enable") {
    const agent = String(flags.agent ?? "");
    runtime.setAgentConfig(agent, {
      enabled: true,
      autotune: Boolean(flags.autotune ?? true),
      hygiene: Boolean(flags.hygiene ?? true),
      microScore: Boolean(flags.microScore ?? true),
      feedback: Boolean(flags.feedback ?? true),
    });
    return { ok: true, output: `Enabled steer for ${agent}` };
  }

  if (command === "steer disable") {
    const agent = String(flags.agent ?? "");
    const prev = runtime.getAgentConfig(agent) ?? {
      enabled: false,
      autotune: true,
      hygiene: true,
      microScore: true,
      feedback: true,
    };
    runtime.setAgentConfig(agent, { ...prev, enabled: false });
    return { ok: true, output: `Disabled steer for ${agent}` };
  }

  if (command === "steer status") {
    const agent = String(flags.agent ?? "");
    const config = runtime.getAgentConfig(agent);
    const payload = {
      agent,
      ...(config ?? null),
    };
    return {
      ok: true,
      output: flags.json ? JSON.stringify(payload) : `${agent}: ${JSON.stringify(payload)}`,
    };
  }

  if (command === "steer micro-score") {
    const { microScore } = await import("./microScore.js");
    const text = String(flags.text ?? "");
    const score = microScore(text);
    return {
      ok: true,
      output: flags.json ? JSON.stringify(score) : `composite=${score.composite}`,
    };
  }

  if (command === "steer race") {
    const result = await runtime.handlers.race(flags);
    return { ok: true, output: JSON.stringify(result) };
  }

  if (command === "steer matrix") {
    const result = await runtime.handlers.matrix(flags);
    return { ok: true, output: JSON.stringify(result) };
  }

  if (command === "steer privacy") {
    const tier = String(flags.tier ?? "full");
    const salt = typeof flags.salt === "string" ? flags.salt : undefined;
    runtime.setPrivacyConfig({ tier, salt });
    return { ok: true, output: `Privacy tier set to ${tier}` };
  }

  return {
    ok: false,
    output: `Unknown steer command: ${command}`,
  };
}
