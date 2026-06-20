/**
 * Operational Independence Score from guard-events telemetry.
 */

import { readGuardEvents } from "../enforce/evidenceEmitter.js";

export type ExternalDependencyKind =
  | "llm_api"
  | "database"
  | "vector_store"
  | "storage"
  | "queue"
  | "webhook"
  | "automation_platform"
  | "identity"
  | "payment"
  | "observability"
  | "unknown";

export interface ExternalDependencyInventoryEntry {
  dependencyId: string;
  kind: ExternalDependencyKind;
  providers: string[];
  versions: string[];
  usageEvents: number;
  failureEvents: number;
  failureRate: number; // 0-1
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  supportsFallback: boolean;
  lastSeenAt: string;
}

export interface ExternalDependencyInventory {
  totalDependencies: number;
  externalEventCount: number;
  dependencyCoverage: number; // 0-1 share of guard events tied to external deps
  singlePointsOfFailure: string[];
  dependencies: ExternalDependencyInventoryEntry[];
}

export interface DependencyDriftSignal {
  dependencyId: string;
  driftType: "version" | "error_rate" | "sla_latency";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  baseline: number | string | null;
  current: number | string | null;
  delta: number | null;
}

export interface DependencyDriftReport {
  score: number; // 0-100 (higher = more stable)
  status: "stable" | "watch" | "degrading" | "critical";
  driftEvents: number;
  versionDriftCount: number;
  slaDegradationCount: number;
  signals: DependencyDriftSignal[];
}

export interface GracefulDegradationScore {
  score: number; // 0-100
  failureEvents: number;
  recoveredWithFallback: number;
  degradedModeActivations: number;
  hardFailures: number;
  recoveryRate: number; // 0-1
  notes: string[];
}

export interface VendorLockInRiskScore {
  score: number; // 0-100 (higher = higher lock-in risk)
  riskLevel: "low" | "medium" | "high" | "critical";
  primaryVendors: string[];
  multiVendorCoverage: number; // 0-1
  portableDependencies: number;
  nonPortableDependencies: number;
  lockInDrivers: string[];
  recommendations: string[];
}

export type OperationalIndependenceDomainContext = "generic" | "logistics";

export interface LogisticsReliabilityMetric {
  score: number;
  evidenceEvents: number;
  notes: string[];
}

export interface LogisticsReliabilityScore {
  score: number;
  status: "ready" | "watch" | "degrading" | "critical";
  logisticsEventCount: number;
  telemetryConfidence: number;
  carriers: string[];
  carrierReliability: LogisticsReliabilityMetric & {
    shipmentEvents: number;
    failedShipmentEvents: number;
    onTimeRate: number;
  };
  exceptionManagement: LogisticsReliabilityMetric & {
    exceptionEvents: number;
    resolvedExceptions: number;
    unresolvedExceptions: number;
    avgResolutionHours: number | null;
  };
  warehouseIntegrity: LogisticsReliabilityMetric & {
    warehouseEvents: number;
    errorEvents: number;
    inventoryAccuracy: number | null;
  };
  slaPerformance: LogisticsReliabilityMetric & {
    slaEvents: number;
    breachEvents: number;
    breachRate: number;
  };
  traceabilityCoverage: LogisticsReliabilityMetric & {
    traceableEvents: number;
    coverage: number;
  };
  coldChainIntegrity: LogisticsReliabilityMetric & {
    monitoredEvents: number;
    excursionEvents: number;
    excursionRate: number;
  };
  gaps: string[];
  recommendedActions: string[];
}

export interface OperationalIndependenceOptions {
  domain?: string;
}

export interface OperationalIndependenceScore {
  score: number; // 0-100
  context: OperationalIndependenceDomainContext;
  longestRunDays: number;
  escalationRate: number; // percent
  driftEvents: number;
  qualityHeld: boolean;
  telemetryConfidence: number; // 0-1
  reducedExternalAccessScore: number; // 0-100
  externalDependencyInventory: ExternalDependencyInventory;
  dependencyDrift: DependencyDriftReport;
  gracefulDegradation: GracefulDegradationScore;
  vendorLockInRisk: VendorLockInRiskScore;
  logisticsReliability?: LogisticsReliabilityScore;
}

export interface GuardEventLike {
  created_at: string;
  module_code: string;
  decision: string;
  reason: string;
  severity: string;
  meta_json: string | null;
}

interface DayFlags {
  humanApproval: boolean;
  drift: boolean;
}

interface DependencySample {
  ts: number;
  createdAt: string;
  dependencyId: string;
  kind: ExternalDependencyKind;
  provider: string | null;
  version: string | null;
  failure: boolean;
  fallback: boolean;
  degradedMode: boolean;
  latencyMs: number | null;
}

const FAILURE_REASON_RE =
  /\b(fail|failed|failure|timeout|timed out|outage|unavailable|rate[\s-]?limit|throttl|error|denied|circuit open|503|429|5\d\d)\b/i;
const FALLBACK_REASON_RE =
  /\b(fallback|failover|secondary|backup|graceful|degrad(?:e|ed|ation)|reduced|minimal|retry|backoff|cached)\b/i;
const DEGRADED_REASON_RE = /\b(degrad(?:e|ed|ation)|reduced|minimal|circuit|safe mode)\b/i;
const EXTERNAL_HINT_RE =
  /\b(api|provider|service|endpoint|upstream|external|model|llm|openai|anthropic|gemini|openrouter|xai|database|vector|webhook|n8n|zapier|make)\b/i;

