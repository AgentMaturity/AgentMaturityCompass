/**
 * Tests for Internationalization Framework — MF-07
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import {
  SUPPORTED_LOCALES, RTL_LOCALES, localeMetadata,
  isRtl, isSupportedLocale, getLocaleMetadata,
  getTranslationKeys, getDefaultTranslationBundle,
  t, getCulturalContext, checkTranslationCompleteness,
  defaultI18nConfig, i18nConfigSchema,
  saveTranslationBundle, loadTranslationBundle,
  type TranslationBundle, type SupportedLocale,
} from "../src/i18n/i18nFramework.js";

const roots: string[] = [];
function tmpDir() { const d = mkdtempSync(join(tmpdir(), "amc-i18n-")); roots.push(d); return d; }
afterEach(() => { roots.forEach(r => { try { rmSync(r, { recursive: true }); } catch {} }); roots.length = 0; });

describe("I18n — locales", () => {
  test("supports 20 locales", () => { expect(SUPPORTED_LOCALES.length).toBe(20); });
  test("all locales have metadata", () => { for (const l of SUPPORTED_LOCALES) expect(localeMetadata[l]).toBeDefined(); });
  test("Arabic is RTL", () => { expect(isRtl("ar")).toBe(true); });
  test("English is LTR", () => { expect(isRtl("en")).toBe(false); });
  test("isSupportedLocale works", () => { expect(isSupportedLocale("en")).toBe(true); expect(isSupportedLocale("xx")).toBe(false); });
  test("metadata has required fields", () => {
    for (const l of SUPPORTED_LOCALES) {
      const m = getLocaleMetadata(l);
      expect(m.name).toBeTruthy();
      expect(m.nativeName).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(m.direction);
    }
  });
});

describe("I18n — translations", () => {
  test("translation keys exist", () => { expect(getTranslationKeys().length).toBeGreaterThan(20); });
  test("default bundle is complete", () => {
    const bundle = getDefaultTranslationBundle();
    expect(bundle.locale).toBe("en");
    expect(bundle.completeness).toBe(1.0);
    const check = checkTranslationCompleteness(bundle);
    expect(check.complete).toBe(true);
    expect(check.missingKeys).toHaveLength(0);
  });
  test("t() interpolates params", () => {
    const bundle = getDefaultTranslationBundle();
    expect(t(bundle, "cli.version", { version: "1.0.0" })).toContain("1.0.0");
    expect(t(bundle, "cli.quickscore.question", { current: "5", total: "235" })).toContain("5");
  });
  test("t() returns key for missing translation", () => {
    const bundle = getDefaultTranslationBundle();
    expect(t(bundle, "nonexistent.key")).toBe("nonexistent.key");
  });
  test("completeness checker detects missing keys", () => {
    const bundle: TranslationBundle = { locale: "es", version: "1.0.0", strings: { "cli.welcome": "Bienvenido" }, completeness: 0 };
    const check = checkTranslationCompleteness(bundle);
    expect(check.complete).toBe(false);
    expect(check.missingKeys.length).toBeGreaterThan(0);
    expect(check.completeness).toBeGreaterThan(0);
    expect(check.completeness).toBeLessThan(1);
  });
});

describe("I18n — cultural context", () => {
  test("English context exists", () => { const ctx = getCulturalContext("en"); expect(ctx).not.toBeNull(); expect(ctx!.communicationStyle).toBe("direct"); });
  test("Japanese context has adjustments", () => { const ctx = getCulturalContext("ja"); expect(ctx!.adjustments.length).toBeGreaterThan(0); });
  test("Arabic context is RTL-aware", () => { const ctx = getCulturalContext("ar"); expect(ctx!.adjustments.some(a => a.includes("RTL"))).toBe(true); });
  test("7 cultural contexts defined", () => {
    let count = 0;
    for (const l of SUPPORTED_LOCALES) if (getCulturalContext(l)) count++;
    expect(count).toBeGreaterThanOrEqual(7);
  });
});

describe("I18n — config", () => {
  test("default config is valid", () => { const c = defaultI18nConfig(); expect(c.defaultLocale).toBe("en"); expect(c.rtlSupport).toBe(true); });
  test("schema validates custom config", () => {
    const c = i18nConfigSchema.parse({ defaultLocale: "ja", supportedLocales: ["ja", "en"] });
    expect(c.defaultLocale).toBe("ja");
  });
});

describe("I18n — persistence", () => {
  test("save and load translation bundle", () => {
    const ws = tmpDir();
    const bundle = getDefaultTranslationBundle();
    const path = saveTranslationBundle(ws, bundle);
    expect(path).toContain("en.json");
    const loaded = loadTranslationBundle(ws, "en");
    expect(loaded).not.toBeNull();
    expect(loaded!.locale).toBe("en");
    expect(Object.keys(loaded!.strings).length).toBeGreaterThan(20);
  });
  test("load returns null for missing locale", () => {
    const ws = tmpDir();
    expect(loadTranslationBundle(ws, "zh")).toBeNull();
  });
});
