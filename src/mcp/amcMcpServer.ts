/**
 * AMC MCP Server
 *
 * Exposes AMC trust scoring, guide, compliance, and transparency capabilities
 * to any MCP-compatible AI coding assistant via the Model Context Protocol.
 *
 * Supported clients: Claude Code, Cursor, GitHub Copilot, Windsurf, Kiro,
 * VS Code (MCP extension), Codex, IntelliJ with Junie.
 *
 * Transport: stdio (default) — runs as a subprocess of the IDE
 *
 * Usage:
 *   amc mcp serve
 *
 * Quick config for Claude Code (.claude/mcp.json):
 *   { "mcpServers": { "amc": { "command": "amc", "args": ["mcp", "serve"] } } }
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgents } from "../fleet/registry.js";
import {
  generateTransparencyReport,
  renderTransparencyReportMarkdown,
  renderTransparencyReportJson,
} from "../transparency/transparencyReport.js";
import { INDUSTRY_PACKS, scoreIndustryPack, type IndustryPackId } from "../domains/industryPacks.js";
import { openLedger } from "../ledger/ledger.js";
import { parseWindowToMs } from "../utils/time.js";
import { resolveAgentId } from "../fleet/paths.js";

// ---------------------------------------------------------------------------
// Simple in-process rate limiter
// ---------------------------------------------------------------------------
class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private timestamps: number[] = [];

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.timestamps = [];
  }
}

const rateLimiter = new RateLimiter(60_000, 60); // 60 requests per minute

/** Reset rate limiter state (for test isolation). */
export function resetRateLimiter(): void {
  rateLimiter.reset();
}

function enforceRateLimit(): void {
  if (!rateLimiter.check()) {
    throw new Error("Rate limit exceeded — max 60 requests per minute. Please slow down.");
  }
}

function getPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}
const PKG_VERSION = getPackageVersion();

