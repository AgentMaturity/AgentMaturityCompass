import type { Command } from "commander";

export function flattenCommandPaths(program: Command): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const walk = (cmd: Command, prefix: string[]): void => {
    for (const child of cmd.commands) {
      const next = [...prefix, child.name()];
      const full = next.join(" ");
      if (!seen.has(full)) {
        seen.add(full);
        out.push(full);
      }
      walk(child, next);
    }
  };

  walk(program, []);
  return out;
}

function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) {
    dp[0]![j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }

  return dp[a.length]![b.length]!;
}

export function suggestCommandPaths(input: string, commandPaths: string[], limit = 6): string[] {
  const query = input.trim().toLowerCase();
  if (!query) {
    return [];
  }

  const ranked = commandPaths
    .map((path) => {
      const normalized = path.toLowerCase();
      const tokens = normalized.split(/\s+/).filter(Boolean);
      const tokenDistance = tokens.length > 0
        ? Math.min(...tokens.map((token) => editDistance(query, token)))
        : editDistance(query, normalized);
      const fullDistance = editDistance(query, normalized);
      const prefixMatch = tokens.some((token) => token.startsWith(query));
      const score = prefixMatch ? 0 : Math.min(tokenDistance, fullDistance);
      return { path, score, prefixMatch };
    })
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      if (a.prefixMatch !== b.prefixMatch) {
        return a.prefixMatch ? -1 : 1;
      }
      if (a.path.length !== b.path.length) {
        return a.path.length - b.path.length;
      }
      return a.path.localeCompare(b.path);
    });

  const threshold = Math.max(2, Math.floor(query.length * 0.65));
  return ranked
    .filter((entry) => entry.prefixMatch || entry.score <= threshold)
    .slice(0, limit)
    .map((entry) => entry.path);
}

