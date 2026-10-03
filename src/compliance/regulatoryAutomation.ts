/**
 * Regulatory Automation Engine for AMC Comply
 *
 * Polling regulatory monitor with:
 * - Feed ingestion from RSS and JSON APIs (web pages are listed but disabled; see regulatory/feeds.ts)
 * - Automatic change detection with diff analysis
 * - Impact scoring and prioritized gap analysis
 * - Dynamic policy adjustment recommendations
 * - Audit trail for all regulatory changes
 */

import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { DEFAULT_REGULATORY_FEEDS } from "./regulatory/feeds.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RegulatoryChange {
  id: string;
  framework: string;
  changeType: "new_requirement" | "amendment" | "deprecation" | "guidance_update" | "enforcement_action" | "interpretation";
  title: string;
  description: string;
  effectiveDate: number;
  publishedDate: number;
  impactedControls: string[];
  source: string;
  sourceType: "rss" | "api" | "manual" | "web_scrape";
  severity: "critical" | "high" | "medium" | "low";
  /** Raw text diff from previous version (if amendment) */
  diff?: string;
  /** Jurisdictions affected */
  jurisdictions: string[];
  /** Whether this has been reviewed by a human */
  humanReviewed: boolean;
  /** Hash of the source content for change detection */
  contentHash: string;
  /** True when the source gave no effective date and effectiveDate is a placeholder (publication + 90 days), not a legal date. */
  effectiveDateEstimated?: boolean;
}

export interface RegulatoryFeed {
  id: string;
  name: string;
  framework: string;
  type: "rss" | "api" | "web_scrape";
  url: string;
  /** CSS selector or JSON path for content extraction */
  selector?: string;
  /** How often to check (ms) */
  pollIntervalMs: number;
  lastChecked: number;
  lastContentHash: string;
  enabled: boolean;
  /** Number of consecutive failures */
  failureCount: number;
  /** Jurisdictions this feed covers */
  jurisdictions: string[];
  /** "live": official machine-readable endpoint, polled. "manual-review-required": listed for humans, disabled. */
  contract?: "live" | "manual-review-required";
  /** Published by a regulator, legislature, standards body or government. */
  official?: boolean;
  /** Last recorded HTTP status of a GET to `url` (null when it did not answer). */
  reachability?: { status: number | null; checkedAt: string };
  manualReviewReason?: string;
}

export interface FeedCheckResult {
  feedId: string;
  timestamp: number;
  status: "unchanged" | "changed" | "new_content" | "error";
  changes: RegulatoryChange[];
  error?: string;
  responseTimeMs: number;
}

export interface ComplianceGapAnalysis {
  id: string;
  timestamp: number;
  regulatoryChange: RegulatoryChange;
  currentCoverage: number;
  projectedCoverage: number;
  gaps: ComplianceGap[];
  remediationPlan: RemediationStep[];
  daysUntilEffective: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  estimatedRemediationHours: number;
}

export interface ComplianceGap {
  controlId: string;
  controlName: string;
  currentStatus: "covered" | "partial" | "uncovered";
  requiredStatus: "mandatory" | "recommended" | "optional";
  amcModules: string[];
  estimatedEffort: "trivial" | "moderate" | "significant" | "major";
  /** Specific technical requirements */
  technicalDetails: string;
}

export interface RemediationStep {
  order: number;
  action: string;
  amcModule: string;
  amcCommand?: string;
  estimatedHours: number;
  priority: "critical" | "high" | "medium" | "low";
  /** Dependencies on other steps */
  dependsOn: number[];
}

export interface RegulatoryImpactAssessment {
  id: string;
  timestamp: number;
  change: RegulatoryChange;
  affectedAgents: number;
  affectedDimensions: string[];
  scoreImpact: Array<{ dimension: string; currentAvg: number; projectedAvg: number; delta: number }>;
  complianceRisk: number;
  timeToCompliance: number;
  recommendations: string[];
  /** Cost estimate for full remediation */
  estimatedCost: { hours: number; complexity: "low" | "medium" | "high" };
}

export interface RegulatoryMonitorConfig {
  feeds: RegulatoryFeed[];
  checkIntervalMs: number;
  autoAnalyze: boolean;
  notifyOnCritical: boolean;
  /** Max consecutive failures before disabling a feed */
  maxFeedFailures: number;
  /** Jurisdictions to monitor */
  jurisdictions: string[];
  /** HTTP client used to read feeds; defaults to globalThis.fetch. Inject one in tests so nothing reaches the network. */
  fetchImpl?: FeedFetch;
}

