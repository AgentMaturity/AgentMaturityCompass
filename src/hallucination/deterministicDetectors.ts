/**
 * hallucination/deterministicDetectors.ts — Pattern-based hallucination detectors.
 *
 * These run without an LLM. They catch common hallucination patterns:
 * fabricated citations, invented statistics, fake URLs, contradictions,
 * unsupported certainty, and temporal fabrications.
 */

import type { HallucinationFinding, HallucinationDetectorInput, HallucinationSeverity } from "./types.js";

let findingCounter = 0;

function nextId(): string {
  return `det-${++findingCounter}`;
}

/** Reset the counter (for tests). */
export function resetFindingCounter(): void {
  findingCounter = 0;
}

/* ── Citation Detector ───────────────────────────────────────────── */

/**
 * Detects fabricated citations: references to papers, studies, reports
 * that don't appear in the provided context.
 */

// Matches patterns like: "According to Smith et al. (2023)" or "Jones (2021) found"
const CITATION_PATTERNS = [
  /(?:according to|as (?:noted|stated|shown|reported|found) (?:by|in))\s+([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?)\s*\((\d{4})\)/gi,
  /([A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?\s*\(\d{4}\))/g,
  /(?:the|a)\s+(\d{4})\s+(?:study|paper|report|survey|analysis|review)\s+(?:by|from|in)\s+([A-Z][\w\s]+?)(?:\s+(?:found|showed|demonstrated|concluded|reported))/gi,
];

// Matches "published in [Journal Name]" patterns
const JOURNAL_PATTERN = /published\s+in\s+(?:the\s+)?([A-Z][\w\s&]+?)(?:\s*[,.]|\s+in\s+\d{4})/gi;

export function detectFabricatedCitations(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const contextLower = (input.context ?? "").toLowerCase();
  const response = input.response;

  for (const pattern of CITATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response)) !== null) {
      const citationText = match[0];
      // Check if this citation appears in the provided context
      if (contextLower && !contextLower.includes(citationText.toLowerCase().replace(/\s+/g, " "))) {
        // Also check for partial matches (author name in context)
        const authorPart = (match[1] ?? "").toLowerCase().trim();
        if (!authorPart || !contextLower.includes(authorPart)) {
          findings.push({
            id: nextId(),
            type: "fabricated_citation",
            severity: "high",
            span: citationText,
            offset: match.index,
            reason: `Citation "${citationText}" not found in provided context. May be fabricated.`,
            detector: "deterministic",
            confidence: contextLower ? 0.85 : 0.6,
          });
        }
      }
    }
  }

  // Check journal references
  JOURNAL_PATTERN.lastIndex = 0;
  let jMatch: RegExpExecArray | null;
  while ((jMatch = JOURNAL_PATTERN.exec(response)) !== null) {
    const journalName = jMatch[1].trim();
    if (contextLower && !contextLower.includes(journalName.toLowerCase())) {
      findings.push({
        id: nextId(),
        type: "fabricated_citation",
        severity: "medium",
        span: jMatch[0],
        offset: jMatch.index,
        reason: `Journal reference "${journalName}" not found in provided context.`,
        detector: "deterministic",
        confidence: 0.7,
      });
    }
  }

  return findings;
}

/* ── Statistics Detector ─────────────────────────────────────────── */

/**
 * Detects invented statistics: precise numbers, percentages, and metrics
 * that don't appear in the source context.
 */

// Matches patterns like "73.4%", "$2.3 million", "increased by 42%"
const STAT_PATTERNS = [
  /(\d{1,3}(?:\.\d+)?)\s*%/g,                                    // percentages
  /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|trillion|thousand|[MBTKmbtk])?/gi, // dollar amounts
  /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:times|x)\s+(?:more|less|increase|decrease|higher|lower|faster|slower)/gi, // multipliers
  /(?:approximately|roughly|about|exactly|precisely)\s+(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/gi, // qualified numbers
];

