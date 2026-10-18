/**
 * Read-only MCP tools over the industry packs in src/domains (O17, P1-44).
 *
 * Access follows P1-51 (D-06 = B): pack names, descriptions, regulatory basis, frameworks and station summaries are
 * public; pack questions and scoring need an Industry Packs licence verified against a pinned key, and a locked call is
 * refused with the one paywall message. A licence unlocks access only: no tool returns a different result because a
 * licence is present. Every result carries its claim through withClaim (P0-23); refusals are tool results, never throws.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listDomainIds, type Domain } from "../domains/domainRegistry.js";
import {
  getIndustryPacksByStation,
  getPackById,
  getStationSummary,
  listIndustryPackIds,
  scoreIndustryPack,
} from "../domains/industryPacks.js";
import {
  getIndustryPackEntitlement,
  toIndustryPackCatalogItem,
  type IndustryPackEntitlement,
} from "../domains/industryPackEntitlement.js";
import { packSelfAssessmentEnvelope } from "../domains/packSelfAssessment.js";
import { unboundClaim, withClaim } from "./mcpClaimOutput.js";
import type { ClaimEnvelope } from "../claims/eligibility/index.js";

export const INDUSTRY_PACK_TOOL_NAMES = [
  "amc_list_industry_packs",
  "amc_get_industry_pack",
  "amc_score_industry_pack",
  "amc_industry_station_summary",
] as const;

export const INDUSTRY_PACK_TOOL_METADATA = [
  { name: "amc_list_industry_packs", description: "List industry packs by station: names, descriptions, regulatory basis and frameworks (read-only)", input: "{ station?: string }" },
  { name: "amc_get_industry_pack", description: "Get one industry pack's questions; needs an Industry Packs licence (read-only)", input: "{ packId: string }" },
  { name: "amc_score_industry_pack", description: "Self-reported pack score; unanswered questions are not evaluated; needs an Industry Packs licence (read-only)", input: "{ packId: string, responses: Record<string, number> }" },
  { name: "amc_industry_station_summary", description: "Pack count, question count and frameworks of one station (read-only)", input: "{ station: string }" },
];

export interface IndustryPackToolOptions {
  /** Resolves the entitlement per call; defaults to the workspace in process.cwd(). */
  resolveEntitlement?: () => IndustryPackEntitlement;
  /** Host guard run before every call (the server passes its rate limiter); a throw is refused as rate_limited. */
  beforeCall?: () => void;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const STATION_IDS = listDomainIds() as [Domain, ...Domain[]];
const stationSchema = z.enum(STATION_IDS);
const packIdSchema = z.string().min(1).max(128).describe("Industry pack id, e.g. clinical-trials");

function ok(data: Record<string, unknown>, envelope: ClaimEnvelope): ToolResult {
  const body = { ok: true, ...data };
  return withClaim(JSON.stringify(body, null, 2), envelope, body);
}

/** Pack catalog and station data are not results about an agent: unbound, never a pass (as Studio labels them). */
function catalogClaim(tool: string): ClaimEnvelope {
  return unboundClaim(`mcp:${tool}`, "runtime_observation");
}

function refuse(code: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  const body = { ok: false, error: { code, message, ...extra } };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
}

function unknownPack(packId: string): ToolResult {
  return refuse("unknown_pack_id", `Unknown industry pack: ${packId}`, {
    packId,
    availablePackIds: listIndustryPackIds(),
  });
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
  /** Without an active licence: the refusal with P1-51's one paywall message. */
  const lockedRefusal = (): ToolResult | null => {
    const entitlement = resolveEntitlement();
    return entitlement.active ? null : refuse("industry_packs_locked", entitlement.message);
  };

  server.registerTool(
    "amc_list_industry_packs",
    {
      description: "List AMC industry packs grouped by station, optionally for one station: names, descriptions, regulatory basis and frameworks. Each item says whether its questions are locked; a licence never changes this listing. (read-only)",
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
      return ok({ packCount, stations }, catalogClaim("amc_list_industry_packs"));
    }),
  );

  server.registerTool(
    "amc_get_industry_pack",
    {
      description: "Get one industry pack: questions, regulatory basis, compliance frameworks and EU AI Act classification, as stored. Requires an Industry Packs licence. (read-only)",
      inputSchema: z.object({ packId: packIdSchema }).strict(),
      annotations: READ_ONLY,
    },
    guarded(({ packId }: { packId: string }) => {
      const pack = getPackById(packId);
      if (!pack) return unknownPack(packId);
      return lockedRefusal() ?? ok({ pack }, catalogClaim("amc_get_industry_pack"));
    }),
  );

  server.registerTool(
    "amc_score_industry_pack",
    {
      description: "Score self-reported question levels (1-5) against an industry pack. The result is self-reported, never a certification. Unanswered questions are not evaluated: they are listed in notEvaluatedQuestionIds and no score or level is computed until every question is answered. Requires an Industry Packs licence. (read-only)",
      inputSchema: z
        .object({
          packId: packIdSchema,
          responses: z.record(z.string().min(1).max(128), z.number().int().min(1).max(5)).describe("Question id to level 1-5"),
        })
        .strict(),
      annotations: READ_ONLY,
    },
    guarded(({ packId, responses }: { packId: string; responses: Record<string, number> }) => {
      const pack = getPackById(packId);
      if (!pack) return unknownPack(packId);
      const locked = lockedRefusal();
      if (locked) return locked;
      const questionIds = new Set(pack.questions.map((q) => q.id));
      const unknown = Object.keys(responses).filter((id) => !questionIds.has(id));
      if (unknown.length > 0) {
        return refuse("unknown_question_id", `Response keys are not questions of ${pack.id}`, { questionIds: unknown });
      }
      const notEvaluatedQuestionIds = pack.questions.filter((q) => !Object.hasOwn(responses, q.id)).map((q) => q.id);
      // scoreIndustryPack counts a missing answer as 1 (P0-21); a missing answer is not evaluated, so no score is shown.
      const scored = scoreIndustryPack(pack.id, responses);
      return ok({
        packId: pack.id,
        selfAssessment: scored.selfAssessment,
        notEvaluatedQuestionIds,
        result: notEvaluatedQuestionIds.length === 0 ? scored : null,
      }, packSelfAssessmentEnvelope(pack, responses, Date.now()));
    }),
  );

  server.registerTool(
    "amc_industry_station_summary",
    {
      description: "Summarise one station: pack count, question count and compliance frameworks. (read-only)",
      inputSchema: z.object({ station: stationSchema.describe("Station id") }).strict(),
      annotations: READ_ONLY,
    },
    guarded(({ station }: { station: Domain }) => ok({ summary: getStationSummary(station) },
      catalogClaim("amc_industry_station_summary"))),
  );
}
