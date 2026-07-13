import { isActionClass } from "../governor/actionCatalog.js";
import type { ActionClass, ExecutionMode } from "../types.js";
import {
  inspectApprovalActivityInventory,
  type ApprovalRequestStatus
} from "./approvalChainStore.js";
import {
  getApprovalInboxItem,
  parseApprovalInboxStatus,
  projectApprovalInboxSummary,
  type ApprovalInboxSummary
} from "./approvalInbox.js";

export type ApprovalActivityRiskTier = "low" | "medium" | "high" | "critical";
export type ApprovalActivityOrder = "newest" | "oldest";

export interface ApprovalActivityQueryInput {
  query?: string | null;
  status?: string | null;
  actionClass?: string | null;
  riskTier?: string | null;
  effectiveMode?: string | null;
  createdAfter?: string | number | null;
  createdBefore?: string | number | null;
  order?: string | null;
  limit?: string | number | null;
}

export interface ApprovalActivityFilters {
  query: string | null;
  status: ApprovalRequestStatus | null;
  actionClass: ActionClass | null;
  riskTier: ApprovalActivityRiskTier | null;
  effectiveMode: ExecutionMode | null;
  createdAfterTs: number | null;
  createdBeforeTs: number | null;
  order: ApprovalActivityOrder;
  limit: number;
}