// Precise-looking numbers (4+ significant digits, or decimals) are more suspicious
const SUSPICIOUSLY_PRECISE_RE = /\b\d+\.\d{2,}\b/g;

export function detectFabricatedStatistics(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const contextLower = (input.context ?? "").toLowerCase();
  const response = input.response;

  if (!contextLower) return findings; // Can't verify without context

  for (const pattern of STAT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response)) !== null) {
      const statText = match[0];
      const numericPart = match[1] ?? "";

      // Check if this exact statistic appears in context
      if (!contextLower.includes(statText.toLowerCase()) && !contextLower.includes(numericPart)) {
        findings.push({
          id: nextId(),
          type: "fabricated_statistic",
          severity: determineSeverity(statText),
          span: statText,
          offset: match.index,
          reason: `Statistic "${statText}" not found in provided context.`,
          detector: "deterministic",
          confidence: 0.75,
        });
      }
    }
  }

  // Extra flag for suspiciously precise decimals
  SUSPICIOUSLY_PRECISE_RE.lastIndex = 0;
  let precMatch: RegExpExecArray | null;
  while ((precMatch = SUSPICIOUSLY_PRECISE_RE.exec(response)) !== null) {
    const num = precMatch[0];
    if (!contextLower.includes(num)) {
      // Only flag if not already caught by stat patterns
      if (!findings.some(f => f.span.includes(num))) {
        findings.push({
          id: nextId(),
          type: "fabricated_statistic",
          severity: "medium",
          span: num,
          offset: precMatch.index,
          reason: `Suspiciously precise number "${num}" not found in context.`,
          detector: "deterministic",
          confidence: 0.65,
        });
      }
    }
  }

  return findings;
}

function determineSeverity(stat: string): HallucinationSeverity {
  if (/billion|trillion/i.test(stat)) return "critical";
  if (/million/i.test(stat) || /\$/.test(stat)) return "high";
  return "medium";
}

/* ── URL Fabrication Detector ────────────────────────────────────── */

/**
 * Detects fabricated URLs: links that look plausible but weren't in context.
 */

const URL_RE = /https?:\/\/[^\s)<>]+/gi;
// Known real domains that are commonly hallucinated with fake paths
const COMMONLY_HALLUCINATED_DOMAINS = new Set([
  "arxiv.org", "doi.org", "github.com", "wikipedia.org",
  "nature.com", "science.org", "acm.org", "ieee.org",
]);

export function detectFabricatedUrls(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const contextLower = (input.context ?? "").toLowerCase();
  const response = input.response;

  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(response)) !== null) {
    const url = match[0].replace(/[.,;:!?)]+$/, ""); // trim trailing punctuation
    const urlLower = url.toLowerCase();

    // Check if URL appears in context
    if (contextLower && !contextLower.includes(urlLower)) {
      let severity: HallucinationSeverity = "high";
      let confidence = 0.8;

      // Higher confidence if it's a commonly hallucinated domain
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        if (COMMONLY_HALLUCINATED_DOMAINS.has(domain)) {
          confidence = 0.9;
          severity = "high";
        }
      } catch {
        // Malformed URL — even more suspicious
        confidence = 0.95;
        severity = "critical";
      }

      findings.push({
        id: nextId(),
        type: "fabricated_url",
        severity,
        span: url,
        offset: match.index,
        reason: `URL "${url}" not found in provided context. May be fabricated.`,
        detector: "deterministic",
        confidence,
      });
    }
  }

  return findings;
}

/* ── Contradiction Detector ──────────────────────────────────────── */

/**
 * Detects internal contradictions within the response.
 * Looks for opposing claim patterns in the same response.
 */

interface ClaimPair {
  positive: RegExp;
  negative: RegExp;
  label: string;
}