function validateWorkspace(workspace: string): string {
  const ws = resolve(workspace);
  const amcDir = join(ws, ".amc");
  if (!existsSync(amcDir)) {
    throw new Error(`Not an AMC workspace: ${ws} (missing .amc directory)`);
  }
  return ws;
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

export const MCP_TOOL_METADATA = [
  { name: "amc_list_agents", description: "List all AMC-registered agents with trust status (read-only)", input: "{ workspace?: string }" },
  { name: "amc_quickscore", description: "Get trust score and maturity level (L1-L5, 0-100) (read-only)", input: "{ agentId: string, workspace?: string }" },
  { name: "amc_get_guide", description: "Get prioritized improvement guide with CLI commands (read-only)", input: "{ agentId: string, workspace?: string }" },
  { name: "amc_check_compliance", description: "Check compliance gaps (EU_AI_ACT, ISO_42001, NIST_AI_RMF, SOC2, ISO_27001) (read-only)", input: "{ agentId: string, frameworks?: string[], workspace?: string }" },
  { name: "amc_transparency_report", description: "Full Agent Transparency Report (read-only)", input: "{ agentId: string, format?: 'md'|'json', workspace?: string }" },
  { name: "amc_score_sector_pack", description: "Score agent against an industry Sector Pack (read-only)", input: "{ packId: string, responses: Record<string, number> }" },
  { name: "amc_score_agent", description: "Score an agent's trust dimensions with detailed breakdown (read-only)", input: "{ agentId: string, window?: string, workspace?: string }" },
  { name: "amc_list_evidence", description: "List evidence events from the ledger for a time window (read-only)", input: "{ window?: string, limit?: number, workspace?: string }" },
  { name: "amc_query_diagnostic", description: "Query the latest diagnostic run report (read-only)", input: "{ agentId: string, workspace?: string }" },
  { name: "amc_get_recommendations", description: "Get actionable recommendations for improving agent maturity (read-only)", input: "{ agentId: string, workspace?: string }" },
];

export async function startMcpServer(workspace?: string): Promise<void> {
  if (workspace) process.chdir(workspace);
  const server = new McpServer({
    name: "amc",
    version: PKG_VERSION,
  });

  // -------------------------------------------------------------------------
  // Tool: amc_list_agents
  // -------------------------------------------------------------------------
  server.tool(
    "amc_list_agents",
    "List all AMC-registered AI agents in the workspace with their current trust status. (read-only)",
    {
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const agents = listAgents(ws);
        if (agents.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No AMC agents registered in this workspace. Run `amc init` to get started.",
              },
            ],
          };
        }
        const rows = agents.map((a) => `- ${a.id}`).join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${agents.length} agent(s):\n${rows}\n\nRun amc_transparency_report for full trust details on any agent.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error listing agents: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_quickscore
  // -------------------------------------------------------------------------
  server.tool(
    "amc_quickscore",
    "Get the current AMC trust score and maturity level for an AI agent. Returns L1-L5 score per dimension and an overall trust score (0-100). (read-only)",
    {
      agentId: z.string().describe("Agent ID to score"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ agentId, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const report = generateTransparencyReport(agentId, ws);
        const dims = report.dimensions
          .map((d) => `  • ${d.name}: ${d.label} (${d.level}/5)`)
          .join("\n");

        const text = [
          `## AMC Trust Score: ${agentId}`,
          ``,
          `**Overall:** ${report.identity.maturityLabel} · Trust Score: ${report.identity.trustScore}/100`,
          `**Certification:** ${report.identity.certificationStatus}`,
          `**Risk Tier:** ${report.identity.riskTier}`,
          `**Last Assessed:** ${report.identity.lastAssessed}`,
          ``,
          `**Dimensions:**`,
          dims || "  (No dimension scores yet — run `amc quickscore` first)",
          ``,
          report.topPriorities.length > 0 && report.topPriorities[0]
            ? `**Top Priority:** ${report.topPriorities[0].action}\n  → \`${report.topPriorities[0].command}\``
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Could not score agent "${agentId}": ${(err as Error).message}\n\nMake sure the agent is registered with \`amc init\` and has at least one run.`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_get_guide
  // -------------------------------------------------------------------------
  server.tool(
    "amc_get_guide",
    "Get a prioritized improvement guide for an AI agent. Returns the top actions to improve trust score with specific CLI commands to run. (read-only)",
    {
      agentId: z.string().describe("Agent ID to guide"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ agentId, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const report = generateTransparencyReport(agentId, ws);
        const priorities = report.topPriorities;

        if (priorities.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Agent "${agentId}" has no immediate improvement priorities — either fully assessed or no run data yet.\n\nRun: amc guide --agent ${agentId}`,
              },
            ],
          };
        }

        const items = priorities
          .map(
            (p, i) =>
              `${i + 1}. **${p.action}**\n   Impact: ${p.impact}\n   Command: \`${p.command}\``
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `## AMC Improvement Guide: ${agentId}\n\nCurrent: ${report.identity.maturityLabel} (${report.identity.trustScore}/100)\n\n${items}\n\nFull guide: \`amc guide --agent ${agentId}\``,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Error generating guide: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_check_compliance
  // -------------------------------------------------------------------------
  server.tool(
    "amc_check_compliance",
    "Check an AI agent for compliance gaps against regulatory frameworks. Supported frameworks: EU_AI_ACT, ISO_42001, NIST_AI_RMF, SOC2, ISO_27001. (read-only)",
    {
      agentId: z.string().describe("Agent ID to check"),
      frameworks: z
        .array(z.string())
        .optional()
        .describe(
          "Compliance frameworks to check (default: all). Options: EU_AI_ACT, ISO_42001, NIST_AI_RMF, SOC2, ISO_27001"
        ),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace"),
    },
    async ({ agentId, frameworks, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      const fwList = frameworks?.length
        ? frameworks.join(", ")
        : "EU_AI_ACT, ISO_42001, NIST_AI_RMF, SOC2, ISO_27001";

      try {
        const report = generateTransparencyReport(agentId, ws);
        const cmd = frameworks?.length
          ? `amc guide --agent ${agentId} --compliance ${frameworks.join(",")}`
          : `amc guide --agent ${agentId} --compliance`;

        return {
          content: [
            {
              type: "text",
              text: [
                `## AMC Compliance Check: ${agentId}`,
                ``,
                `**Frameworks:** ${fwList}`,
                `**Critical Gaps:** ${report.compliance.criticalGaps}`,
                `**High Gaps:** ${report.compliance.highGaps}`,
                ``,
                `For detailed gap analysis with article references:`,
                `\`${cmd}\``,
                ``,
                `Current trust level: ${report.identity.maturityLabel} — compliance gaps are calculated from dimension scores below target level.`,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Compliance check failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_transparency_report
  // -------------------------------------------------------------------------
  server.tool(
    "amc_transparency_report",
    "Generate an Agent Transparency Report — a complete picture of what an AI agent does, what it can access, what decisions it can make autonomously, and its trust evidence. Essential for AI governance, audits, and compliance reviews. (read-only)",
    {
      agentId: z.string().describe("Agent ID to report on"),
      format: z
        .enum(["md", "json", "markdown"])
        .optional()
        .describe("Output format: md/markdown (default) or json"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace"),
    },
    async ({ agentId, format, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const report = generateTransparencyReport(agentId, ws);
        const fmt = format === "json" ? "json" : "markdown";
        const text =
          fmt === "json"
            ? renderTransparencyReportJson(report)
            : renderTransparencyReportMarkdown(report);

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate transparency report: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_score_sector_pack
  // -------------------------------------------------------------------------
  server.tool(
    "amc_score_sector_pack",
    "Score an AI agent against an AMC Sector Pack for a specific industry vertical. Sector Packs provide regulatory-grounded assessment for 40 industry sub-verticals across 7 stations (Environment, Health, Wealth, Education, Mobility, Technology, Governance). Example pack IDs: digital-health-record, clinical-trials, farm-to-fork, dance-of-democracy. (read-only)",
    {
      packId: z
        .string()
        .describe(
          "Sector Pack ID (e.g. digital-health-record, clinical-trials, farm-to-fork, dance-of-democracy)"
        ),
      responses: z
        .record(z.string(), z.number().min(1).max(5))
        .describe(
          "Map of question ID to maturity level (1-5). Get question IDs from the pack definition."
        ),
    },
    async ({ packId, responses }) => {
      enforceRateLimit();
      if (!INDUSTRY_PACKS[packId as IndustryPackId]) {
        const available = Object.keys(INDUSTRY_PACKS).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Unknown sector pack: "${packId}"\n\nAvailable packs (${Object.keys(INDUSTRY_PACKS).length}):\n${available}`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = scoreIndustryPack(packId as IndustryPackId, responses);
        const gapList =
          result.complianceGaps.length > 0
            ? result.complianceGaps.slice(0, 5).map((g) => `  ⚠️ ${g}`).join("\n")
            : "  ✅ No compliance gaps";

        return {
          content: [
            {
              type: "text",
              text: [
                `## AMC Sector Pack Score: ${result.packName}`,
                ``,
                `**Station:** ${result.stationId}`,
                `**Score:** ${result.percentage}%`,
                `**Maturity Level:** L${result.level}`,
                `**Certified:** ${result.certified ? "✅ Yes" : "❌ No (threshold: not met)"}`,
                `**Risk Tier:** ${result.riskTier}`,
                ``,
                `**Compliance Gaps (questions below L3):**`,
                gapList,
                ``,
                result.complianceGaps.length > 5
                  ? `  ...and ${result.complianceGaps.length - 5} more gaps`
                  : "",
              ]
                .filter((l) => l !== "")
                .join("\n"),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Scoring failed: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_score_agent
  // -------------------------------------------------------------------------
  server.tool(
    "amc_score_agent",
    "Score an agent's trust dimensions with detailed breakdown including layer scores, evidence coverage, and integrity index. (read-only)",
    {
      agentId: z.string().describe("Agent ID to score"),
      window: z.string().optional().describe("Time window (e.g. '14d', '30d')"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ agentId, window, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const report = generateTransparencyReport(agentId, ws);
        const dims = report.dimensions
          .map((d) => `  ${d.name}: L${d.level} (${d.label})`)
          .join("\n");

        const text = [
          `## Agent Score: ${agentId}`,
          ``,
          `Trust Score: ${report.identity.trustScore}/100`,
          `Maturity: ${report.identity.maturityLabel}`,
          `Risk Tier: ${report.identity.riskTier}`,
          `Certification: ${report.identity.certificationStatus}`,
          ``,
          `### Dimensions`,
          dims || "  (No dimension data)",
          ``,
          `### Trust Evidence`,
          `Integrity Index: ${report.trustEvidence.integrityIndex}`,
          `Assurance Packs: ${report.trustEvidence.assurancePacksPassed}/${report.trustEvidence.assurancePacksCovered} passed`,
          `Window: ${window ?? "14d"}`,
        ].join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Score failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_list_evidence
  // -------------------------------------------------------------------------
  server.tool(
    "amc_list_evidence",
    "List evidence events from the AMC ledger for a time window. Returns event IDs, types, timestamps, and trust tiers. (read-only)",
    {
      window: z.string().optional().describe("Time window (e.g. '7d', '30d'). Default: '14d'"),
      limit: z.number().optional().describe("Maximum events to return (default: 50)"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ window, limit, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const windowStr = window ?? "14d";
        const maxEvents = Math.min(limit ?? 50, 200);
        const now = Date.now();
        const windowMs = parseWindowToMs(windowStr);
        const startTs = now - windowMs;

        const ledger = openLedger(ws);
        try {
          const events = ledger.getEventsBetween(startTs, now);
          const limited = events.slice(0, maxEvents);
          const rows = limited.map((e) =>
            `- [${new Date(e.ts).toISOString()}] ${e.event_type} id=${e.id.slice(0, 8)}… session=${e.session_id.slice(0, 8)}…`
          ).join("\n");

          return {
            content: [{
              type: "text",
              text: [
                `## Evidence Events (${windowStr})`,
                ``,
                `Total: ${events.length} events (showing ${limited.length})`,
                ``,
                rows || "(No events in window)",
              ].join("\n"),
            }],
          };
        } finally {
          ledger.close();
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `List evidence failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_query_diagnostic
  // -------------------------------------------------------------------------
  server.tool(
    "amc_query_diagnostic",
    "Query the latest diagnostic run report for an agent. Returns layer scores, question scores, and upgrade actions. (read-only)",
    {
      agentId: z.string().describe("Agent ID to query"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ agentId, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const ledger = openLedger(ws);
        try {
          const runs = ledger.listRuns();
          const agentRuns = runs.filter((r) => {
            const targetId = r.target_profile_id;
            return targetId === agentId || targetId === null;
          });

          if (agentRuns.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No diagnostic runs found for agent "${agentId}". Run \`amc quickscore\` first.`,
              }],
            };
          }

          const latest = agentRuns[0]!;
          return {
            content: [{
              type: "text",
              text: [
                `## Latest Diagnostic Run`,
                ``,
                `Run ID: ${latest.run_id}`,
                `Date: ${new Date(latest.ts).toISOString()}`,
                `Status: ${latest.status}`,
                `Window: ${new Date(latest.window_start_ts).toISOString()} → ${new Date(latest.window_end_ts).toISOString()}`,
                `Report Hash: ${latest.report_json_sha256.slice(0, 16)}…`,
                ``,
                `Run \`amc quickscore\` for a full interactive diagnostic.`,
              ].join("\n"),
            }],
          };
        } finally {
          ledger.close();
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `Query failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Tool: amc_get_recommendations
  // -------------------------------------------------------------------------
  server.tool(
    "amc_get_recommendations",
    "Get actionable recommendations for improving agent maturity. Returns prioritized actions with specific CLI commands and expected impact. (read-only)",
    {
      agentId: z.string().describe("Agent ID to get recommendations for"),
      workspace: z
        .string()
        .optional()
        .describe("Path to the AMC workspace (defaults to current directory)"),
    },
    async ({ agentId, workspace }) => {
      enforceRateLimit();
      const ws = validateWorkspace(workspace ?? process.cwd());
      try {
        const report = generateTransparencyReport(agentId, ws);
        const priorities = report.topPriorities;

        const dimGaps = report.dimensions
          .filter((d) => d.level < 3)
          .map((d) => `- **${d.name}** is at L${d.level} — target L3+: run \`amc guide --agent ${agentId}\``)
          .join("\n");

        const topActions = priorities
          .slice(0, 5)
          .map((p, i) => `${i + 1}. **${p.action}** (${p.impact})\n   \`${p.command}\``)
          .join("\n\n");

        const text = [
          `## Recommendations: ${agentId}`,
          ``,
          `Current: ${report.identity.maturityLabel} (${report.identity.trustScore}/100)`,
          ``,
          `### Priority Actions`,
          ``,
          topActions || "No immediate actions — agent is well-assessed.",
          ``,
          dimGaps ? `### Dimension Gaps\n\n${dimGaps}` : "",
          ``,
          `### Quick Wins`,
          `- Run \`amc compliance report --framework EU_AI_ACT\` to identify compliance gaps`,
          `- Run \`amc redteam run --agent ${agentId}\` for security assessment`,
          `- Run \`amc benchmark run --agent ${agentId}\` for performance baseline`,
        ].filter(Boolean).join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Recommendations failed: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Resource: amc://agent/{agentId}
  // -------------------------------------------------------------------------
  server.resource(
    "agent-transparency",
    new ResourceTemplate("amc://agent/{agentId}", { list: undefined }),
    async (uri, { agentId }) => {
      const ws = process.cwd();
      const id = Array.isArray(agentId) ? agentId[0] : agentId;
      try {
        const report = generateTransparencyReport(String(id), ws);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: renderTransparencyReportMarkdown(report),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Could not load agent "${String(id)}": ${(err as Error).message}`,
            },
          ],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const cleanup = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
