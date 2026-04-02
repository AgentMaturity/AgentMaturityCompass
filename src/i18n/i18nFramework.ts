/**
 * Internationalization Framework — MF-07
 *
 * Provides:
 * 1. Locale system with language/region codes
 * 2. String extraction and translation management
 * 3. RTL support detection
 * 4. Cultural context awareness for evaluations
 * 5. Multilingual question bank foundation
 *
 * MiroFish agent quote:
 * "Testing in Russian, Chinese, Arabic revealed significant accuracy gaps."
 *  — Olga Kuznetsova
 */

import { z } from "zod";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

// ---------------------------------------------------------------------------
// Locale system
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES = [
  "en", "zh", "es", "ar", "hi", "fr", "de", "ja", "ko", "pt",
  "ru", "it", "nl", "tr", "pl", "sv", "th", "vi", "id", "uk",
] as const;

export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const RTL_LOCALES: readonly SupportedLocale[] = ["ar"] as const;

export const localeMetadata: Record<SupportedLocale, {
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  region: string;
  script: string;
}> = {
  en: { name: "English", nativeName: "English", direction: "ltr", region: "global", script: "Latin" },
  zh: { name: "Chinese", nativeName: "中文", direction: "ltr", region: "Asia", script: "Han" },
  es: { name: "Spanish", nativeName: "Español", direction: "ltr", region: "global", script: "Latin" },
  ar: { name: "Arabic", nativeName: "العربية", direction: "rtl", region: "MENA", script: "Arabic" },
  hi: { name: "Hindi", nativeName: "हिन्दी", direction: "ltr", region: "South Asia", script: "Devanagari" },
  fr: { name: "French", nativeName: "Français", direction: "ltr", region: "global", script: "Latin" },
  de: { name: "German", nativeName: "Deutsch", direction: "ltr", region: "Europe", script: "Latin" },
  ja: { name: "Japanese", nativeName: "日本語", direction: "ltr", region: "Asia", script: "CJK" },
  ko: { name: "Korean", nativeName: "한국어", direction: "ltr", region: "Asia", script: "Hangul" },
  pt: { name: "Portuguese", nativeName: "Português", direction: "ltr", region: "global", script: "Latin" },
  ru: { name: "Russian", nativeName: "Русский", direction: "ltr", region: "Eurasia", script: "Cyrillic" },
  it: { name: "Italian", nativeName: "Italiano", direction: "ltr", region: "Europe", script: "Latin" },
  nl: { name: "Dutch", nativeName: "Nederlands", direction: "ltr", region: "Europe", script: "Latin" },
  tr: { name: "Turkish", nativeName: "Türkçe", direction: "ltr", region: "Eurasia", script: "Latin" },
  pl: { name: "Polish", nativeName: "Polski", direction: "ltr", region: "Europe", script: "Latin" },
  sv: { name: "Swedish", nativeName: "Svenska", direction: "ltr", region: "Europe", script: "Latin" },
  th: { name: "Thai", nativeName: "ไทย", direction: "ltr", region: "Asia", script: "Thai" },
  vi: { name: "Vietnamese", nativeName: "Tiếng Việt", direction: "ltr", region: "Asia", script: "Latin" },
  id: { name: "Indonesian", nativeName: "Bahasa Indonesia", direction: "ltr", region: "Asia", script: "Latin" },
  uk: { name: "Ukrainian", nativeName: "Українська", direction: "ltr", region: "Europe", script: "Cyrillic" },
};

export function isRtl(locale: SupportedLocale): boolean {
  return localeMetadata[locale]?.direction === "rtl";
}

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

export function getLocaleMetadata(locale: SupportedLocale) {
  return localeMetadata[locale];
}

// ---------------------------------------------------------------------------
// Translation string management
// ---------------------------------------------------------------------------

export interface TranslationBundle {
  locale: SupportedLocale;
  version: string;
  strings: Record<string, string>;
  completeness: number; // 0-1
}

export interface TranslationKey {
  key: string;
  defaultValue: string;
  context?: string;
  maxLength?: number;
}