const CONTRADICTION_PAIRS: ClaimPair[] = [
  {
    positive: /\b(?:is|are|was|were)\s+(?:true|correct|accurate|valid)\b/i,
    negative: /\b(?:is|are|was|were)\s+(?:false|incorrect|inaccurate|invalid|not true|not correct)\b/i,
    label: "truth-value",
  },
  {
    positive: /\b(?:increased|grew|rose|improved|higher)\b/i,
    negative: /\b(?:decreased|shrank|fell|declined|worsened|lower)\b/i,
    label: "direction",
  },
  {
    positive: /\b(?:always|every|all|never fails)\b/i,
    negative: /\b(?:never|none|no instances|sometimes fails)\b/i,
    label: "universality",
  },
  {
    positive: /\b(?:safe|secure|reliable|stable)\b/i,
    negative: /\b(?:unsafe|insecure|unreliable|unstable|dangerous)\b/i,
    label: "safety-assessment",
  },
];

export function detectContradictions(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const response = input.response;
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);

  if (sentences.length < 2) return findings;

  for (const pair of CONTRADICTION_PAIRS) {
    const positiveSentences: Array<{ text: string; idx: number }> = [];
    const negativeSentences: Array<{ text: string; idx: number }> = [];

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (pair.positive.test(s)) positiveSentences.push({ text: s.trim(), idx: i });
      if (pair.negative.test(s)) negativeSentences.push({ text: s.trim(), idx: i });
    }

    // If both positive and negative matches exist, it's a contradiction
    if (positiveSentences.length > 0 && negativeSentences.length > 0) {
      const pos = positiveSentences[0];
      const neg = negativeSentences[0];
      const span = `"${pos.text.substring(0, 60)}..." vs "${neg.text.substring(0, 60)}..."`;

      findings.push({
        id: nextId(),
        type: "contradiction",
        severity: "high",
        span,
        offset: response.indexOf(pos.text),
        reason: `Contradiction detected (${pair.label}): response contains both positive and negative claims.`,
        detector: "deterministic",
        confidence: 0.7,
      });
    }
  }

  return findings;
}

/* ── Unsupported Certainty Detector ──────────────────────────────── */

/**
 * Detects overconfident language without supporting evidence references.
 */

const CERTAINTY_PATTERNS = [
  /\b(?:definitely|certainly|undoubtedly|absolutely|guaranteed|without question|without doubt|100%|proven fact)\b/gi,
  /\b(?:it is (?:clear|obvious|evident|certain|undeniable) that)\b/gi,
  /\b(?:always works|never fails|impossible to|cannot possibly|will always)\b/gi,
];

const EVIDENCE_MARKERS = [
  /\[ev:[^\]]+\]/i,                    // AMC evidence markers
  /\[(?:source|ref|citation):[^\]]+\]/i, // generic evidence refs
  /(?:according to the (?:provided|given|above) (?:context|data|document))/i,
  /(?:based on (?:the|this) (?:data|context|evidence|information))/i,
  /(?:as shown (?:in|by) (?:the|this))/i,
];

export function detectUnsupportedCertainty(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const response = input.response;

  // Check if response has evidence markers
  const hasEvidence = EVIDENCE_MARKERS.some(re => re.test(response));

  for (const pattern of CERTAINTY_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response)) !== null) {
      // If there's evidence referenced, lower confidence
      if (!hasEvidence) {
        findings.push({
          id: nextId(),
          type: "unsupported_certainty",
          severity: "medium",
          span: match[0],
          offset: match.index,
          reason: `Overconfident language "${match[0]}" without evidence references.`,
          detector: "deterministic",
          confidence: 0.7,
        });
      }
    }
  }

  return findings;
}

/* ── Temporal Fabrication Detector ────────────────────────────────── */

/**
 * Detects fabricated dates, version numbers, and temporal claims.
 */

