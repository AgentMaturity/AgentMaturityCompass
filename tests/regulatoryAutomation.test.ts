/**
 * tests/regulatoryAutomation.test.ts
 * Unit tests for src/compliance/regulatoryAutomation.ts
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_REGULATORY_FEEDS,
  RegulatoryMonitor,
  getRegulatoryChanges,
} from "../src/compliance/regulatoryAutomation.js";

describe("DEFAULT_REGULATORY_FEEDS", () => {
  it("should have at least 8 feeds", () => {
    expect(DEFAULT_REGULATORY_FEEDS.length).toBeGreaterThanOrEqual(8);
  });

  it("each feed should have id, name, framework, type, url", () => {
    for (const feed of DEFAULT_REGULATORY_FEEDS) {
      expect(feed.id).toBeTruthy();
      expect(feed.name).toBeTruthy();
      expect(feed.framework).toBeTruthy();
      expect(feed.type).toMatch(/^(rss|api|web_scrape)$/);
      expect(feed.url).toBeTruthy();
    }
  });

  it("each feed should have pollIntervalMs > 0", () => {
    for (const feed of DEFAULT_REGULATORY_FEEDS) {
      expect(feed.pollIntervalMs).toBeGreaterThan(0);
    }
  });

  it("each feed should have a jurisdictions array", () => {
    for (const feed of DEFAULT_REGULATORY_FEEDS) {
      expect(Array.isArray(feed.jurisdictions)).toBe(true);
      expect(feed.jurisdictions.length).toBeGreaterThan(0);
    }
  });

  it("feed ids should be unique", () => {
    const ids = DEFAULT_REGULATORY_FEEDS.map(f => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("feeds should cover multiple frameworks", () => {
    const frameworks = new Set(DEFAULT_REGULATORY_FEEDS.map(f => f.framework));
    expect(frameworks.size).toBeGreaterThan(2);
  });

  it("all feeds should have enabled property (boolean)", () => {
    for (const feed of DEFAULT_REGULATORY_FEEDS) {
      expect(typeof feed.enabled).toBe("boolean");
    }
  });
});

describe("RegulatoryMonitor", () => {
  it("should construct without arguments", () => {
    const monitor = new RegulatoryMonitor();
    expect(monitor).toBeDefined();
  });

  it("should construct with partial config", () => {
    const monitor = new RegulatoryMonitor({
      checkIntervalMs: 60000,
      jurisdictions: ["EU", "US"],
    });
    expect(monitor).toBeDefined();
  });

  it("checkAllFeeds should return an array", async () => {
    // This uses network calls but we can at least check it returns the right type
    // We timeout quickly here; in real environments it would make HTTP calls
    const monitor = new RegulatoryMonitor({
      feeds: [{
        id: "test-feed",
        name: "Test Feed",
        framework: "TEST",
        type: "rss",
        url: "https://example.com/feed.xml",
        pollIntervalMs: 3600000,
        lastChecked: 0,
        lastContentHash: "",
        enabled: true,
        failureCount: 0,
        jurisdictions: ["GLOBAL"],
      }],
      jurisdictions: ["GLOBAL"],
    });
    const results = await monitor.checkAllFeeds();
    expect(Array.isArray(results)).toBe(true);
  }, 15000);

  it("should be an EventEmitter (has .on method)", () => {
    const monitor = new RegulatoryMonitor();
    expect(typeof monitor.on).toBe("function");
    expect(typeof monitor.emit).toBe("function");
  });
});

describe("getRegulatoryChanges", () => {
  it("should return empty array for empty changeLog", () => {
    const changes = getRegulatoryChanges([]);
    expect(Array.isArray(changes)).toBe(true);
    expect(changes).toHaveLength(0);
  });

  it("should filter by framework when provided", () => {
    const mockChanges = [
      {
        id: "1", framework: "EU_AI_ACT", changeType: "amendment" as const,
        title: "Change 1", description: "desc", effectiveDate: Date.now(),
        publishedDate: Date.now(), impactedControls: [], source: "test",
        sourceType: "manual" as const, severity: "high" as const,
        jurisdictions: ["EU"], humanReviewed: false, contentHash: "abc123",
      },
      {
        id: "2", framework: "NIST_AI_RMF", changeType: "new_requirement" as const,
        title: "Change 2", description: "desc", effectiveDate: Date.now(),
        publishedDate: Date.now(), impactedControls: [], source: "test",
        sourceType: "manual" as const, severity: "medium" as const,
        jurisdictions: ["US"], humanReviewed: false, contentHash: "def456",
      },
    ];
    const filtered = getRegulatoryChanges(mockChanges, { framework: "EU_AI_ACT" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.framework).toBe("EU_AI_ACT");
  });

  it("should filter by severity when provided", () => {
    const mockChanges = [
      {
        id: "1", framework: "EU_AI_ACT", changeType: "amendment" as const,
        title: "Critical change", description: "desc", effectiveDate: Date.now(),
        publishedDate: Date.now(), impactedControls: [], source: "test",
        sourceType: "manual" as const, severity: "critical" as const,
        jurisdictions: ["EU"], humanReviewed: false, contentHash: "abc",
      },
      {
        id: "2", framework: "NIST_AI_RMF", changeType: "new_requirement" as const,
        title: "Low change", description: "desc", effectiveDate: Date.now(),
        publishedDate: Date.now(), impactedControls: [], source: "test",
        sourceType: "manual" as const, severity: "low" as const,
        jurisdictions: ["US"], humanReviewed: false, contentHash: "def",
      },
    ];
    const filtered = getRegulatoryChanges(mockChanges, { severity: "critical" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.severity).toBe("critical");
  });

  it("should return all changes when no options provided", () => {
    const mockChanges = [
      {
        id: "1", framework: "TEST", changeType: "amendment" as const,
        title: "T1", description: "", effectiveDate: Date.now(),
        publishedDate: Date.now(), impactedControls: [], source: "x",
        sourceType: "manual" as const, severity: "low" as const,
        jurisdictions: ["US"], humanReviewed: false, contentHash: "h1",
      },
      {
        id: "2", framework: "TEST2", changeType: "amendment" as const,
        title: "T2", description: "", effectiveDate: Date.now(),
        publishedDate: Date.now(), impactedControls: [], source: "x",
        sourceType: "manual" as const, severity: "high" as const,
        jurisdictions: ["EU"], humanReviewed: false, contentHash: "h2",
      },
    ];
    const all = getRegulatoryChanges(mockChanges);
    expect(all).toHaveLength(2);
  });
});

describe("DEFAULT_REGULATORY_FEEDS contract (no fake feeds)", () => {
  it("every feed declares a contract, authority and recorded reachability", () => {
    for (const feed of DEFAULT_REGULATORY_FEEDS) {
      expect(["live", "manual-review-required"], feed.id).toContain(feed.contract);
      expect(typeof feed.official, feed.id).toBe("boolean");
      expect(feed.reachability?.checkedAt, feed.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it("a live feed is enabled, official, https, machine-readable and was reachable", () => {
    const live = DEFAULT_REGULATORY_FEEDS.filter((f) => f.contract === "live");
    expect(live.length).toBeGreaterThanOrEqual(4);
    for (const feed of live) {
      expect(feed.enabled, feed.id).toBe(true);
      expect(feed.official, feed.id).toBe(true);
      expect(feed.url, feed.id).toMatch(/^https:\/\//);
      expect(["rss", "api"], feed.id).toContain(feed.type);
      expect(feed.reachability?.status, feed.id).toBe(200);
      expect(feed.selector, feed.id).toBeUndefined();
    }
  });

  it("a feed that is not a live official source is disabled and says why", () => {
    for (const feed of DEFAULT_REGULATORY_FEEDS.filter((f) => f.contract !== "live")) {
      expect(feed.enabled, feed.id).toBe(false);
      expect(feed.manualReviewReason, feed.id).toBeTruthy();
    }
  });

  it("the default monitor polls only live feeds", () => {
    const monitor = new RegulatoryMonitor({ jurisdictions: ["GLOBAL", "EU", "US", "UK", "SG", "CN"] });
    const enabled = monitor.getFeeds().filter((f) => f.enabled).map((f) => f.id).sort();
    expect(enabled).toEqual(DEFAULT_REGULATORY_FEEDS.filter((f) => f.contract === "live").map((f) => f.id).sort());
  });
});

describe("parsed changes do not invent legal dates", () => {
  const feed = (type: "rss" | "api") => ({
    id: `t-${type}`, name: "T", framework: "EU_AI_ACT", type, url: "https://example.invalid/feed",
    pollIntervalMs: 1, lastChecked: 0, lastContentHash: "", enabled: true, failureCount: 0, jurisdictions: ["EU"],
  });
  async function changesFor(type: "rss" | "api", body: string) {
    const monitor = new RegulatoryMonitor({ feeds: [], jurisdictions: ["EU"] });
    const hooked = monitor as unknown as { _fetchHook: () => Promise<string> };
    const f = feed(type);
    hooked._fetchHook = async () => "baseline";
    await monitor.checkFeed(f);
    hooked._fetchHook = async () => body;
    return (await monitor.checkFeed(f)).changes;
  }

  it("marks an RSS item's effective date as an estimate", async () => {
    const [change] = await changesFor("rss", "<rss><item><title>AI Act guidance</title><pubDate>Tue, 19 May 2026 10:37:49 +0000</pubDate></item></rss>");
    expect(change!.effectiveDateEstimated).toBe(true);
  });

  it("reads Federal Register API fields and keeps a stated effective date", async () => {
    const body = JSON.stringify({ results: [{ title: "Artificial intelligence rule", abstract: "AI risk", html_url: "https://www.federalregister.gov/d/x", publication_date: "2026-09-01", effective_on: "2026-12-01" }] });
    const [change] = await changesFor("api", body);
    expect(change!.source).toBe("https://www.federalregister.gov/d/x");
    expect(change!.publishedDate).toBe(Date.parse("2026-09-01"));
    expect(change!.effectiveDate).toBe(Date.parse("2026-12-01"));
    expect(change!.effectiveDateEstimated).toBe(false);
  });
});