/** The subset of the WHATWG fetch signature the monitor needs. */
export type FeedFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// ── Built-in Regulatory Feeds ──────────────────────────────────────────────
// Data, fetch contract and recorded reachability live in regulatory/feeds.ts.

export { DEFAULT_REGULATORY_FEEDS } from "./regulatory/feeds.js";

// ── AMC Control → Module Mapping ───────────────────────────────────────────

const CONTROL_TO_AMC_MODULE: Record<string, string[]> = {
  // EU AI Act
  risk_management: ["score", "enforce"],
  data_governance: ["vault", "comply"],
  transparency: ["passport", "score"],
  human_oversight: ["enforce", "watch"],
  accuracy: ["score", "eval"],
  robustness: ["shield", "score"],
  cybersecurity: ["shield", "vault"],
  record_keeping: ["audit", "ledger"],
  quality_management: ["score", "enforce"],
  conformity_assessment: ["comply", "cert"],

  // NIST AI RMF
  map_1_1: ["score", "diagnostic"],
  map_1_5: ["shield", "score"],
  measure_2_6: ["eval", "bench"],
  manage_3_1: ["enforce", "watch"],
  govern_1_2: ["enforce", "comply"],
  govern_1_7: ["comply", "audit"],

  // ISO 42001
  a_6_2: ["enforce", "comply"],
  a_8_4: ["score", "watch"],
  a_9_3: ["eval", "bench"],
  a_10_1: ["shield", "enforce"],

  // OWASP LLM
  prompt_injection: ["shield", "guardrails"],
  insecure_output: ["truthguard", "shield"],
  training_data_poisoning: ["vault", "shield"],
  model_denial_of_service: ["shield", "enforce"],
  supply_chain: ["bom", "shield"],
  sensitive_disclosure: ["vault", "dlp"],
  insecure_plugin: ["shield", "enforce"],
  excessive_agency: ["enforce", "watch"],
  overreliance: ["score", "transparency"],
  model_theft: ["vault", "shield"],
};

const CONTROL_TO_DIMENSION: Record<string, string> = {
  risk_management: "governance", data_governance: "privacy",
  transparency: "transparency", human_oversight: "governance",
  accuracy: "evaluation", robustness: "reliability", cybersecurity: "security",
  record_keeping: "governance", quality_management: "evaluation",
  map_1_1: "governance", map_1_5: "safety", measure_2_6: "evaluation",
  manage_3_1: "governance", govern_1_2: "governance",
  a_6_2: "governance", a_8_4: "reliability", a_9_3: "evaluation", a_10_1: "safety",
  prompt_injection: "security", insecure_output: "safety",
  training_data_poisoning: "security", excessive_agency: "governance",
};

// ── Regulatory Monitor Engine ──────────────────────────────────────────────

export class RegulatoryMonitor extends EventEmitter {
  private config: RegulatoryMonitorConfig;
  private feeds: Map<string, RegulatoryFeed>;
  private changeLog: RegulatoryChange[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config?: Partial<RegulatoryMonitorConfig>) {
    super();
    this.config = {
      feeds: config?.feeds ?? DEFAULT_REGULATORY_FEEDS,
      checkIntervalMs: config?.checkIntervalMs ?? 3600000,
      autoAnalyze: config?.autoAnalyze ?? true,
      notifyOnCritical: config?.notifyOnCritical ?? true,
      maxFeedFailures: config?.maxFeedFailures ?? 5,
      jurisdictions: config?.jurisdictions ?? ["GLOBAL", "EU", "US"],
      fetchImpl: config?.fetchImpl,
    };

    this.feeds = new Map();
    for (const feed of this.config.feeds) {
      if (this.config.jurisdictions.some(j => feed.jurisdictions.includes(j))) {
        this.feeds.set(feed.id, { ...feed });
      }
    }
  }