/** Registry of all translatable strings */
const TRANSLATION_KEYS: TranslationKey[] = [
  // CLI strings
  { key: "cli.welcome", defaultValue: "Welcome to AMC — Agent Maturity Compass" },
  { key: "cli.version", defaultValue: "Version {version}" },
  { key: "cli.quickscore.start", defaultValue: "Starting quickscore assessment..." },
  { key: "cli.quickscore.complete", defaultValue: "Assessment complete. Overall score: L{score}" },
  { key: "cli.quickscore.question", defaultValue: "Question {current} of {total}" },
  { key: "cli.error.workspace", defaultValue: "Workspace not found. Run 'amc init' first." },
  { key: "cli.error.agent", defaultValue: "Agent '{agentId}' not found." },

  // Report strings
  { key: "report.title", defaultValue: "Agent Maturity Assessment Report" },
  { key: "report.overall", defaultValue: "Overall Maturity Score" },
  { key: "report.layer", defaultValue: "Layer: {layerName}" },
  { key: "report.trust_label", defaultValue: "Trust Label: {label}" },
  { key: "report.integrity", defaultValue: "Integrity Index: {index}" },
  { key: "report.evidence", defaultValue: "Evidence Coverage: {coverage}%" },
  { key: "report.generated", defaultValue: "Report generated at {timestamp}" },

  // Score levels
  { key: "score.level.0", defaultValue: "Not Assessed" },
  { key: "score.level.1", defaultValue: "Initial — Ad hoc, no formal processes" },
  { key: "score.level.2", defaultValue: "Developing — Some processes, inconsistent" },
  { key: "score.level.3", defaultValue: "Defined — Standardized processes in place" },
  { key: "score.level.4", defaultValue: "Managed — Measured and controlled" },
  { key: "score.level.5", defaultValue: "Optimizing — Continuous improvement" },

  // Trust labels
  { key: "trust.high", defaultValue: "HIGH TRUST" },
  { key: "trust.low", defaultValue: "LOW TRUST" },
  { key: "trust.unreliable", defaultValue: "UNRELIABLE — DO NOT USE FOR CLAIMS" },

  // Layer names
  { key: "layer.strategic", defaultValue: "Strategic Agent Operations" },
  { key: "layer.leadership", defaultValue: "Leadership & Autonomy" },
  { key: "layer.culture", defaultValue: "Culture & Alignment" },
  { key: "layer.resilience", defaultValue: "Resilience" },
  { key: "layer.skills", defaultValue: "Skills" },

  // Drift monitoring
  { key: "drift.detected", defaultValue: "Drift detected: {reason}" },
  { key: "drift.severity", defaultValue: "Severity: {severity}" },
  { key: "drift.frozen", defaultValue: "Agent frozen due to drift incident" },

  // Fleet
  { key: "fleet.cascade.title", defaultValue: "Cascade Failure Simulation Report" },
  { key: "fleet.blast_radius", defaultValue: "Blast Radius: {percentage}%" },
  { key: "fleet.weakest_link", defaultValue: "Weakest Link: {agentId}" },
];

export function getTranslationKeys(): TranslationKey[] {
  return [...TRANSLATION_KEYS];
}

export function getDefaultTranslationBundle(): TranslationBundle {
  const strings: Record<string, string> = {};
  for (const key of TRANSLATION_KEYS) {
    strings[key.key] = key.defaultValue;
  }
  return {
    locale: "en",
    version: "1.0.0",
    strings,
    completeness: 1.0,
  };
}

// ---------------------------------------------------------------------------
// String interpolation
// ---------------------------------------------------------------------------

export function t(
  bundle: TranslationBundle,
  key: string,
  params?: Record<string, string | number>,
): string {
  let value = bundle.strings[key];
  if (!value) {
    // Fallback to key itself
    return key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, "g"), String(v));
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// Cultural context for evaluations
// ---------------------------------------------------------------------------

export interface CulturalContext {
  locale: SupportedLocale;
  /** Communication style: direct vs indirect */
  communicationStyle: "direct" | "indirect" | "mixed";
  /** Formality expectations */
  formalityLevel: "casual" | "moderate" | "formal" | "very-formal";
  /** Power distance (Hofstede) */
  powerDistance: "low" | "medium" | "high";
  /** Uncertainty avoidance */
  uncertaintyAvoidance: "low" | "medium" | "high";
  /** Privacy expectations */
  privacySensitivity: "low" | "medium" | "high" | "very-high";
  /** Regulatory environment */
  regulatoryDensity: "light" | "moderate" | "heavy";
  /** Evaluation adjustments */
  adjustments: string[];
}