const TEMPORAL_PATTERNS = [
  /\b(?:version|v)\s*(\d+\.\d+(?:\.\d+)?)\b/gi,       // version numbers
  /\b(?:released|launched|published|updated)\s+(?:on|in)\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi,
  /\b(?:as of|since|until|before|after)\s+([A-Z][a-z]+\s+\d{4}|\d{4})\b/gi,
];

export function detectTemporalFabrications(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const contextLower = (input.context ?? "").toLowerCase();
  const response = input.response;

  if (!contextLower) return findings;

  for (const pattern of TEMPORAL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response)) !== null) {
      const temporal = match[0];
      const specificPart = (match[1] ?? "").toLowerCase();

      if (!contextLower.includes(temporal.toLowerCase()) && specificPart && !contextLower.includes(specificPart)) {
        findings.push({
          id: nextId(),
          type: "temporal_fabrication",
          severity: "medium",
          span: temporal,
          offset: match.index,
          reason: `Temporal claim "${temporal}" not found in provided context.`,
          detector: "deterministic",
          confidence: 0.65,
        });
      }
    }
  }

  return findings;
}

/* ── Fabricated Fact Detector (context-grounding check) ──────────── */

/**
 * Checks if key claims in the response are grounded in the provided context.
 * This is a more nuanced version of the basic keyword overlap in metricTemplates.
 * It extracts claim-like sentences and checks grounding.
 */

const CLAIM_INDICATORS = [
  /\b(?:the|this|that)\s+(?:\w+\s+){0,3}(?:is|are|was|were|has|have|had)\b/gi,
  /\b(?:studies show|research indicates|data suggests|evidence shows|findings reveal)\b/gi,
  /\b(?:it has been|it was|there are|there is|there were)\b/gi,
];

export function detectFabricatedFacts(input: HallucinationDetectorInput): HallucinationFinding[] {
  const findings: HallucinationFinding[] = [];
  const context = input.context;
  if (!context) return findings;

  const contextTerms = extractSignificantTerms(context);
  const response = input.response;
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 20);

  for (const sentence of sentences) {
    // Only check sentences that look like claims
    const isClaim = CLAIM_INDICATORS.some(re => {
      const fresh = new RegExp(re.source, re.flags);
      return fresh.test(sentence);
    });
    if (!isClaim) continue;

    const sentenceTerms = extractSignificantTerms(sentence);
    if (sentenceTerms.size < 3) continue;

    // Calculate grounding ratio
    let grounded = 0;
    for (const term of sentenceTerms) {
      if (contextTerms.has(term)) grounded++;
    }

    const ratio = grounded / sentenceTerms.size;

    // If less than 30% of claim terms are in context, likely fabricated
    if (ratio < 0.3) {
      findings.push({
        id: nextId(),
        type: "fabricated_fact",
        severity: "medium",
        span: sentence.trim().substring(0, 120),
        offset: response.indexOf(sentence.trim()),
        reason: `Claim appears ungrounded: only ${Math.round(ratio * 100)}% of key terms found in context.`,
        detector: "deterministic",
        confidence: 0.6,
      });
    }
  }

  return findings;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "and", "but", "or", "nor", "not", "so", "yet", "if", "than", "that",
  "this", "it", "its", "i", "my", "me", "we", "our", "you", "your",
  "he", "she", "they", "them", "their", "what", "which", "who", "how",
  "there", "then", "also", "about", "more", "some", "such", "only",
  "been", "these", "those", "each", "other", "both", "any", "most",
]);

function extractSignificantTerms(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/* ── Composite deterministic runner ──────────────────────────────── */

export function runAllDeterministicDetectors(input: HallucinationDetectorInput): HallucinationFinding[] {
  resetFindingCounter();
  return [
    ...detectFabricatedCitations(input),
    ...detectFabricatedStatistics(input),
    ...detectFabricatedUrls(input),
    ...detectContradictions(input),
    ...detectUnsupportedCertainty(input),
    ...detectTemporalFabrications(input),
    ...detectFabricatedFacts(input),
  ];
}