  /**
   * Start the regulatory monitoring daemon.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.emit("started", { feedCount: this.feeds.size });
    void this.checkAllFeeds();
    this.timer = setInterval(() => void this.checkAllFeeds(), this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.emit("stopped");
  }

  /**
   * Check all enabled feeds for changes.
   */
  async checkAllFeeds(): Promise<FeedCheckResult[]> {
    const results: FeedCheckResult[] = [];

    for (const [id, feed] of this.feeds) {
      if (!feed.enabled) continue;

      // Skip if not due for check
      const elapsed = Date.now() - feed.lastChecked;
      if (elapsed < feed.pollIntervalMs && feed.lastChecked > 0) continue;

      try {
        const result = await this.checkFeed(feed);
        results.push(result);

        // Reset failure count on success
        feed.failureCount = 0;
        feed.lastChecked = Date.now();

        if (result.changes.length > 0) {
          this.changeLog.push(...result.changes);
          this.emit("changes", { feedId: id, changes: result.changes });

          // Auto-analyze if enabled
          if (this.config.autoAnalyze) {
            for (const change of result.changes) {
              const gap = this.analyzeGap(change);
              this.emit("gapAnalysis", gap);

              if (this.config.notifyOnCritical && (change.severity === "critical" || gap.riskLevel === "critical")) {
                this.emit("criticalAlert", { change, gap });
              }
            }
          }
        }
      } catch (err) {
        feed.failureCount++;
        results.push({
          feedId: id,
          timestamp: Date.now(),
          status: "error",
          changes: [],
          error: err instanceof Error ? err.message : String(err),
          responseTimeMs: 0,
        });

        if (feed.failureCount >= this.config.maxFeedFailures) {
          feed.enabled = false;
          this.emit("feedDisabled", { feedId: id, reason: `${feed.failureCount} consecutive failures` });
        }
      }
    }

    return results;
  }

  /**
   * Check a single feed for changes.
   * Implements content-hash-based change detection.
   */
  async checkFeed(feed: RegulatoryFeed): Promise<FeedCheckResult> {
    const startTime = Date.now();
    const changes: RegulatoryChange[] = [];

    // Fetch content based on feed type
    const content = await this.fetchFeedContent(feed);
    const contentHash = this.hashContent(content);
    const responseTimeMs = Date.now() - startTime;

    if (contentHash === feed.lastContentHash) {
      return { feedId: feed.id, timestamp: Date.now(), status: "unchanged", changes: [], responseTimeMs };
    }

    // Content changed — extract changes
    const previousHash = feed.lastContentHash;
    feed.lastContentHash = contentHash;

    if (!previousHash) {
      // First check — record as baseline, don't generate change events
      return { feedId: feed.id, timestamp: Date.now(), status: "new_content", changes: [], responseTimeMs };
    }

    // Parse the content for regulatory changes
    const parsedChanges = this.parseChanges(content, feed);
    changes.push(...parsedChanges);

    return {
      feedId: feed.id,
      timestamp: Date.now(),
      status: "changed",
      changes,
      responseTimeMs,
    };
  }