export interface ApprovalActivityResult {
  schemaVersion: "2026-07-13";
  agentId: string;
  filters: ApprovalActivityFilters;
  integrity: {
    valid: boolean;
    reasonCodes: string[];
    scannedRequests: number;
    trustedRequests: number;
    scannedDecisions: number;
    scannedConsumptions: number;
  };
  totalMatched: number;
  returned: number;
  truncated: boolean;
  requests: ApprovalInboxSummary[];
  derivedView: true;
  recorded: false;
  proofEligible: false;
  claimBoundary: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CLAIM_BOUNDARY =
  "Derived read-only view of AMC's signed approval artifacts; it is not a new activity record and does not prove that an approved action executed.";

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function parseTimestamp(value: string | number | null | undefined, label: string): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid approval activity ${label} timestamp`);
    }
    return value;
  }
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Invalid approval activity ${label} timestamp`);
    }
    return parsed;
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid approval activity ${label} timestamp`);
  }
  return parsed;
}

function parseActionClass(value: string | null | undefined): ActionClass | null {
  const normalized = optionalText(value)?.toUpperCase() ?? null;
  if (normalized === null) {
    return null;
  }
  if (!isActionClass(normalized)) {
    throw new Error(`Invalid approval activity action class: ${value}`);
  }
  return normalized;
}

function parseRiskTier(value: string | null | undefined): ApprovalActivityRiskTier | null {
  const normalized = optionalText(value)?.toLowerCase() ?? null;
  if (normalized === null) {
    return null;
  }
  if (normalized !== "low" && normalized !== "medium" && normalized !== "high" && normalized !== "critical") {
    throw new Error(`Invalid approval activity risk tier: ${value}`);
  }
  return normalized;
}

function parseEffectiveMode(value: string | null | undefined): ExecutionMode | null {
  const normalized = optionalText(value)?.toUpperCase() ?? null;
  if (normalized === null) {
    return null;
  }
  if (normalized !== "SIMULATE" && normalized !== "EXECUTE") {
    throw new Error(`Invalid approval activity effective mode: ${value}`);
  }
  return normalized;
}

function parseOrder(value: string | null | undefined): ApprovalActivityOrder {
  const normalized = optionalText(value)?.toLowerCase() ?? "newest";
  if (normalized !== "newest" && normalized !== "oldest") {
    throw new Error(`Invalid approval activity order: ${value}`);
  }
  return normalized;
}

function parseLimit(value: string | number | null | undefined): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new Error(`Invalid approval activity limit: expected 1-${MAX_LIMIT}`);
  }
  return parsed;
}

export function parseApprovalActivityQuery(input: ApprovalActivityQueryInput): ApprovalActivityFilters {
  const query = optionalText(input.query);
  if (query && (query.length > 128 || !/^[A-Za-z0-9_-]+$/.test(query))) {
    throw new Error("Invalid approval activity query: use at most 128 letters, digits, underscores, or hyphens");
  }
  const createdAfterTs = parseTimestamp(input.createdAfter, "created-after");
  const createdBeforeTs = parseTimestamp(input.createdBefore, "created-before");
  if (createdAfterTs !== null && createdBeforeTs !== null && createdAfterTs > createdBeforeTs) {
    throw new Error("Invalid approval activity time range: created-after must not exceed created-before");
  }
  return {
    query,
    status: parseApprovalInboxStatus(optionalText(input.status) ?? undefined) ?? null,
    actionClass: parseActionClass(input.actionClass),
    riskTier: parseRiskTier(input.riskTier),
    effectiveMode: parseEffectiveMode(input.effectiveMode),
    createdAfterTs,
    createdBeforeTs,
    order: parseOrder(input.order),
    limit: parseLimit(input.limit)
  };
}

export function parseApprovalActivitySearchParams(searchParams: Pick<URLSearchParams, "get">): ApprovalActivityFilters {
  return parseApprovalActivityQuery({
    query: searchParams.get("query"),
    status: searchParams.get("status"),
    actionClass: searchParams.get("actionClass"),
    riskTier: searchParams.get("riskTier"),
    effectiveMode: searchParams.get("effectiveMode"),
    createdAfter: searchParams.get("createdAfter"),
    createdBefore: searchParams.get("createdBefore"),
    order: searchParams.get("order"),
    limit: searchParams.get("limit")
  });
}

function emptyResult(params: {
  agentId: string;
  filters: ApprovalActivityFilters;
  inventory: ReturnType<typeof inspectApprovalActivityInventory>;
}): ApprovalActivityResult {
  return {
    schemaVersion: "2026-07-13",
    agentId: params.agentId,
    filters: params.filters,
    integrity: {
      valid: false,
      reasonCodes: params.inventory.reasonCodes,
      scannedRequests: params.inventory.scannedRequests,
      trustedRequests: params.inventory.trustedRequests,
      scannedDecisions: params.inventory.scannedDecisions,
      scannedConsumptions: params.inventory.scannedConsumptions
    },
    totalMatched: 0,
    returned: 0,
    truncated: false,
    requests: [],
    derivedView: true,
    recorded: false,
    proofEligible: false,
    claimBoundary: CLAIM_BOUNDARY
  };
}

export function searchApprovalActivity(params: {
  workspace: string;
  agentId: string;
  filters: ApprovalActivityFilters;
}): ApprovalActivityResult {
  const inventory = inspectApprovalActivityInventory({
    workspace: params.workspace,
    agentId: params.agentId
  });
  if (!inventory.valid) {
    return emptyResult({ agentId: params.agentId, filters: params.filters, inventory });
  }

  const query = params.filters.query?.toLowerCase() ?? null;
  let matches: ApprovalInboxSummary[];
  try {
    matches = inventory.requests
      .filter((request) => query === null || request.approvalRequestId.toLowerCase().includes(query))
      .filter((request) => params.filters.actionClass === null || request.actionClass === params.filters.actionClass)
      .filter((request) => params.filters.riskTier === null || request.riskTier === params.filters.riskTier)
      .filter((request) => params.filters.effectiveMode === null || request.effectiveMode === params.filters.effectiveMode)
      .filter((request) => params.filters.createdAfterTs === null || request.createdTs >= params.filters.createdAfterTs)
      .filter((request) => params.filters.createdBeforeTs === null || request.createdTs <= params.filters.createdBeforeTs)
      .map((request) => projectApprovalInboxSummary(getApprovalInboxItem({
        workspace: params.workspace,
        agentId: params.agentId,
        approvalRequestId: request.approvalRequestId
      })))
      .filter((row) => params.filters.status === null || row.status === params.filters.status)
      .sort((a, b) => {
        const timeOrder = params.filters.order === "newest" ? b.createdTs - a.createdTs : a.createdTs - b.createdTs;
        return timeOrder || a.approvalRequestId.localeCompare(b.approvalRequestId);
      });
  } catch {
    return emptyResult({
      agentId: params.agentId,
      filters: params.filters,
      inventory: {
        ...inventory,
        valid: false,
        reasonCodes: ["APPROVAL_ACTIVITY_PROJECTION_FAILED"]
      }
    });
  }
  const inventoryAfterProjection = inspectApprovalActivityInventory({
    workspace: params.workspace,
    agentId: params.agentId
  });
  if (!inventoryAfterProjection.valid) {
    return emptyResult({ agentId: params.agentId, filters: params.filters, inventory: inventoryAfterProjection });
  }
  if (
    inventoryAfterProjection.scannedRequests !== inventory.scannedRequests ||
    inventoryAfterProjection.trustedRequests !== inventory.trustedRequests ||
    inventoryAfterProjection.scannedDecisions !== inventory.scannedDecisions ||
    inventoryAfterProjection.scannedConsumptions !== inventory.scannedConsumptions
  ) {
    return emptyResult({
      agentId: params.agentId,
      filters: params.filters,
      inventory: {
        ...inventoryAfterProjection,
        valid: false,
        reasonCodes: ["APPROVAL_ACTIVITY_INVENTORY_CHANGED"]
      }
    });
  }
  if (matches.some((row) => !row.requestIntegrity.valid || !row.chainIntegrity.valid)) {
    return emptyResult({
      agentId: params.agentId,
      filters: params.filters,
      inventory: {
        ...inventory,
        valid: false,
        reasonCodes: ["APPROVAL_ACTIVITY_INTEGRITY_CHANGED"]
      }
    });
  }
  const requests = matches.slice(0, params.filters.limit);

  return {
    schemaVersion: "2026-07-13",
    agentId: params.agentId,
    filters: params.filters,
    integrity: {
      valid: true,
      reasonCodes: [],
      scannedRequests: inventory.scannedRequests,
      trustedRequests: inventory.trustedRequests,
      scannedDecisions: inventory.scannedDecisions,
      scannedConsumptions: inventory.scannedConsumptions
    },
    totalMatched: matches.length,
    returned: requests.length,
    truncated: matches.length > requests.length,
    requests,
    derivedView: true,
    recorded: false,
    proofEligible: false,
    claimBoundary: CLAIM_BOUNDARY
  };
}
