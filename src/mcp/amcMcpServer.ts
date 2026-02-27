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
}

const rateLimiter = new RateLimiter(60_000, 60); // 60 requests per minute

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