  /** Fetch a feed body with config.fetchImpl (default globalThis.fetch) and a 30 s timeout. */
  private async fetchFeedContent(feed: RegulatoryFeed): Promise<string> {
    const fetchImpl: FeedFetch | undefined = this.config.fetchImpl
      ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
    if (!fetchImpl) throw new Error(`No fetch implementation available for feed ${feed.id}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(feed.url, {
        signal: controller.signal,
        headers: { "User-Agent": "AMC-Comply-Monitor/1.0" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Parse regulatory changes from feed content.
   * Handles RSS, API JSON, and raw HTML content.
   */
  private parseChanges(content: string, feed: RegulatoryFeed): RegulatoryChange[] {
    const changes: RegulatoryChange[] = [];

    switch (feed.type) {
      case "rss": {
        // Parse RSS/Atom items
        const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
        const descRegex = /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
        const dateRegex = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i;
        const linkRegex = /<link[^>]*>([\s\S]*?)<\/link>/i;

        let match;
        while ((match = itemRegex.exec(content)) !== null) {
          const item = match[1]!;
          const title = titleRegex.exec(item)?.[1]?.trim() ?? "Untitled";
          const desc = descRegex.exec(item)?.[1]?.trim() ?? "";
          const dateStr = dateRegex.exec(item)?.[1]?.trim();
          const link = linkRegex.exec(item)?.[1]?.trim() ?? feed.url;

          // Filter by relevant keywords
          const relevant = this.isRelevantContent(title + " " + desc, feed.framework);
          if (!relevant) continue;

          const publishedDate = dateStr ? new Date(dateStr).getTime() : Date.now();
          const impactedControls = this.inferImpactedControls(title + " " + desc, feed.framework);
          const severity = this.inferSeverity(title + " " + desc);

          changes.push({
            id: randomUUID(),
            framework: feed.framework,
            changeType: this.inferChangeType(title + " " + desc),
            title,
            description: desc.slice(0, 500),
            effectiveDate: publishedDate + 90 * 86400000, // Placeholder: RSS carries no effective date
            effectiveDateEstimated: true,
            publishedDate,
            impactedControls,
            source: link,
            sourceType: "rss",
            severity,
            jurisdictions: feed.jurisdictions,
            humanReviewed: false,
            contentHash: this.hashContent(title + desc),
          });
        }
        break;
      }

      case "api": {
        // Parse JSON API response
        try {
          const data = JSON.parse(content);
          const items = Array.isArray(data) ? data : data.items ?? data.results ?? [data];
          for (const item of items) {
            const title = item.title ?? item.name ?? "Untitled";
            const desc = item.description ?? item.summary ?? item.abstract ?? "";
            if (!this.isRelevantContent(title + " " + desc, feed.framework)) continue;
            // Federal Register API v1 uses effective_on / publication_date / html_url.
            const effective = item.effectiveDate ?? item.effective_on;
            const published = item.publishedDate ?? item.publication_date;

            changes.push({
              id: randomUUID(),
              framework: feed.framework,
              changeType: this.inferChangeType(title + " " + desc),
              title,
              description: String(desc).slice(0, 500),
              effectiveDate: effective ? new Date(effective).getTime() : Date.now() + 90 * 86400000,
              effectiveDateEstimated: !effective,
              publishedDate: published ? new Date(published).getTime() : Date.now(),
              impactedControls: this.inferImpactedControls(title + " " + desc, feed.framework),
              source: item.url ?? item.html_url ?? feed.url,
              sourceType: "api",
              severity: this.inferSeverity(title + " " + desc),
              jurisdictions: feed.jurisdictions,
              humanReviewed: false,
              contentHash: this.hashContent(title + desc),
            });
          }
        } catch {
          // Not valid JSON — treat as text
        }
        break;
      }

      case "web_scrape": {
        // Simple content change detection
        // The fact that we got here means content changed
        changes.push({
          id: randomUUID(),
          framework: feed.framework,
          changeType: "guidance_update",
          title: `${feed.name} — content updated`,
          description: `Content at ${feed.url} has changed since last check. Manual review recommended.`,
          effectiveDate: Date.now(),
          effectiveDateEstimated: true,
          publishedDate: Date.now(),
          impactedControls: this.inferImpactedControls(content.slice(0, 2000), feed.framework),
          source: feed.url,
          sourceType: "web_scrape",
          severity: "medium",
          jurisdictions: feed.jurisdictions,
          humanReviewed: false,
          contentHash: this.hashContent(content),
        });
        break;
      }
    }

    return changes;
  }

  /**
   * Keyword-based relevance filter.
   */
  private isRelevantContent(text: string, framework: string): boolean {
    const lowerText = text.toLowerCase();
    const keywords = [
      "ai", "artificial intelligence", "machine learning", "autonomous",
      "agent", "llm", "large language model", "foundation model",
      "safety", "trust", "risk", "compliance", "governance",
      "regulation", "standard", "requirement", "obligation",
    ];
    const frameworkKeywords: Record<string, string[]> = {
      EU_AI_ACT: ["eu ai act", "high-risk", "ai system", "conformity"],
      NIST_AI_RMF: ["nist", "ai rmf", "risk management", "trustworthy"],
      ISO_42001: ["iso 42001", "ai management", "isms"],
      OWASP_LLM: ["owasp", "llm", "top 10", "vulnerability"],
      MITRE_ATLAS: ["mitre", "atlas", "adversarial", "tactic"],
    };

    const extraKeywords = frameworkKeywords[framework] ?? [];
    const allKeywords = [...keywords, ...extraKeywords];

    return allKeywords.some(kw => lowerText.includes(kw));
  }

  private inferChangeType(text: string): RegulatoryChange["changeType"] {
    const lower = text.toLowerCase();
    if (lower.includes("new") || lower.includes("introduce") || lower.includes("adopt")) return "new_requirement";
    if (lower.includes("amend") || lower.includes("revis") || lower.includes("update")) return "amendment";
    if (lower.includes("repeal") || lower.includes("deprecat") || lower.includes("withdraw")) return "deprecation";
    if (lower.includes("enforcement") || lower.includes("fine") || lower.includes("penalty")) return "enforcement_action";
    if (lower.includes("guidance") || lower.includes("interpret") || lower.includes("clarif")) return "guidance_update";
    return "guidance_update";
  }

  private inferSeverity(text: string): RegulatoryChange["severity"] {
    const lower = text.toLowerCase();
    if (lower.includes("mandatory") || lower.includes("enforcement") || lower.includes("penalty") || lower.includes("prohibition")) return "critical";
    if (lower.includes("requirement") || lower.includes("obligation") || lower.includes("must")) return "high";
    if (lower.includes("recommend") || lower.includes("should") || lower.includes("guidance")) return "medium";
    return "low";
  }

  private inferImpactedControls(text: string, framework: string): string[] {
    const lower = text.toLowerCase();
    const controls: string[] = [];
    const controlKeywords: Record<string, string[]> = {
      risk_management: ["risk management", "risk assessment"],
      data_governance: ["data governance", "training data", "data quality"],
      transparency: ["transparency", "explainability", "interpretability"],
      human_oversight: ["human oversight", "human-in-the-loop", "human control"],
      accuracy: ["accuracy", "performance", "benchmarking"],
      robustness: ["robustness", "resilience", "reliability"],
      cybersecurity: ["cybersecurity", "security", "attack", "vulnerability"],
      prompt_injection: ["prompt injection", "injection attack"],
      excessive_agency: ["excessive agency", "autonomous action", "scope creep"],
    };

    for (const [control, keywords] of Object.entries(controlKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) controls.push(control);
    }

    return controls.length > 0 ? controls : ["general_compliance"];
  }

  // ── Gap Analysis ───────────────────────────────────────────────────────────

  /**
   * Analyze compliance gaps for a regulatory change.
   */
  analyzeGap(
    change: RegulatoryChange,
    currentCoveredControls?: string[],
  ): ComplianceGapAnalysis {
    const covered = currentCoveredControls ?? Object.keys(CONTROL_TO_AMC_MODULE);
    const gaps: ComplianceGap[] = [];

    for (const control of change.impactedControls) {
      const modules = CONTROL_TO_AMC_MODULE[control] ?? [];
      const isCovered = covered.includes(control);

      if (!isCovered) {
        gaps.push({
          controlId: control,
          controlName: control.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          currentStatus: modules.length > 0 ? "partial" : "uncovered",
          requiredStatus: change.severity === "critical" ? "mandatory" : "recommended",
          amcModules: modules.length > 0 ? modules : ["manual_review"],
          estimatedEffort: modules.length > 0 ? "moderate" : "significant",
          technicalDetails: `Control ${control} requires coverage in ${modules.join(", ") || "no current module"}. Framework: ${change.framework}.`,
        });
      }
    }

    const coveredCount = change.impactedControls.filter(c => covered.includes(c)).length;
    const currentCoverage = change.impactedControls.length > 0 ? (coveredCount / change.impactedControls.length) * 100 : 100;

    // Build remediation plan with dependency ordering
    const remediationPlan: RemediationStep[] = gaps.map((gap, i) => ({
      order: i + 1,
      action: `${gap.currentStatus === "partial" ? "Complete" : "Implement"} ${gap.controlName} coverage`,
      amcModule: gap.amcModules[0] ?? "comply",
      amcCommand: gap.amcModules[0] !== "manual_review"
        ? `amc comply check --framework ${change.framework} --control ${gap.controlId}`
        : undefined,
      estimatedHours: gap.estimatedEffort === "trivial" ? 1 : gap.estimatedEffort === "moderate" ? 4 : gap.estimatedEffort === "significant" ? 16 : 40,
      priority: gap.requiredStatus === "mandatory" ? "critical" : "high",
      dependsOn: [],
    }));

    // Add dependency edges: security controls before governance controls
    const securitySteps = remediationPlan.filter(s => ["shield", "vault", "guardrails"].includes(s.amcModule));
    const governanceSteps = remediationPlan.filter(s => ["enforce", "comply"].includes(s.amcModule));
    for (const gs of governanceSteps) {
      gs.dependsOn = securitySteps.map(s => s.order);
    }

    const totalHours = remediationPlan.reduce((sum, s) => sum + s.estimatedHours, 0);
    const daysUntilEffective = Math.max(0, Math.floor((change.effectiveDate - Date.now()) / 86400000));

    return {
      id: randomUUID(),
      timestamp: Date.now(),
      regulatoryChange: change,
      currentCoverage: Math.round(currentCoverage * 10) / 10,
      projectedCoverage: Math.round(currentCoverage * 10) / 10,
      gaps,
      remediationPlan,
      daysUntilEffective,
      riskLevel: daysUntilEffective < 30 && gaps.length > 0 ? "critical"
        : daysUntilEffective < 90 && gaps.length > 0 ? "high"
        : gaps.length > 0 ? "medium" : "low",
      estimatedRemediationHours: totalHours,
    };
  }

  // ── Impact Assessment ────────────────────────────────────────────────────

  /**
   * Predict regulatory impact on agent fleet scores.
   */
  assessImpact(
    change: RegulatoryChange,
    fleetScores: Array<{ agentId: string; dimensionScores: Record<string, number> }>,
  ): RegulatoryImpactAssessment {
    const affectedDimensions = [...new Set(
      change.impactedControls.map(c => CONTROL_TO_DIMENSION[c]).filter((d): d is string => !!d)
    )];

    const scoreImpact = affectedDimensions.map(dim => {
      const dimScores = fleetScores
        .map(a => a.dimensionScores[dim])
        .filter((s): s is number => s !== undefined);
      const currentAvg = dimScores.length > 0 ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : 0;
      const projectedScores = dimScores.map(s => s >= 55 ? s : s * 0.9);
      const projectedAvg = projectedScores.length > 0 ? projectedScores.reduce((a, b) => a + b, 0) / projectedScores.length : 0;
      return {
        dimension: dim,
        currentAvg: Math.round(currentAvg * 10) / 10,
        projectedAvg: Math.round(projectedAvg * 10) / 10,
        delta: Math.round((projectedAvg - currentAvg) * 10) / 10,
      };
    });

    const affectedAgents = fleetScores.filter(a =>
      affectedDimensions.some(d => (a.dimensionScores[d] ?? 0) < 55)
    ).length;

    const totalHours = affectedAgents * affectedDimensions.length * 2;

    return {
      id: randomUUID(),
      timestamp: Date.now(),
      change,
      affectedAgents,
      affectedDimensions,
      scoreImpact,
      complianceRisk: Math.min(100, Math.round((affectedAgents / Math.max(1, fleetScores.length)) * 100)),
      timeToCompliance: totalHours,
      recommendations: [
        `${affectedAgents} of ${fleetScores.length} agents need remediation across ${affectedDimensions.length} dimensions.`,
        ...affectedDimensions.map(d => `Run: amc score --dimension ${d} --agents all`),
        change.severity === "critical" ? "URGENT: Begin remediation immediately." : "Schedule remediation before effective date.",
      ],
      estimatedCost: {
        hours: totalHours,
        complexity: totalHours > 100 ? "high" : totalHours > 40 ? "medium" : "low",
      },
    };
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getChangeLog(): RegulatoryChange[] { return [...this.changeLog]; }
  getFeeds(): RegulatoryFeed[] { return [...this.feeds.values()]; }
  getFeed(id: string): RegulatoryFeed | undefined { return this.feeds.get(id); }

  addFeed(feed: RegulatoryFeed): void {
    this.feeds.set(feed.id, feed);
    this.emit("feedAdded", feed);
  }

  removeFeed(id: string): void {
    this.feeds.delete(id);
    this.emit("feedRemoved", { feedId: id });
  }
}

// ── Standalone convenience functions ───────────────────────────────────────

export function getRegulatoryChanges(changeLog: RegulatoryChange[], opts?: {
  framework?: string; severity?: string; upcoming?: boolean;
}): RegulatoryChange[] {
  let changes = [...changeLog];
  if (opts?.framework) changes = changes.filter(c => c.framework === opts.framework);
  if (opts?.severity) changes = changes.filter(c => c.severity === opts.severity);
  if (opts?.upcoming) changes = changes.filter(c => c.effectiveDate > Date.now());
  return changes.sort((a, b) => a.effectiveDate - b.effectiveDate);
}
