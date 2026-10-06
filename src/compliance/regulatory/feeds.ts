/**
 * Built-in regulatory feeds for RegulatoryMonitor.
 *
 * Fetch contract: a "live" feed is an official, machine-readable endpoint (RSS
 * or a documented JSON API) that answered HTTP 200 when checked; the monitor
 * GETs it with a 30 s timeout, hashes the body, and turns relevant items into
 * unreviewed RegulatoryChange records. A feed is never proof that a legal date
 * changed — every change needs human review against the instrument itself.
 *
 * "manual-review-required" feeds are web pages or non-official sources: they
 * stay listed so operators know to read them, but are disabled because a
 * whole-page hash cannot say what changed (or the URL did not answer).
 *
 * reachability was recorded by a GET from macOS/Node 25 on the date shown;
 * re-check before relying on it.
 */

import type { RegulatoryFeed } from "../regulatoryAutomation.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

const base = { lastChecked: 0, lastContentHash: "", failureCount: 0 } as const;

export const DEFAULT_REGULATORY_FEEDS: RegulatoryFeed[] = [
  {
    ...base,
    id: "eu-ai-act-rss",
    name: "EU AI Act Service Desk (European Commission)",
    framework: "EU_AI_ACT",
    type: "rss",
    url: "https://ai-act-service-desk.ec.europa.eu/en/rss.xml",
    pollIntervalMs: HOUR * 6,
    enabled: true,
    jurisdictions: ["EU"],
    contract: "live",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:31Z" },
  },
  {
    ...base,
    id: "eu-digital-strategy-rss",
    name: "Shaping Europe's digital future (European Commission)",
    framework: "EU_AI_ACT",
    type: "rss",
    url: "https://digital-strategy.ec.europa.eu/en/rss.xml",
    pollIntervalMs: HOUR * 6,
    enabled: true,
    jurisdictions: ["EU"],
    contract: "live",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:28Z" },
  },
  {
    ...base,
    id: "edpb-news-rss",
    name: "European Data Protection Board news",
    framework: "GDPR",
    type: "rss",
    url: "https://www.edpb.europa.eu/feed/news_en",
    pollIntervalMs: DAY,
    enabled: true,
    jurisdictions: ["EU"],
    contract: "live",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:33Z" },
  },
  {
    ...base,
    id: "nist-ai-rss",
    name: "NIST news (keyword-filtered for AI)",
    framework: "NIST_AI_RMF",
    type: "rss",
    url: "https://www.nist.gov/news-events/news/rss.xml",
    pollIntervalMs: HOUR * 6,
    enabled: true,
    jurisdictions: ["US"],
    contract: "live",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:00Z" },
  },
  {
    ...base,
    id: "us-federal-register-ai",
    name: "Federal Register documents mentioning \"artificial intelligence\" (API v1)",
    framework: "US_FEDERAL",
    type: "api",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=%22artificial+intelligence%22&order=newest&per_page=20&fields%5B%5D=title&fields%5B%5D=abstract&fields%5B%5D=html_url&fields%5B%5D=publication_date&fields%5B%5D=effective_on",
    pollIntervalMs: DAY,
    enabled: true,
    jurisdictions: ["US"],
    contract: "live",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:32:07Z" },
  },
  {
    ...base,
    id: "fca-ai-guidance",
    name: "FCA news (keyword-filtered for AI)",
    framework: "FCA_AI",
    type: "rss",
    url: "https://www.fca.org.uk/news/rss.xml",
    pollIntervalMs: DAY,
    enabled: true,
    jurisdictions: ["UK"],
    contract: "live",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:30Z" },
  },
  {
    ...base,
    id: "iso-updates-api",
    name: "ISO/IEC 42001 standard page",
    framework: "ISO_42001",
    type: "web_scrape",
    url: "https://www.iso.org/standard/81230.html",
    pollIntervalMs: DAY * 7,
    enabled: false,
    jurisdictions: ["GLOBAL"],
    contract: "manual-review-required",
    official: true,
    reachability: { status: 403, checkedAt: "2026-10-03T16:32:39Z" },
    manualReviewReason: "iso.org answers automated requests with a bot challenge (HTTP 403) and offers no feed; review the standard page by hand.",
  },
  {
    ...base,
    id: "owasp-llm-top10",
    name: "OWASP Top 10 for LLM Applications 2025",
    framework: "OWASP_LLM",
    type: "web_scrape",
    url: "https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/",
    pollIntervalMs: DAY * 7,
    enabled: false,
    jurisdictions: ["GLOBAL"],
    contract: "manual-review-required",
    official: false,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:02Z" },
    manualReviewReason: "Community security guidance, not a regulator; an HTML page whose whole-page hash cannot identify what changed.",
  },
  {
    ...base,
    id: "mitre-atlas",
    name: "MITRE ATLAS",
    framework: "MITRE_ATLAS",
    type: "web_scrape",
    url: "https://atlas.mitre.org/",
    pollIntervalMs: DAY * 7,
    enabled: false,
    jurisdictions: ["GLOBAL"],
    contract: "manual-review-required",
    official: false,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:30Z" },
    manualReviewReason: "The former /updates URL returned HTTP 404 on 2026-10-03; the site is a client-rendered app with no feed. Threat knowledge base, not a regulator.",
  },
  {
    ...base,
    id: "singapore-ai-verify",
    name: "AI Verify Foundation (Singapore)",
    framework: "SG_AI_VERIFY",
    type: "web_scrape",
    url: "https://aiverifyfoundation.sg/",
    pollIntervalMs: DAY * 7,
    enabled: false,
    jurisdictions: ["SG"],
    contract: "manual-review-required",
    official: false,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:03Z" },
    manualReviewReason: "Foundation homepage, not a regulator feed; a whole-page hash cannot identify what changed.",
  },
  {
    ...base,
    id: "china-tc260-ai",
    name: "TC260 National Cybersecurity Standardisation Technical Committee (China)",
    framework: "CN_TC260",
    type: "web_scrape",
    url: "https://www.tc260.org.cn/",
    pollIntervalMs: DAY * 7,
    enabled: false,
    jurisdictions: ["CN"],
    contract: "manual-review-required",
    official: true,
    reachability: { status: 200, checkedAt: "2026-10-03T16:22:04Z" },
    manualReviewReason: "Homepage only, no feed; a whole-page hash cannot identify which standard changed.",
  },
];