const PROVIDER_HINTS = [
  "openai",
  "anthropic",
  "gemini",
  "google",
  "openrouter",
  "xai",
  "grok",
  "azure",
  "aws",
  "gcp",
  "postgres",
  "mysql",
  "sqlite",
  "pinecone",
  "weaviate",
  "redis",
  "s3",
  "supabase",
  "stripe",
  "twilio",
  "okta",
  "auth0",
  "datadog",
  "newrelic",
  "prometheus",
  "n8n",
  "zapier",
  "make",
  "power-automate"
];

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toDayList(events: GuardEventLike[]): string[] {
  const daySet = new Set<string>();
  for (const e of events) {
    daySet.add(new Date(e.created_at).toISOString().slice(0, 10));
  }
  return Array.from(daySet).sort();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function sanitizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(meta: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function firstBoolean(meta: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
  }
  return null;
}

function parseHost(candidate: string | null): string | null {
  if (!candidate) return null;
  try {
    const asUrl = candidate.includes("://") ? candidate : `https://${candidate}`;
    return sanitizeToken(new URL(asUrl).host);
  } catch {
    return sanitizeToken(candidate);
  }
}

function providerHintFromText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const provider of PROVIDER_HINTS) {
    if (lower.includes(provider)) {
      return provider;
    }
  }
  return null;
}

function classifyDependencyKind(
  dependencyId: string,
  reason: string,
  meta: Record<string, unknown>
): ExternalDependencyKind {
  const joined = `${dependencyId} ${reason} ${JSON.stringify(meta)}`.toLowerCase();
  if (/\b(openai|anthropic|gemini|openrouter|xai|grok|llm|model)\b/.test(joined)) return "llm_api";
  if (/\b(pinecone|weaviate|qdrant|vector|embedding|pgvector)\b/.test(joined)) return "vector_store";
  if (/\b(postgres|mysql|sqlite|database|db|mongodb|supabase)\b/.test(joined)) return "database";
  if (/\b(s3|blob|bucket|storage|filesystem|file-store)\b/.test(joined)) return "storage";
  if (/\b(queue|kafka|sqs|rabbitmq|pubsub)\b/.test(joined)) return "queue";
  if (/\b(webhook|callback|ingress)\b/.test(joined)) return "webhook";
  if (/\b(n8n|zapier|make|power-automate|automation)\b/.test(joined)) return "automation_platform";
  if (/\b(okta|auth0|oidc|saml|identity|scim)\b/.test(joined)) return "identity";
  if (/\b(stripe|paypal|payment)\b/.test(joined)) return "payment";
  if (/\b(datadog|prometheus|otel|newrelic|observability|telemetry)\b/.test(joined)) return "observability";
  return "unknown";
}

function inferDependency(event: GuardEventLike, meta: Record<string, unknown>): {
  isExternal: boolean;
  dependencyId: string | null;
  provider: string | null;
  version: string | null;
  kind: ExternalDependencyKind;
} {
  const reason = event.reason || "";
  const providerRaw = firstString(meta, ["providerId", "provider", "serviceProvider"]);
  const serviceRaw = firstString(meta, [
    "dependencyId",
    "dependency",
    "service",
    "serviceName",
    "platform",
    "upstreamId",
    "upstream",
    "host"
  ]);
  const endpoint = firstString(meta, ["endpoint", "baseUrl", "url", "upstreamUrl", "routePath", "route"]);
  const host = parseHost(endpoint);

  const fromReason = providerHintFromText(reason);
  const fromMeta = providerHintFromText(JSON.stringify(meta));
  const provider = sanitizeToken(providerRaw || fromMeta || fromReason || "");
  const service = sanitizeToken(serviceRaw || host || provider || "");

  const version =
    firstString(meta, [
      "dependencyVersion",
      "providerVersion",
      "version",
      "modelVersion",
      "sdkVersion",
      "apiVersion"
    ]) ??
    firstString(meta, ["model"]);

  const hasExternalMeta =
    provider.length > 0 ||
    service.length > 0 ||
    endpoint !== null ||
    firstString(meta, ["model", "provider", "providerId", "dependency", "service"]) !== null;
  const externalByReason = EXTERNAL_HINT_RE.test(reason);
  const externalByModule = event.module_code === "BRIDGE" || event.module_code === "E4";
  const isExternal = hasExternalMeta || externalByReason || externalByModule;

  const dependencyId = service.length > 0 ? service : provider.length > 0 ? provider : null;
  const kind = dependencyId ? classifyDependencyKind(dependencyId, reason, meta) : "unknown";

  return {
    isExternal,
    dependencyId,
    provider: provider.length > 0 ? provider : null,
    version,
    kind
  };
}