export function parseUnknownCommandToken(message: string): string | null {
  const match = message.match(/unknown command ['\"]([^'\"]+)['\"]/i);
  return match?.[1] ?? null;
}

export interface CliCommandHighlight {
  path: string;
  description: string;
}

export interface CliCommandGroup {
  id: "evidence" | "score" | "incidents" | "audit" | "admin" | "lifecycle" | "eval";
  summary: string;
  highlights: CliCommandHighlight[];
}

export interface CliAliasEntry {
  aliasPath: string;
  targetPath: string;
  description: string;
}

export const CLI_GROUPS: CliCommandGroup[] = [
  {
    id: "evidence",
    summary: "Evidence integrity, transparency, and bundle export",
    highlights: [
      { path: "evidence verify", description: "Run the workspace verification suite" },
      { path: "verify all", description: "Full trust/policy/plugin verification" },
      { path: "bundle export", description: "Export signed evidence bundle" },
      { path: "transparency verify-bundle", description: "Verify transparency export bundle" }
    ]
  },
  {
    id: "score",
    summary: "Maturity scoring and diagnostic execution",
    highlights: [
      { path: "diagnostic run", description: "Run maturity diagnostic" },
      { path: "diagnostic compare", description: "Compare two diagnostic runs" },
      { path: "score tier", description: "Interactive quick/standard/deep scorecard" },
      { path: "score production-ready", description: "Production readiness gate check" }
    ]
  },
  {
    id: "incidents",
    summary: "Incident workflows, alerts, and regression detection",
    highlights: [
      { path: "incident list", description: "List incidents by agent" },
      { path: "incident create", description: "Open a manual incident" },
      { path: "incidents alert", description: "Dispatch INCIDENT_CREATED event" },
      { path: "drift check", description: "Detect drift that can trigger incidents" }
    ]
  },
  {
    id: "audit",
    summary: "Audit binder, evidence requests, and control maps",
    highlights: [
      { path: "audit binder create", description: "Build an audit binder artifact" },
      { path: "audit request list", description: "List open evidence requests" },
      { path: "audit map verify", description: "Verify active compliance maps" },
      { path: "audit verify", description: "Verify audit policy signatures" }
    ]
  },
  {
    id: "admin",
    summary: "Operational health, identity, vault, and trust controls",
    highlights: [
      { path: "setup", description: "Guided first-time environment setup" },
      { path: "doctor", description: "System health + misconfiguration checks" },
      { path: "admin status", description: "Control plane status and signatures" },
      { path: "vault status", description: "Vault lock/unlock state" }
    ]
  },
  {
    id: "lifecycle",
    summary: "Workspace bootstrapping, bring-up, and routine verification",
    highlights: [
      { path: "lifecycle init", description: "Initialize .amc workspace" },
      { path: "lifecycle up", description: "Start control plane services" },
      { path: "lifecycle doctor", description: "Run health checks before deploy" },
      { path: "lifecycle verify", description: "Run full verification pass" }
    ]
  },
  {
    id: "eval",
    summary: "Evaluation shortcuts for runs, comparisons, and what-if",
    highlights: [
      { path: "eval run", description: "Alias for diagnostic run" },
      { path: "eval compare", description: "Alias for diagnostic compare" },
      { path: "whatif equalizer", description: "Run equalizer what-if simulation" },
      { path: "e2e smoke", description: "Run deterministic smoke verification" }
    ]
  }
];

export const CLI_ALIASES: CliAliasEntry[] = [
  {
    aliasPath: "score",
    targetPath: "diagnostic run",
    description: "Default scoring shortcut"
  },
  {
    aliasPath: "eval run",
    targetPath: "diagnostic run",
    description: "Evaluation namespace shortcut"
  },
  {
    aliasPath: "eval compare",
    targetPath: "diagnostic compare",
    description: "Evaluation namespace shortcut"
  },
  {
    aliasPath: "lifecycle verify",
    targetPath: "verify all",
    description: "Lifecycle verification shortcut"
  }
];

function formatHelpRow(path: string, description: string): string {
  const left = `amc ${path}`;
  const width = 33;
  return `  ${left.padEnd(width)}${description}`;
}

function commandPathSet(program: Command): Set<string> {
  return new Set(flattenCommandPaths(program));
}

export function renderGroupedHelp(program: Command): string {
  const existing = commandPathSet(program);
  const lines: string[] = [];
  lines.push("Agent Maturity Compass");
  lines.push("");
  lines.push("Usage: amc <command> [options]");
  lines.push("");
  lines.push("Primary command groups:");
  for (const group of CLI_GROUPS) {
    lines.push(`  ${group.id.padEnd(10)}${group.summary}`);
  }
  lines.push("");
  lines.push("High-signal commands:");
  for (const group of CLI_GROUPS) {
    lines.push(`  ${group.id}`);
    for (const highlight of group.highlights) {
      if (existing.has(highlight.path)) {
        lines.push(formatHelpRow(highlight.path, highlight.description));
      }
    }
  }
  lines.push("");
  lines.push("Aliases:");
  for (const alias of CLI_ALIASES) {
    if (existing.has(alias.aliasPath) && existing.has(alias.targetPath)) {
      lines.push(formatHelpRow(`${alias.aliasPath} -> ${alias.targetPath}`, alias.description));
    }
  }
  lines.push("");
  lines.push("Global options:");
  lines.push("  --agent <agentId>                  Agent ID override");
  lines.push("  -h, --help                         Show command help");
  lines.push("  -V, --version                      Show CLI version");
  lines.push("");
  lines.push("Discoverability:");
  lines.push("  amc help <command>                 Detailed help for any command path");
  lines.push("  amc completion bash|zsh|fish       Generate shell completion scripts");
  return lines.join("\n");
}

export type CompletionShell = "bash" | "zsh" | "fish";

export const completionShells: CompletionShell[] = ["bash", "zsh", "fish"];

function completionTree(commandPaths: string[]): {
  topLevel: string[];
  childrenByParent: Map<string, string[]>;
} {
  const topLevel = new Set<string>();
  const childrenByParent = new Map<string, Set<string>>();
  for (const path of commandPaths) {
    const parts = path.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    topLevel.add(parts[0]!);
    for (let i = 0; i < parts.length - 1; i++) {
      const parent = parts.slice(0, i + 1).join(" ");
      const child = parts[i + 1]!;
      const set = childrenByParent.get(parent) ?? new Set<string>();
      set.add(child);
      childrenByParent.set(parent, set);
    }
  }
  const collapsed = new Map<string, string[]>();
  for (const [key, values] of childrenByParent.entries()) {
    collapsed.set(key, Array.from(values).sort((a, b) => a.localeCompare(b)));
  }
  return {
    topLevel: Array.from(topLevel).sort((a, b) => a.localeCompare(b)),
    childrenByParent: collapsed
  };
}

function renderBashCompletion(commandPaths: string[]): string {
  const paths = Array.from(new Set(commandPaths)).sort((a, b) => a.localeCompare(b));
  return [
    "_amc_complete() {",
    "  local cur ctx line next",
    "  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    "  ctx=\"\"",
    "  if (( COMP_CWORD > 1 )); then",
    "    ctx=\"${COMP_WORDS[@]:1:COMP_CWORD-1}\"",
    "  fi",
    "  local -a candidates",
    "  while IFS= read -r line; do",
    "    [[ -z \"$line\" ]] && continue",
    "    if [[ -n \"$ctx\" ]]; then",
    "      [[ \"$line\" == \"$ctx\"* ]] || continue",
    "      next=\"${line#\"$ctx\"}\"",
    "      next=\"${next# }\"",
    "    else",
    "      next=\"$line\"",
    "    fi",
    "    next=\"${next%% *}\"",
    "    [[ -n \"$next\" ]] && candidates+=(\"$next\")",
    "  done <<'__AMC_COMMANDS__'",
    ...paths,
    "__AMC_COMMANDS__",
    "  if (( ${#candidates[@]} == 0 )); then",
    "    return 0",
    "  fi",
    "  local unique",
    "  unique=\"$(printf '%s\\n' \"${candidates[@]}\" | sort -u | tr '\\n' ' ')\"",
    "  COMPREPLY=( $(compgen -W \"$unique\" -- \"$cur\") )",
    "}",
    "complete -F _amc_complete amc"
  ].join("\n");
}

function renderZshCompletion(commandPaths: string[]): string {
  const paths = Array.from(new Set(commandPaths)).sort((a, b) => a.localeCompare(b));
  return [
    "#compdef amc",
    "",
    "_amc_complete() {",
    "  local -a candidates",
    "  local context line next",
    "  context=\"\"",
    "  if (( CURRENT > 2 )); then",
    "    context=\"${(j: :)words[2,CURRENT-1]}\"",
    "  fi",
    "  while IFS= read -r line; do",
    "    [[ -z \"$line\" ]] && continue",
    "    if [[ -n \"$context\" ]]; then",
    "      [[ \"$line\" == ${context}* ]] || continue",
    "      next=\"${line#$context}\"",
    "      next=\"${next# }\"",
    "    else",
    "      next=\"$line\"",
    "    fi",
    "    next=\"${next%% *}\"",
    "    [[ -n \"$next\" ]] && candidates+=(\"$next\")",
    "  done <<'__AMC_COMMANDS__'",
    ...paths,
    "__AMC_COMMANDS__",
    "  candidates=(${(u)candidates})",
    "  compadd -- $candidates",
    "}",
    "",
    "compdef _amc_complete amc"
  ].join("\n");
}

function renderFishCompletion(commandPaths: string[]): string {
  const tree = completionTree(commandPaths);
  const lines: string[] = [];
  lines.push(`complete -c amc -f -a "${tree.topLevel.join(" ")}"`);
  for (const [parent, children] of tree.childrenByParent.entries()) {
    lines.push(`complete -c amc -f -n "__fish_seen_subcommand_from ${parent}" -a "${children.join(" ")}"`);
  }
  return lines.join("\n");
}

export function generateCompletionScript(shell: CompletionShell, commandPaths: string[]): string {
  if (shell === "bash") {
    return renderBashCompletion(commandPaths);
  }
  if (shell === "zsh") {
    return renderZshCompletion(commandPaths);
  }
  return renderFishCompletion(commandPaths);
}

export function cliDiscoverabilityFooter(): string {
  return [
    "",
    "Discoverability:",
    "  • Use 'amc help <command>' for detailed subcommand docs",
    "  • Use '--help' after any command path (for example: 'amc run --help')",
    "  • Use 'amc completion bash|zsh|fish' to install shell completions",
    "  • Namespace shortcuts:",
    "      - evidence  → verify, bundle, transparency, receipts",
    "      - score     → score, diagnostic, compare",
    "      - incidents → assurance, drift, integrations dispatch",
    "      - audit     → audit binder, policy, scheduler",
    "      - admin     → user, identity, vault, trust, ops",
    "      - lifecycle → init, up, doctor, verify",
    "      - eval      → run, compare, whatif",
    "  • Start with common entry points: setup, up, score, verify, adapters run",
  ].join("\n");
}