export const CULTURAL_CONTEXTS: Partial<Record<SupportedLocale, CulturalContext>> = {
  en: {
    locale: "en",
    communicationStyle: "direct",
    formalityLevel: "moderate",
    powerDistance: "low",
    uncertaintyAvoidance: "low",
    privacySensitivity: "medium",
    regulatoryDensity: "moderate",
    adjustments: [],
  },
  ja: {
    locale: "ja",
    communicationStyle: "indirect",
    formalityLevel: "very-formal",
    powerDistance: "high",
    uncertaintyAvoidance: "high",
    privacySensitivity: "high",
    regulatoryDensity: "heavy",
    adjustments: [
      "Evaluate indirect communication patterns as valid",
      "Higher weight on consensus-based decision making",
      "Adjust tone analysis for keigo (honorific) patterns",
    ],
  },
  de: {
    locale: "de",
    communicationStyle: "direct",
    formalityLevel: "formal",
    powerDistance: "low",
    uncertaintyAvoidance: "high",
    privacySensitivity: "very-high",
    regulatoryDensity: "heavy",
    adjustments: [
      "Higher weight on GDPR compliance",
      "Strict data residency requirements",
      "Formal documentation standards expected",
    ],
  },
  ar: {
    locale: "ar",
    communicationStyle: "indirect",
    formalityLevel: "formal",
    powerDistance: "high",
    uncertaintyAvoidance: "high",
    privacySensitivity: "high",
    regulatoryDensity: "moderate",
    adjustments: [
      "RTL text handling required",
      "Evaluate religious/cultural sensitivity",
      "Adjust for Arabic-specific prompt patterns",
    ],
  },
  zh: {
    locale: "zh",
    communicationStyle: "indirect",
    formalityLevel: "formal",
    powerDistance: "high",
    uncertaintyAvoidance: "medium",
    privacySensitivity: "high",
    regulatoryDensity: "heavy",
    adjustments: [
      "CJK character handling verification",
      "China-specific regulatory compliance (PIPL)",
      "Evaluate face-saving communication patterns",
    ],
  },
  hi: {
    locale: "hi",
    communicationStyle: "mixed",
    formalityLevel: "moderate",
    powerDistance: "high",
    uncertaintyAvoidance: "medium",
    privacySensitivity: "medium",
    regulatoryDensity: "moderate",
    adjustments: [
      "Devanagari script handling",
      "Code-switching between Hindi and English",
      "India-specific data protection (DPDP Act)",
    ],
  },
  ru: {
    locale: "ru",
    communicationStyle: "direct",
    formalityLevel: "formal",
    powerDistance: "high",
    uncertaintyAvoidance: "high",
    privacySensitivity: "medium",
    regulatoryDensity: "moderate",
    adjustments: [
      "Cyrillic script handling",
      "Evaluate formal/informal (ты/вы) register",
      "Russia-specific data localization requirements",
    ],
  },
};

export function getCulturalContext(locale: SupportedLocale): CulturalContext | null {
  return CULTURAL_CONTEXTS[locale] ?? null;
}

// ---------------------------------------------------------------------------
// Translation completeness checker
// ---------------------------------------------------------------------------

export function checkTranslationCompleteness(bundle: TranslationBundle): {
  complete: boolean;
  completeness: number;
  missingKeys: string[];
  extraKeys: string[];
} {
  const requiredKeys = new Set(TRANSLATION_KEYS.map((k) => k.key));
  const bundleKeys = new Set(Object.keys(bundle.strings));

  const missingKeys = [...requiredKeys].filter((k) => !bundleKeys.has(k));
  const extraKeys = [...bundleKeys].filter((k) => !requiredKeys.has(k));
  const completeness = requiredKeys.size > 0
    ? (requiredKeys.size - missingKeys.length) / requiredKeys.size
    : 1;

  return {
    complete: missingKeys.length === 0,
    completeness: Number(completeness.toFixed(4)),
    missingKeys,
    extraKeys,
  };
}

// ---------------------------------------------------------------------------
// I18n config
// ---------------------------------------------------------------------------

export const i18nConfigSchema = z.object({
  defaultLocale: z.string().default("en"),
  fallbackLocale: z.string().default("en"),
  supportedLocales: z.array(z.string()).default(["en"]),
  rtlSupport: z.boolean().default(true),
  culturalAwareness: z.boolean().default(true),
});

export type I18nConfig = z.infer<typeof i18nConfigSchema>;

export function defaultI18nConfig(): I18nConfig {
  return i18nConfigSchema.parse({});
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function i18nDir(workspace: string): string {
  return join(workspace, ".amc", "i18n");
}

export function saveTranslationBundle(workspace: string, bundle: TranslationBundle): string {
  const dir = i18nDir(workspace);
  ensureDir(dir);
  const file = join(dir, `${bundle.locale}.json`);
  writeFileAtomic(file, JSON.stringify(bundle, null, 2), 0o644);
  return file;
}

export function loadTranslationBundle(workspace: string, locale: SupportedLocale): TranslationBundle | null {
  const file = join(i18nDir(workspace), `${locale}.json`);
  if (!pathExists(file)) return null;
  try {
    const parsed = JSON.parse(readUtf8(file));
    if (typeof parsed !== 'object' || parsed === null || !('locale' in parsed)) {
      throw new Error('Invalid translation bundle format');
    }
    return parsed as TranslationBundle;
  } catch {
    return null;
  }
}