function extractLatencyMs(meta: Record<string, unknown>, reason: string): number | null {
  const fromMeta = firstNumber(meta, [
    "latencyMs",
    "responseTimeMs",
    "durationMs",
    "upstreamLatencyMs",
    "p95LatencyMs",
    "slaLatencyMs"
  ]);
  if (fromMeta !== null) return Math.max(0, fromMeta);

  const fromReason = /(\d{2,6})\s*ms/i.exec(reason);
  if (!fromReason) return null;
  const value = Number(fromReason[1]);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function isDependencyFailure(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const decision = (event.decision || "").toLowerCase();
  if (decision === "deny") return true;

  const success = firstBoolean(meta, ["success", "isSuccess"]);
  if (success === false) return true;
  const failed = firstBoolean(meta, ["failed", "failure"]);
  if (failed === true) return true;

  const status = String(meta.status ?? "").toLowerCase();
  if (status === "error" || status === "failed" || status === "unavailable") {
    return true;
  }

  if (FAILURE_REASON_RE.test(event.reason || "")) {
    return decision !== "allow" || String(event.severity).toLowerCase() !== "low";
  }
  return false;
}

function isFallbackSignal(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  if (FALLBACK_REASON_RE.test(event.reason || "")) return true;
  return (
    firstBoolean(meta, ["fallbackUsed", "usedFallback", "failover", "degradedMode"]) === true ||
    firstString(meta, ["fallbackProvider", "secondaryProvider", "backupProvider"]) !== null
  );
}

function isDegradedModeSignal(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  if (DEGRADED_REASON_RE.test(event.reason || "")) return true;
  const mode = firstString(meta, ["mode", "degradationMode", "operatingMode"]);
  return mode !== null && /\b(reduced|minimal|degraded|safe)\b/i.test(mode);
}

function isHumanIntervention(event: GuardEventLike): boolean {
  const reason = event.reason || "";
  const meta = parseMeta(event.meta_json);
  return (
    event.decision === "stepup" ||
    meta?.humanApproval === true ||
    /(approval|escalation|human|manual|override)/i.test(reason)
  );
}

function isDrift(event: GuardEventLike): boolean {
  const reason = (event.reason || "").toLowerCase();
  const meta = parseMeta(event.meta_json);
  const auditType = String((meta as { auditType?: string } | null)?.auditType || "").toLowerCase();
  return reason.includes("drift") || reason.includes("anomaly") || reason.includes("deviation") || auditType.includes("drift");
}

function normalizeContext(value?: string): OperationalIndependenceDomainContext {
  if (!value) return "generic";
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if ([
    "logistics",
    "freight",
    "3pl",
    "third-party-logistics",
    "warehouse",
    "warehousing",
    "carrier",
    "carrier-management",
    "transportation",
    "port-logistics",
    "supply-chain-logistics"
  ].includes(normalized)) {
    return "logistics";
  }
  return "generic";
}

function lowerMetaValue(meta: Record<string, unknown>, keys: string[]): string {
  return keys
    .map((key) => meta[key])
    .filter((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function logisticsText(event: GuardEventLike, meta: Record<string, unknown>): string {
  return `${event.module_code} ${event.reason} ${lowerMetaValue(meta, [
    "domain",
    "sector",
    "workflow",
    "eventType",
    "operation",
    "carrierId",
    "shipmentId",
    "loadId",
    "warehouseId",
    "exceptionType",
    "deliveryStatus",
    "pickupStatus",
    "status",
    "kpi",
    "system"
  ])}`.toLowerCase();
}

function isLogisticsEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  return /\b(logistics|freight|shipment|shipper|carrier|3pl|warehouse|wms|tms|load|lane|route|delivery|pickup|dock|inventory|putaway|pick|pack|pallet|container|sscc|epcis|edi|telematics|cold[\s-]?chain|otif|difot|demurrage|detention)\b/i.test(text);
}

function isShipmentEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const eventType = firstString(meta, ["eventType", "operation"]);
  if (eventType && /\b(exception|inventory|warehouse|cold_chain|condition)\b/i.test(eventType)) return false;
  const text = logisticsText(event, meta);
  return /\b(shipment|carrier|load|lane|route|delivery|pickup|tender|otif|difot|freight)\b/i.test(text);
}

function isFailedShipmentEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  if (firstBoolean(meta, ["onTime", "otif", "difot", "deliveredOnTime"]) === false) return true;
  if (firstBoolean(meta, ["failed", "damaged", "lost", "late", "missedPickup", "failedDelivery"]) === true) return true;
  return /\b(late|delayed|missed|failed|failure|damaged|lost|short|refused|exception|detention|demurrage)\b/i.test(text);
}

function isExceptionEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  return firstString(meta, ["exceptionType", "exceptionId"]) !== null ||
    /\b(exception|hold|damage|lost|late|delayed|missed|detention|demurrage|customs|quarantine|incident)\b/i.test(text);
}

function isExceptionResolved(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const resolved = firstBoolean(meta, ["resolved", "exceptionResolved", "closed"]);
  if (resolved !== null) return resolved;
  const status = lowerMetaValue(meta, ["status", "exceptionStatus"]);
  return /\b(resolved|closed|cleared|remediated)\b/.test(status) || /\bresolved|closed|cleared|remediated\b/i.test(event.reason);
}

function isWarehouseEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  return /\b(warehouse|wms|inventory|receiving|putaway|pick|pack|ship|cycle[\s-]?count|dock|stockout|short[\s-]?pick|adjustment)\b/i.test(text);
}

function isWarehouseError(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  if (firstBoolean(meta, ["inventoryMismatch", "inventoryAdjustment", "pickPackError", "stockout", "shortPick"]) === true) return true;
  return /\b(mismatch|adjustment|pick[\s-]?error|pack[\s-]?error|stockout|short[\s-]?pick|mis[-\s]?ship|cycle count variance)\b/i.test(text);
}

function isSlaEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  return firstBoolean(meta, ["slaBreached", "slaMet"]) !== null ||
    firstNumber(meta, ["slaMs", "slaTargetMs", "slaLatencyMs", "targetHours", "actualHours"]) !== null ||
    /\b(sla|slo|otif|difot|on[\s-]?time|service level|breach)\b/i.test(text);
}

function isSlaBreach(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const breached = firstBoolean(meta, ["slaBreached", "breached"]);
  if (breached !== null) return breached;
  const met = firstBoolean(meta, ["slaMet", "onTime", "otif", "difot"]);
  if (met === false) return true;
  const targetHours = firstNumber(meta, ["targetHours", "slaHours"]);
  const actualHours = firstNumber(meta, ["actualHours", "elapsedHours", "resolutionHours"]);
  if (targetHours !== null && actualHours !== null && actualHours > targetHours) return true;
  return /\b(sla breach|breached sla|missed sla|late|delayed|overdue)\b/i.test(`${event.reason} ${lowerMetaValue(meta, ["status"])}`);
}

function isTraceableLogisticsEvent(meta: Record<string, unknown>): boolean {
  return firstString(meta, [
    "traceId",
    "epcisEventId",
    "gs1EventId",
    "sscc",
    "lotId",
    "serialNumber",
    "containerId",
    "chainOfCustodyId",
    "signedEvidenceRef",
    "receiptId"
  ]) !== null;
}

function isColdChainEvent(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const text = logisticsText(event, meta);
  return firstNumber(meta, ["temperatureC", "temperatureF", "humidityPct", "shockG"]) !== null ||
    firstBoolean(meta, ["coldChain", "temperatureMonitored", "temperatureExcursion"]) !== null ||
    /\b(cold[\s-]?chain|temperature|humidity|reefer|seal|excursion|shock)\b/i.test(text);
}

function isColdChainExcursion(event: GuardEventLike, meta: Record<string, unknown>): boolean {
  const excursion = firstBoolean(meta, ["temperatureExcursion", "conditionExcursion", "coldChainBreach", "sealBroken"]);
  if (excursion !== null) return excursion;
  return /\b(excursion|out of range|temperature breach|seal broken|condition breach)\b/i.test(logisticsText(event, meta));
}

function boundedScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function metricNoEvidence(label: string): LogisticsReliabilityMetric {
  return {
    score: 0,
    evidenceEvents: 0,
    notes: [`No ${label} evidence was observed in logistics telemetry.`]
  };
}

export function scoreLogisticsOperationalReliabilityFromEvents(events: GuardEventLike[]): LogisticsReliabilityScore {
  const logisticsEvents = events
    .map((event) => ({ event, meta: parseMeta(event.meta_json) }))
    .filter(({ event, meta }) => isLogisticsEvent(event, meta));

  const carriers = [...new Set(
    logisticsEvents
      .map(({ meta }) => firstString(meta, ["carrierId", "carrier", "scac", "providerId"]))
      .filter((carrier): carrier is string => typeof carrier === "string" && carrier.trim().length > 0)
      .map((carrier) => sanitizeToken(carrier))
  )].sort((a, b) => a.localeCompare(b));

  const shipmentEvents = logisticsEvents.filter(({ event, meta }) => isShipmentEvent(event, meta));
  const failedShipmentEvents = shipmentEvents.filter(({ event, meta }) => isFailedShipmentEvent(event, meta));
  const onTimeRate = shipmentEvents.length > 0 ? (shipmentEvents.length - failedShipmentEvents.length) / shipmentEvents.length : 0;
  const carrierReliability: LogisticsReliabilityScore["carrierReliability"] = shipmentEvents.length === 0
    ? { ...metricNoEvidence("carrier shipment"), shipmentEvents: 0, failedShipmentEvents: 0, onTimeRate: 0 }
    : {
      score: boundedScore(onTimeRate * 100),
      evidenceEvents: shipmentEvents.length,
      shipmentEvents: shipmentEvents.length,
      failedShipmentEvents: failedShipmentEvents.length,
      onTimeRate: Number(onTimeRate.toFixed(4)),
      notes: failedShipmentEvents.length === 0
        ? ["Carrier shipment evidence shows no late, missed, damaged, or lost shipment signal."]
        : [`${failedShipmentEvents.length} of ${shipmentEvents.length} carrier shipment event(s) indicate late, missed, damaged, lost, or failed execution.`]
    };

  const exceptionEvents = logisticsEvents.filter(({ event, meta }) => isExceptionEvent(event, meta));
  const resolvedExceptions = exceptionEvents.filter(({ event, meta }) => isExceptionResolved(event, meta));
  const unresolvedExceptions = exceptionEvents.length - resolvedExceptions.length;
  const resolutionHours = exceptionEvents
    .map(({ meta }) => firstNumber(meta, ["resolutionHours", "timeToResolveHours", "exceptionAgeHours"]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const exceptionResolutionRate = exceptionEvents.length > 0 ? resolvedExceptions.length / exceptionEvents.length : 1;
  const avgResolutionHours = avgOrNull(resolutionHours);
  const resolutionTimeBonus = avgResolutionHours === null ? 15 : avgResolutionHours <= 4 ? 30 : avgResolutionHours <= 24 ? 20 : 5;
  const exceptionManagement: LogisticsReliabilityScore["exceptionManagement"] = exceptionEvents.length === 0
    ? {
      score: logisticsEvents.length > 0 ? 100 : 0,
      evidenceEvents: 0,
      exceptionEvents: 0,
      resolvedExceptions: 0,
      unresolvedExceptions: 0,
      avgResolutionHours: null,
      notes: logisticsEvents.length > 0
        ? ["No delivery, warehouse, or carrier exceptions were observed in this logistics window."]
        : ["No exception evidence was observed in logistics telemetry."]
    }
    : {
      score: boundedScore(exceptionResolutionRate * 70 + resolutionTimeBonus),
      evidenceEvents: exceptionEvents.length,
      exceptionEvents: exceptionEvents.length,
      resolvedExceptions: resolvedExceptions.length,
      unresolvedExceptions,
      avgResolutionHours,
      notes: unresolvedExceptions === 0
        ? ["All observed logistics exceptions have closure evidence."]
        : [`${unresolvedExceptions} logistics exception(s) lack closure evidence.`]
    };

  const warehouseEvents = logisticsEvents.filter(({ event, meta }) => isWarehouseEvent(event, meta));
  const warehouseErrors = warehouseEvents.filter(({ event, meta }) => isWarehouseError(event, meta));
  const inventoryAccuracyValues = warehouseEvents
    .map(({ meta }) => firstNumber(meta, ["inventoryAccuracy", "inventoryAccuracyRate", "cycleCountAccuracy"]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => value > 1 ? value / 100 : value)
    .filter((value) => value >= 0 && value <= 1);
  const inventoryAccuracy = avgOrNull(inventoryAccuracyValues);
  const warehouseScore = inventoryAccuracy !== null
    ? inventoryAccuracy * 100 - Math.min(40, warehouseErrors.length * 8)
    : warehouseEvents.length > 0
      ? ((warehouseEvents.length - warehouseErrors.length) / warehouseEvents.length) * 100
      : 0;
  const warehouseIntegrity: LogisticsReliabilityScore["warehouseIntegrity"] = warehouseEvents.length === 0
    ? { ...metricNoEvidence("warehouse/WMS"), warehouseEvents: 0, errorEvents: 0, inventoryAccuracy: null }
    : {
      score: boundedScore(warehouseScore),
      evidenceEvents: warehouseEvents.length,
      warehouseEvents: warehouseEvents.length,
      errorEvents: warehouseErrors.length,
      inventoryAccuracy,
      notes: warehouseErrors.length === 0
        ? ["Warehouse/WMS evidence shows no inventory mismatch, stockout, or pick-pack error signal."]
        : [`${warehouseErrors.length} warehouse integrity event(s) indicate inventory mismatch, stockout, adjustment, or pick-pack error.`]
    };

  const slaEvents = logisticsEvents.filter(({ event, meta }) => isSlaEvent(event, meta));
  const breachEvents = slaEvents.filter(({ event, meta }) => isSlaBreach(event, meta));
  const breachRate = slaEvents.length > 0 ? breachEvents.length / slaEvents.length : 0;
  const slaPerformance: LogisticsReliabilityScore["slaPerformance"] = slaEvents.length === 0
    ? { ...metricNoEvidence("SLA/OTIF"), slaEvents: 0, breachEvents: 0, breachRate: 0 }
    : {
      score: boundedScore((1 - breachRate) * 100),
      evidenceEvents: slaEvents.length,
      slaEvents: slaEvents.length,
      breachEvents: breachEvents.length,
      breachRate: Number(breachRate.toFixed(4)),
      notes: breachEvents.length === 0
        ? ["SLA/OTIF evidence shows no breach signal."]
        : [`${breachEvents.length} of ${slaEvents.length} SLA/OTIF event(s) breached target.`]
    };

  const traceableEvents = logisticsEvents.filter(({ meta }) => isTraceableLogisticsEvent(meta));
  const traceCoverage = logisticsEvents.length > 0 ? traceableEvents.length / logisticsEvents.length : 0;
  const traceabilityCoverage: LogisticsReliabilityScore["traceabilityCoverage"] = logisticsEvents.length === 0
    ? { ...metricNoEvidence("GS1/EPCIS or custody traceability"), traceableEvents: 0, coverage: 0 }
    : {
      score: boundedScore(traceCoverage * 100),
      evidenceEvents: logisticsEvents.length,
      traceableEvents: traceableEvents.length,
      coverage: Number(traceCoverage.toFixed(4)),
      notes: traceCoverage >= 0.9
        ? ["Most logistics events carry trace, custody, SSCC, lot, EPCIS, or receipt identifiers."]
        : [`${logisticsEvents.length - traceableEvents.length} logistics event(s) lack trace/custody identifiers.`]
    };

  const coldChainEvents = logisticsEvents.filter(({ event, meta }) => isColdChainEvent(event, meta));
  const excursionEvents = coldChainEvents.filter(({ event, meta }) => isColdChainExcursion(event, meta));
  const excursionRate = coldChainEvents.length > 0 ? excursionEvents.length / coldChainEvents.length : 0;
  const coldChainIntegrity: LogisticsReliabilityScore["coldChainIntegrity"] = coldChainEvents.length === 0
    ? {
      score: logisticsEvents.length > 0 ? 100 : 0,
      evidenceEvents: 0,
      monitoredEvents: 0,
      excursionEvents: 0,
      excursionRate: 0,
      notes: logisticsEvents.length > 0
        ? ["No cold-chain or condition-sensitive freight evidence was observed; this component is neutral for non-cold-chain windows."]
        : ["No cold-chain evidence was observed in logistics telemetry."]
    }
    : {
      score: boundedScore((1 - excursionRate) * 100),
      evidenceEvents: coldChainEvents.length,
      monitoredEvents: coldChainEvents.length,
      excursionEvents: excursionEvents.length,
      excursionRate: Number(excursionRate.toFixed(4)),
      notes: excursionEvents.length === 0
        ? ["Condition-sensitive freight evidence shows no excursion signal."]
        : [`${excursionEvents.length} condition-sensitive freight event(s) indicate excursion or custody breach.`]
    };

  const score = boundedScore(
    carrierReliability.score * 0.22 +
    exceptionManagement.score * 0.18 +
    warehouseIntegrity.score * 0.18 +
    slaPerformance.score * 0.18 +
    traceabilityCoverage.score * 0.14 +
    coldChainIntegrity.score * 0.10
  );
  const telemetryConfidence = Number(Math.min(1, 0.25 + logisticsEvents.length / 40).toFixed(4));
  const status: LogisticsReliabilityScore["status"] =
    score >= 85 && telemetryConfidence >= 0.7 ? "ready" : score >= 70 ? "watch" : score >= 45 ? "degrading" : "critical";

  const gaps: string[] = [];
  const recommendedActions: string[] = [];
  const components: Array<[string, LogisticsReliabilityMetric, string]> = [
    ["carrier reliability", carrierReliability, "Bind carrier routing to signed OTIF/DIFOT and damage/loss scorecards."],
    ["exception management", exceptionManagement, "Add owner, SLA timer, escalation, and closure evidence for every logistics exception."],
    ["warehouse integrity", warehouseIntegrity, "Connect WMS receiving, inventory, cycle-count, pick, pack, and ship evidence to agent decisions."],
    ["SLA performance", slaPerformance, "Emit SLA/OTIF breach events with target, actual, lane, carrier, and corrective-action fields."],
    ["traceability coverage", traceabilityCoverage, "Add EPCIS/GS1, SSCC, lot, custody, or signed receipt identifiers to logistics events."],
    ["cold-chain integrity", coldChainIntegrity, "Gate condition-sensitive freight on excursion telemetry and release/quarantine evidence."]
  ];
  for (const [label, metric, action] of components) {
    if (metric.score < 70) {
      gaps.push(`${label}: ${metric.score}/100`);
      recommendedActions.push(action);
    }
  }
  if (logisticsEvents.length === 0) {
    gaps.push("logistics telemetry: no logistics events detected");
    recommendedActions.push("Emit logistics guard events with domain=logistics, shipment/carrier/warehouse identifiers, SLA fields, and traceability IDs.");
  }

  return {
    score,
    status,
    logisticsEventCount: logisticsEvents.length,
    telemetryConfidence,
    carriers,
    carrierReliability,
    exceptionManagement,
    warehouseIntegrity,
    slaPerformance,
    traceabilityCoverage,
    coldChainIntegrity,
    gaps,
    recommendedActions: [...new Set(recommendedActions)]
  };
}

function dependencySamples(events: GuardEventLike[]): DependencySample[] {
  const out: DependencySample[] = [];
  for (const event of events) {
    const meta = parseMeta(event.meta_json);
    const dep = inferDependency(event, meta);
    if (!dep.isExternal || !dep.dependencyId) continue;
    const ts = new Date(event.created_at).getTime();
    if (!Number.isFinite(ts)) continue;
    out.push({
      ts,
      createdAt: event.created_at,
      dependencyId: dep.dependencyId,
      kind: dep.kind,
      provider: dep.provider,
      version: dep.version,
      failure: isDependencyFailure(event, meta),
      fallback: isFallbackSignal(event, meta),
      degradedMode: isDegradedModeSignal(event, meta),
      latencyMs: extractLatencyMs(meta, event.reason || "")
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function buildExternalDependencyInventory(
  events: GuardEventLike[]
): ExternalDependencyInventory {
  const samples = dependencySamples(events);
  const byDependency = new Map<
    string,
    {
      kind: ExternalDependencyKind;
      providers: Set<string>;
      versions: Set<string>;
      usageEvents: number;
      failureEvents: number;
      latencies: number[];
      supportsFallback: boolean;
      lastSeenAt: string;
    }
  >();

  for (const sample of samples) {
    const bucket =
      byDependency.get(sample.dependencyId) ??
      {
        kind: sample.kind,
        providers: new Set<string>(),
        versions: new Set<string>(),
        usageEvents: 0,
        failureEvents: 0,
        latencies: [],
        supportsFallback: false,
        lastSeenAt: sample.createdAt
      };
    bucket.kind = bucket.kind === "unknown" ? sample.kind : bucket.kind;
    bucket.usageEvents += 1;
    if (sample.failure) bucket.failureEvents += 1;
    if (sample.provider) bucket.providers.add(sample.provider);
    if (sample.version && sample.version.trim().length > 0) bucket.versions.add(sample.version.trim());
    if (typeof sample.latencyMs === "number" && Number.isFinite(sample.latencyMs)) bucket.latencies.push(sample.latencyMs);
    bucket.supportsFallback = bucket.supportsFallback || sample.fallback || sample.degradedMode;
    if (sample.createdAt > bucket.lastSeenAt) bucket.lastSeenAt = sample.createdAt;
    byDependency.set(sample.dependencyId, bucket);
  }

  const dependencies: ExternalDependencyInventoryEntry[] = Array.from(byDependency.entries())
    .map(([dependencyId, row]) => {
      const failureRate = row.usageEvents > 0 ? row.failureEvents / row.usageEvents : 0;
      const avgLatencyMs =
        row.latencies.length > 0 ? Math.round(row.latencies.reduce((sum, value) => sum + value, 0) / row.latencies.length) : null;
      const p95LatencyMs = row.latencies.length > 0 ? Math.round(percentile(row.latencies, 95)) : null;
      return {
        dependencyId,
        kind: row.kind,
        providers: [...row.providers].sort((a, b) => a.localeCompare(b)),
        versions: [...row.versions].sort((a, b) => a.localeCompare(b)),
        usageEvents: row.usageEvents,
        failureEvents: row.failureEvents,
        failureRate,
        avgLatencyMs,
        p95LatencyMs,
        supportsFallback: row.supportsFallback,
        lastSeenAt: row.lastSeenAt
      };
    })
    .sort((a, b) => b.usageEvents - a.usageEvents || b.failureRate - a.failureRate || a.dependencyId.localeCompare(b.dependencyId));

  const singlePointsOfFailure = dependencies
    .filter((dep) => dep.usageEvents >= 3 && dep.providers.length <= 1 && !dep.supportsFallback && dep.failureRate >= 0.05)
    .map((dep) => dep.dependencyId);

  return {
    totalDependencies: dependencies.length,
    externalEventCount: samples.length,
    dependencyCoverage: events.length > 0 ? samples.length / events.length : 0,
    singlePointsOfFailure,
    dependencies
  };
}

function driftSeverityWeight(severity: DependencyDriftSignal["severity"]): number {
  if (severity === "critical") return 30;
  if (severity === "high") return 18;
  if (severity === "medium") return 10;
  return 5;
}

function errorRate(samples: DependencySample[]): number {
  if (samples.length === 0) return 0;
  return samples.filter((row) => row.failure).length / samples.length;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function detectDependencyDrift(
  events: GuardEventLike[],
  inventory = buildExternalDependencyInventory(events)
): DependencyDriftReport {
  const samples = dependencySamples(events);
  const byDependency = new Map<string, DependencySample[]>();
  for (const sample of samples) {
    const bucket = byDependency.get(sample.dependencyId) ?? [];
    bucket.push(sample);
    byDependency.set(sample.dependencyId, bucket);
  }

  const signals: DependencyDriftSignal[] = [];
  let versionDriftCount = 0;
  let slaDegradationCount = 0;

  for (const dep of inventory.dependencies) {
    const depSamples = (byDependency.get(dep.dependencyId) ?? []).sort((a, b) => a.ts - b.ts);
    if (depSamples.length < 2) continue;

    const versions = [...new Set(depSamples.map((row) => row.version).filter((row): row is string => typeof row === "string" && row.length > 0))];
    if (versions.length > 1) {
      versionDriftCount += 1;
      signals.push({
        dependencyId: dep.dependencyId,
        driftType: "version",
        severity: versions.length >= 4 ? "high" : "medium",
        summary: `Dependency version changed ${versions.length} times in the analysis window.`,
        baseline: versions[0] ?? null,
        current: versions[versions.length - 1] ?? null,
        delta: null
      });
    }

    const splitIndex = Math.floor(depSamples.length / 2);
    if (splitIndex < 1 || depSamples.length - splitIndex < 1) continue;
    const early = depSamples.slice(0, splitIndex);
    const late = depSamples.slice(splitIndex);

    const earlyErrorRate = errorRate(early);
    const lateErrorRate = errorRate(late);
    const errorDelta = lateErrorRate - earlyErrorRate;
    if (errorDelta >= 0.15 && lateErrorRate >= 0.2) {
      slaDegradationCount += 1;
      signals.push({
        dependencyId: dep.dependencyId,
        driftType: "error_rate",
        severity: errorDelta >= 0.35 ? "critical" : errorDelta >= 0.2 ? "high" : "medium",
        summary: "Dependency failure rate increased materially across the window.",
        baseline: Number(earlyErrorRate.toFixed(4)),
        current: Number(lateErrorRate.toFixed(4)),
        delta: Number(errorDelta.toFixed(4))
      });
    }

    const earlyLatency = early.map((row) => row.latencyMs).filter((row): row is number => typeof row === "number" && Number.isFinite(row));
    const lateLatency = late.map((row) => row.latencyMs).filter((row): row is number => typeof row === "number" && Number.isFinite(row));
    if (earlyLatency.length >= 2 && lateLatency.length >= 2) {
      const earlyAvg = average(earlyLatency);
      const lateAvg = average(lateLatency);
      const latencyDelta = lateAvg - earlyAvg;
      if (lateAvg >= earlyAvg * 1.35 && latencyDelta >= 100) {
        slaDegradationCount += 1;
        signals.push({
          dependencyId: dep.dependencyId,
          driftType: "sla_latency",
          severity: latencyDelta >= 500 ? "high" : "medium",
          summary: "Dependency latency is degrading versus early-window baseline.",
          baseline: Math.round(earlyAvg),
          current: Math.round(lateAvg),
          delta: Math.round(latencyDelta)
        });
      }
    }
  }

  const penalty = signals.reduce((sum, signal) => sum + driftSeverityWeight(signal.severity), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status: DependencyDriftReport["status"] =
    score >= 80 ? "stable" : score >= 60 ? "watch" : score >= 35 ? "degrading" : "critical";

  return {
    score,
    status,
    driftEvents: signals.length,
    versionDriftCount,
    slaDegradationCount,
    signals
  };
}

export function scoreGracefulDegradation(
  events: GuardEventLike[]
): GracefulDegradationScore {
  const samples = dependencySamples(events);
  const failureSamples = samples.filter((sample) => sample.failure);
  const degradedModeActivations = samples.filter((sample) => sample.degradedMode).length;

  if (failureSamples.length === 0) {
    return {
      score: 100,
      failureEvents: 0,
      recoveredWithFallback: 0,
      degradedModeActivations,
      hardFailures: 0,
      recoveryRate: 1,
      notes: ["No dependency failures observed in this window."]
    };
  }

  const recoveryWindowMs = 6 * 60 * 60 * 1000;
  let recoveredWithFallback = 0;
  let hardFailures = 0;

  for (const failure of failureSamples) {
    const recovered = samples.some(
      (candidate) =>
        candidate.dependencyId === failure.dependencyId &&
        candidate.ts > failure.ts &&
        candidate.ts - failure.ts <= recoveryWindowMs &&
        (candidate.fallback || candidate.degradedMode || !candidate.failure)
    );
    if (recovered) recoveredWithFallback += 1;
    else hardFailures += 1;
  }

  const recoveryRate = recoveredWithFallback / failureSamples.length;
  const degradedActivationRate = Math.min(1, degradedModeActivations / failureSamples.length);
  const hardFailureRate = hardFailures / failureSamples.length;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(recoveryRate * 60 + degradedActivationRate * 25 + (1 - hardFailureRate) * 15)
    )
  );

  const notes: string[] = [];
  if (recoveryRate < 0.5) notes.push("Less than half of dependency failures recovered through fallback/degraded operation.");
  if (hardFailures > 0) notes.push(`${hardFailures} dependency failure(s) had no recovery signal within 6h.`);
  if (notes.length === 0) notes.push("Fallback and degraded execution patterns are visible during dependency failures.");

  return {
    score,
    failureEvents: failureSamples.length,
    recoveredWithFallback,
    degradedModeActivations,
    hardFailures,
    recoveryRate,
    notes
  };
}

export function scoreVendorLockInRisk(
  inventory: ExternalDependencyInventory
): VendorLockInRiskScore {
  if (inventory.totalDependencies === 0) {
    return {
      score: 0,
      riskLevel: "low",
      primaryVendors: [],
      multiVendorCoverage: 1,
      portableDependencies: 0,
      nonPortableDependencies: 0,
      lockInDrivers: [],
      recommendations: ["No external dependencies detected in this telemetry window."]
    };
  }

  const vendorCounts = new Map<string, number>();
  let portableDependencies = 0;
  let nonPortableDependencies = 0;
  let llmSingleVendor = 0;

  for (const dep of inventory.dependencies) {
    const depVendors = dep.providers.length > 0 ? dep.providers : [dep.dependencyId];
    for (const vendor of depVendors) {
      vendorCounts.set(vendor, (vendorCounts.get(vendor) ?? 0) + dep.usageEvents);
    }

    const localPortable = /\b(local|self-hosted|selfhosted|onprem|on-prem|internal)\b/.test(dep.dependencyId);
    const portable = dep.supportsFallback || dep.providers.length > 1 || localPortable;
    if (portable) portableDependencies += 1;
    else nonPortableDependencies += 1;

    if (dep.kind === "llm_api" && dep.providers.length <= 1 && !dep.supportsFallback) {
      llmSingleVendor += 1;
    }
  }

  const multiVendorCoverage = inventory.totalDependencies > 0 ? portableDependencies / inventory.totalDependencies : 1;
  const nonPortableRatio = inventory.totalDependencies > 0 ? nonPortableDependencies / inventory.totalDependencies : 0;

  let score = Math.round(nonPortableRatio * 60);
  score += Math.min(25, llmSingleVendor * 15);
  score += Math.min(20, inventory.singlePointsOfFailure.length * 8);
  if (multiVendorCoverage >= 0.75) score -= 15;
  score = Math.max(0, Math.min(100, score));

  const riskLevel: VendorLockInRiskScore["riskLevel"] =
    score >= 75 ? "critical" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";

  const primaryVendors = [...vendorCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([vendor]) => vendor);

  const lockInDrivers: string[] = [];
  if (nonPortableDependencies > 0) {
    lockInDrivers.push(`${nonPortableDependencies} dependency(ies) are single-vendor with no fallback evidence.`);
  }
  if (llmSingleVendor > 0) {
    lockInDrivers.push(`LLM routing appears single-provider on ${llmSingleVendor} dependency stream(s).`);
  }
  if (inventory.singlePointsOfFailure.length > 0) {
    lockInDrivers.push(`Single points of failure detected: ${inventory.singlePointsOfFailure.join(", ")}.`);
  }

  const recommendations: string[] = [];
  if (llmSingleVendor > 0) recommendations.push("Configure secondary LLM providers and exercise failover paths in production drills.");
  if (nonPortableDependencies > 0) recommendations.push("Add export/migration playbooks for non-portable dependencies.");
  if (inventory.singlePointsOfFailure.length > 0) recommendations.push("Prioritize fallback contracts for detected single points of failure.");
  if (recommendations.length === 0) recommendations.push("Keep periodic portability drills to preserve low lock-in risk.");

  return {
    score,
    riskLevel,
    primaryVendors,
    multiVendorCoverage,
    portableDependencies,
    nonPortableDependencies,
    lockInDrivers,
    recommendations
  };
}

function scoreReducedExternalAccess(
  inventory: ExternalDependencyInventory,
  graceful: GracefulDegradationScore,
  drift: DependencyDriftReport,
  lockIn: VendorLockInRiskScore
): number {
  if (inventory.totalDependencies === 0) return 100;
  const fallbackCoverage =
    inventory.totalDependencies > 0 ? inventory.dependencies.filter((dep) => dep.supportsFallback).length / inventory.totalDependencies : 0;
  const portability = inventory.totalDependencies > 0 ? lockIn.portableDependencies / inventory.totalDependencies : 0;
  const stability = drift.score / 100;
  const recovery = graceful.recoveryRate;
  return Math.max(
    0,
    Math.min(100, Math.round((fallbackCoverage * 0.45 + portability * 0.25 + recovery * 0.2 + stability * 0.1) * 100))
  );
}

function computeAutonomyRunStats(
  events: GuardEventLike[]
): {
  longestRunDays: number;
  escalationRate: number;
  driftEvents: number;
  qualityHeld: boolean;
} {
  const byDay = new Map<string, DayFlags[]>();
  let driftEvents = 0;
  for (const event of events) {
    const day = new Date(event.created_at).toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? [];
    const flags: DayFlags = {
      humanApproval: isHumanIntervention(event),
      drift: isDrift(event)
    };
    bucket.push(flags);
    byDay.set(day, bucket);
    if (flags.drift) driftEvents += 1;
  }

  const days = toDayList(events);
  let longestRunDays = 0;
  let currentRun = 0;
  for (const day of days) {
    const hasHuman = byDay.get(day)?.some((entry) => entry.humanApproval) ?? false;
    if (!hasHuman) {
      currentRun += 1;
      longestRunDays = Math.max(longestRunDays, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const escalated = events.filter((e) => e.decision === "stepup" || e.decision === "warn").length;
  const escalationRate = events.length === 0 ? 100 : Math.round((escalated / events.length) * 100);

  const hasCritical = events.some((e) => String(e.severity).toLowerCase() === "critical");
  const driftInWindow = driftEvents > 0;
  const qualityHeld = events.length > 0 && !hasCritical && !driftInWindow;

  return {
    longestRunDays,
    escalationRate,
    driftEvents,
    qualityHeld
  };
}

export function scoreOperationalIndependenceFromEvents(
  events: GuardEventLike[],
  windowDays = 30,
  options: OperationalIndependenceOptions = {}
): OperationalIndependenceScore {
  const sortedEvents = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const context = normalizeContext(options.domain);
  const base = computeAutonomyRunStats(sortedEvents);
  const externalDependencyInventory = buildExternalDependencyInventory(sortedEvents);
  const dependencyDrift = detectDependencyDrift(sortedEvents, externalDependencyInventory);
  const gracefulDegradation = scoreGracefulDegradation(sortedEvents);
  const vendorLockInRisk = scoreVendorLockInRisk(externalDependencyInventory);
  const logisticsReliability = context === "logistics"
    ? scoreLogisticsOperationalReliabilityFromEvents(sortedEvents)
    : undefined;
  const reducedExternalAccessScore = scoreReducedExternalAccess(
    externalDependencyInventory,
    gracefulDegradation,
    dependencyDrift,
    vendorLockInRisk
  );

  const runComponent = Math.min(30, (base.longestRunDays / Math.max(windowDays, 1)) * 30);
  const escalationComponent = Math.max(0, 20 - base.escalationRate * 0.2);
  const qualityComponent = base.qualityHeld ? 10 : 0;
  const dependencyDriftComponent = (dependencyDrift.score / 100) * 15;
  const gracefulDegradationComponent = (gracefulDegradation.score / 100) * 15;
  const portabilityComponent = ((100 - vendorLockInRisk.score) / 100) * 10;
  const reducedExternalAccessComponent = (reducedExternalAccessScore / 100) * 20;

  const rawScore =
    runComponent +
    escalationComponent +
    qualityComponent +
    dependencyDriftComponent +
    gracefulDegradationComponent +
    portabilityComponent +
    reducedExternalAccessComponent;
  const telemetryConfidence = sortedEvents.length === 0 ? 0.35 : Math.min(1, 0.35 + sortedEvents.length / 60);
  const score = Math.max(0, Math.min(100, Math.round(rawScore * telemetryConfidence)));

  return {
    score,
    context,
    longestRunDays: base.longestRunDays,
    escalationRate: base.escalationRate,
    driftEvents: base.driftEvents,
    qualityHeld: base.qualityHeld,
    telemetryConfidence: Number(telemetryConfidence.toFixed(4)),
    reducedExternalAccessScore,
    externalDependencyInventory,
    dependencyDrift,
    gracefulDegradation,
    vendorLockInRisk,
    ...(logisticsReliability ? { logisticsReliability } : {})
  };
}

export function scoreOperationalIndependence(
  agentId: string,
  windowDays = 30,
  options: OperationalIndependenceOptions = {}
): OperationalIndependenceScore {
  const events = readGuardEvents(agentId, windowDays * 24).map((ev) => ({
    created_at: ev.created_at,
    module_code: ev.module_code,
    decision: ev.decision,
    reason: ev.reason,
    severity: ev.severity,
    meta_json: ev.meta_json
  }));
  return scoreOperationalIndependenceFromEvents(events, windowDays, options);
}
