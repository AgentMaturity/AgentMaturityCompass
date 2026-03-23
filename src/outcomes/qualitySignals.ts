/**
 * Quality Signals — Gap 9
 *
 * Lightweight per-run quality feedback loop.
 * Thumbs up/down + tags → trend analysis → maturity scoring.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

/* ── Types ───────────────────────────────────────────────────────── */

export type QualityScore = "good" | "bad" | "neutral";

export interface QualityRating {
  id: string;
  traceId: string;
  agentId: string;
  score: QualityScore;
  tags: string[];
  comment?: string;
  ratedBy?: string;
  ts: number;
}

export interface QualityTrend {
  period: string; // ISO date
  totalRatings: number;
  goodCount: number;
  badCount: number;
  neutralCount: number;
  goodPct: number;
  topTags: Array<{ tag: string; count: number }>;
}

export interface QualityReport {
  agentId: string;
  periodStart: number;
  periodEnd: number;
  totalRatings: number;
  goodPct: number;
  badPct: number;
  neutralPct: number;
  satisfactionScore: number; // 0-100
  trends: QualityTrend[];
  topPositiveTags: Array<{ tag: string; count: number }>;
  topNegativeTags: Array<{ tag: string; count: number }>;
  recentRatings: QualityRating[];
  alerts: string[];
}

export interface QualitySignalConfig {
  workspace: string;
  agentId: string;
  alertThreshold?: number; // Satisfaction score below which to alert (default: 70)
  trendWindowDays?: number; // Number of days for trend analysis (default: 30)
}

/* ── Quality Signal Store ────────────────────────────────────────── */

export class QualitySignalStore {
  private config: Required<QualitySignalConfig>;
  private ratings: QualityRating[] = [];
  private dirty = false;

  constructor(config: QualitySignalConfig) {
    this.config = {
      workspace: config.workspace,
      agentId: config.agentId,
      alertThreshold: config.alertThreshold ?? 70,
      trendWindowDays: config.trendWindowDays ?? 30,
    };
    this.loadFromDisk();
  }

  /** Record a quality rating */
  rate(traceId: string, score: QualityScore, tags?: string[], comment?: string, ratedBy?: string): QualityRating {
    const rating: QualityRating = {
      id: randomUUID(),
      traceId,
      agentId: this.config.agentId,
      score,
      tags: tags ?? [],
      comment,
      ratedBy,
      ts: Date.now(),
    };

    this.ratings.push(rating);
    this.dirty = true;
    return rating;
  }

  /** Get quality report */
  generateReport(windowDays?: number): QualityReport {
    const days = windowDays ?? this.config.trendWindowDays;
    const cutoff = Date.now() - days * 86400_000;
    const filtered = this.ratings.filter((r) => r.ts >= cutoff);

    if (filtered.length === 0) {
      return emptyQualityReport(this.config.agentId, cutoff, Date.now());
    }

    const good = filtered.filter((r) => r.score === "good").length;
    const bad = filtered.filter((r) => r.score === "bad").length;
    const neutral = filtered.filter((r) => r.score === "neutral").length;
    const total = filtered.length;

    const goodPct = (good / total) * 100;
    const badPct = (bad / total) * 100;
    const neutralPct = (neutral / total) * 100;

    // Satisfaction: good% - bad% normalized to 0-100
    const satisfactionScore = Math.max(0, Math.min(100, 50 + (goodPct - badPct) / 2));

    // Tag analysis
    const positiveTags = new Map<string, number>();
    const negativeTags = new Map<string, number>();
    for (const r of filtered) {
      for (const tag of r.tags) {
        if (r.score === "good") positiveTags.set(tag, (positiveTags.get(tag) ?? 0) + 1);
        if (r.score === "bad") negativeTags.set(tag, (negativeTags.get(tag) ?? 0) + 1);
      }
    }

    const topPositive = Array.from(positiveTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const topNegative = Array.from(negativeTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Daily trends
    const trends = this.computeTrends(filtered);

    // Alerts
    const alerts: string[] = [];
    if (satisfactionScore < this.config.alertThreshold) {
      alerts.push(`Satisfaction score ${satisfactionScore.toFixed(0)}% is below threshold of ${this.config.alertThreshold}%`);
    }

    // Check for trend degradation
    if (trends.length >= 3) {
      const recent = trends.slice(-3);
      const isDecreasing = recent.every((t, i) => i === 0 || t.goodPct < recent[i - 1]!.goodPct);
      if (isDecreasing) {
        alerts.push(`Quality trending down for ${recent.length} consecutive periods`);
      }
    }

    // Spike in specific bad tags
    for (const { tag, count } of topNegative) {
      if (count > total * 0.2) {
        alerts.push(`"${tag}" accounts for ${((count / total) * 100).toFixed(0)}% of ratings — investigate`);
      }
    }

    return {
      agentId: this.config.agentId,
      periodStart: cutoff,
      periodEnd: Date.now(),
      totalRatings: total,
      goodPct,
      badPct,
      neutralPct,
      satisfactionScore,
      trends,
      topPositiveTags: topPositive,
      topNegativeTags: topNegative,
      recentRatings: filtered.slice(-20),
      alerts,
    };
  }

  /** Get rating for a specific trace */
  getRating(traceId: string): QualityRating | undefined {
    return this.ratings.find((r) => r.traceId === traceId);
  }

  /** Persist to disk (append-only) */
  flush(): void {
    if (!this.dirty) return;
    const dir = join(this.config.workspace, ".amc", "agents", this.config.agentId, "quality");
    ensureDir(dir);
    writeFileAtomic(join(dir, "ratings.json"), JSON.stringify(this.ratings, null, 2));
    this.dirty = false;
  }

  getRecentRatings(limit?: number): QualityRating[] {
    return this.ratings.slice(-(limit ?? 50));
  }

  private computeTrends(ratings: QualityRating[]): QualityTrend[] {
    const dayMap = new Map<string, QualityRating[]>();
    for (const r of ratings) {
      const day = new Date(r.ts).toISOString().slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(r);
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, recs]) => {
        const good = recs.filter((r) => r.score === "good").length;
        const bad = recs.filter((r) => r.score === "bad").length;
        const neutral = recs.filter((r) => r.score === "neutral").length;
        const total = recs.length;

        const tagCounts = new Map<string, number>();
        for (const r of recs) {
          for (const tag of r.tags) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }

        return {
          period,
          totalRatings: total,
          goodCount: good,
          badCount: bad,
          neutralCount: neutral,
          goodPct: total > 0 ? (good / total) * 100 : 0,
          topTags: Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => ({ tag, count })),
        };
      });
  }

  private loadFromDisk(): void {
    const filePath = join(this.config.workspace, ".amc", "agents", this.config.agentId, "quality", "ratings.json");
    if (pathExists(filePath)) {
      try {
        this.ratings = JSON.parse(readUtf8(filePath)) as QualityRating[];
      } catch {
        this.ratings = [];
      }
    }
  }
}

export function createQualitySignalStore(config: QualitySignalConfig): QualitySignalStore {
  return new QualitySignalStore(config);
}

function emptyQualityReport(agentId: string, start: number, end: number): QualityReport {
  return {
    agentId, periodStart: start, periodEnd: end,
    totalRatings: 0, goodPct: 0, badPct: 0, neutralPct: 0, satisfactionScore: 50,
    trends: [], topPositiveTags: [], topNegativeTags: [], recentRatings: [],
    alerts: ["No quality ratings recorded. Use `amc rate <traceId> --score good|bad` to start tracking."],
  };
}
