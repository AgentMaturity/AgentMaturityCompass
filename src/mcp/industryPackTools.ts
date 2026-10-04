/**
 * Read-only MCP tools over the industry packs in src/domains.
 *
 * Gating mirrors the existing surfaces: listing uses the public catalog view
 * (toIndustryPackCatalogItem), while pack content and scoring require an active
 * Industry Packs entitlement, as `amc domain pack describe|run` and the Studio
 * /industry-packs/:id route do. Refusals are structured tool results, never throws.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listDomainIds, type Domain } from "../domains/domainRegistry.js";
import {
  INDUSTRY_PACKS,
  getIndustryPacksByStation,
  getStationSummary,
  listIndustryPackIds,
  scoreIndustryPack,
  type IndustryPack,
  type IndustryPackId,
} from "../domains/industryPacks.js";
import {
  formatIndustryPackPaywallMessage,
  getIndustryPackEntitlement,
  toIndustryPackCatalogItem,
  type IndustryPackEntitlement,
} from "../domains/industryPackEntitlement.js";

export const INDUSTRY_PACK_TOOL_NAMES = [
  "amc_list_industry_packs",
  "amc_get_industry_pack",
  "amc_score_industry_pack",
  "amc_industry_station_summary",
] as const;

export interface IndustryPackToolOptions {
  /** Resolves the entitlement per call; defaults to the workspace in process.cwd(). */
  resolveEntitlement?: () => IndustryPackEntitlement;
  /** Host guard run before every call (the server passes its rate limiter); a throw is refused as rate_limited. */
  beforeCall?: () => void;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const STATION_IDS = listDomainIds() as [Domain, ...Domain[]];
const stationSchema = z.enum(STATION_IDS);
const packIdSchema = z.string().min(1).max(128).describe("Industry pack id, e.g. clinical-trials");

function ok(data: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...data }, null, 2) }] };
}

function refuse(code: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  const body = { ok: false, error: { code, message, ...extra } };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
}

function findPack(packId: string): IndustryPack | undefined {
  return Object.hasOwn(INDUSTRY_PACKS, packId) ? INDUSTRY_PACKS[packId as IndustryPackId] : undefined;
}

function unknownPack(packId: string): ToolResult {
  return refuse("unknown_pack_id", `Unknown industry pack: ${packId}`, {
    packId,
    availablePackIds: listIndustryPackIds(),
  });
}

function locked(entitlement: IndustryPackEntitlement): ToolResult {
  return refuse("industry_packs_locked", formatIndustryPackPaywallMessage(entitlement));
}

export function registerIndustryPackTools(server: McpServer, options: IndustryPackToolOptions = {}): void {
  const resolveEntitlement = options.resolveEntitlement ?? (() => getIndustryPackEntitlement(process.cwd()));
  const guarded =
    <A>(handler: (args: A) => ToolResult) =>
    async (args: A): Promise<ToolResult> => {
      try {
        options.beforeCall?.();
      } catch (err) {
        return refuse("rate_limited", (err as Error).message);
      }
      return handler(args);
    };

  server.registerTool(
    "amc_list_industry_packs",
    {
      description: "List AMC industry packs grouped by station, optionally for one station. Pack content stays locked without an Industry Packs entitlement. (read-only)",
      inputSchema: z.object({ station: stationSchema.optional().describe("Station id") }).strict(),
      annotations: READ_ONLY,
    },
    guarded(({ station }: { station?: Domain }) => {
      const entitlement = resolveEntitlement();
      const stations = (station ? [station] : STATION_IDS).map((stationId) => ({
        stationId,
        packs: getIndustryPacksByStation(stationId).map((pack) => toIndustryPackCatalogItem(pack, entitlement)),
      }));
      const packCount = stations.reduce((n, s) => n + s.packs.length, 0);
      return ok({ locked: !entitlement.active, packCount, stations });
    }),
  );

  server.registerTool(
    "amc_get_industry_pack",
    {
      description: "Get one industry pack: questions, regulatory basis, compliance frameworks and EU AI Act classification. Requires an Industry Packs entitlement. (read-only)",
      inputSchema: z.object({ packId: packIdSchema }).strict(),
      annotations: READ_ONLY,
    },
    guarded(({ packId }: { packId: string }) => {
      const pack = findPack(packId);
      if (!pack) return unknownPack(packId);
      const entitlement = resolveEntitlement();
      if (!entitlement.active) return locked(entitlement);
      return ok({ pack });
    }),
  );

  server.registerTool(
    "amc_score_industry_pack",
    {
      description: "Score self-reported question levels (1-5) against an industry pack. Unanswered questions score as L1. Requires an Industry Packs entitlement. (read-only)",
      inputSchema: z
        .object({
          packId: packIdSchema,
          responses: z.record(z.string().min(1).max(128), z.number().int().min(1).max(5)).describe("Question id to level 1-5"),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    guarded(({ packId, responses }: { packId: string; responses: Record<string, number> }) => {
      const pack = findPack(packId);
      if (!pack) return unknownPack(packId);
      const entitlement = resolveEntitlement();
      if (!entitlement.active) return locked(entitlement);
      const questionIds = new Set(pack.questions.map((q) => q.id));
      const unknown = Object.keys(responses).filter((id) => !questionIds.has(id));
      if (unknown.length > 0) {
        return refuse("unknown_question_id", `Response keys are not questions of ${pack.id}`, { questionIds: unknown });
      }
      const unansweredQuestionIds = pack.questions.filter((q) => !Object.hasOwn(responses, q.id)).map((q) => q.id);
      return ok({ result: scoreIndustryPack(pack.id, responses), unansweredQuestionIds });
    }),
  );

  server.registerTool(
    "amc_industry_station_summary",
    {
      description: "Summarise one station: pack count, question count and, with an entitlement, compliance frameworks. (read-only)",
      inputSchema: z.object({ station: stationSchema.describe("Station id") }).strict(),
      annotations: READ_ONLY,
    },
    guarded(({ station }: { station: Domain }) => {
      const entitlement = resolveEntitlement();
      const { frameworks, ...counts } = getStationSummary(station);
      const summary = entitlement.active ? { ...counts, frameworks } : counts;
      return ok({ locked: !entitlement.active, summary });
    }),
  );
}
