import { describe, it, expect } from "vitest";
import { badgeMethodologyMetadata, badgeUrl, generateBadge, formatBadgeOutput } from "../../src/badge/badgeCli.js";
import { AMC_PUBLIC_METHODOLOGY_VERSION } from "../../src/methodology/publicMethodology.js";

describe("badge generator", () => {
  it("generates correct shields.io URL for L0", () => {
    const url = badgeUrl({ level: 0 });
    expect(url).toContain("img.shields.io/badge");
    expect(url).toContain("L0");
    expect(url).toContain("lightgrey");
    expect(url).toContain(`amc_methodology=${AMC_PUBLIC_METHODOLOGY_VERSION}`);
    expect(url).toContain("amc_methodology_hash=");
    expect(url).toContain("amc_methodology_assurance=");
  });

  it("generates correct URL for L3", () => {
    const url = badgeUrl({ level: 3 });
    expect(url).toContain("L3");
    expect(url).toContain("blue");
  });

  it("generates correct URL for L5", () => {
    const url = badgeUrl({ level: 5 });
    expect(url).toContain("L5");
    expect(url).toContain("brightgreen");
  });

  it("generates markdown format by default", () => {
    const badge = generateBadge({ level: 3 });
    expect(badge).toMatch(/^!\[AMC L3 Defined\]\(https:\/\/img\.shields\.io/);
  });

  it("generates HTML format", () => {
    const badge = generateBadge({ level: 4, format: "html" });
    expect(badge).toMatch(/^<img src="https:\/\/img\.shields\.io/);
    expect(badge).toContain("L4 Measured");
    expect(badge).toContain("title=\"amc-public-scoring-methodology");
  });

  it("generates URL-only format", () => {
    const badge = generateBadge({ level: 2, format: "url" });
    expect(badge).toMatch(/^https:\/\/img\.shields\.io/);
    expect(badge).not.toContain("![");
  });

  it("supports custom label", () => {
    const badge = generateBadge({ level: 3, label: "My Agent" });
    expect(badge).toContain("My Agent");
  });

  it("formatBadgeOutput includes all formats", () => {
    const output = formatBadgeOutput({ level: 3 });
    expect(output).toContain("Markdown");
    expect(output).toContain("HTML");
    expect(output).toContain("URL");
    expect(output).toContain("L3 Defined");
    expect(output).toContain("Methodology: amc-public-scoring-methodology");
    expect(output).toContain("Methodology Hash:");
    expect(output).toContain("Methodology Assurance Hash:");
  });

  it("exposes deterministic methodology metadata", () => {
    const first = badgeMethodologyMetadata({ level: 3 });
    const second = badgeMethodologyMetadata({ level: 5 });
    expect(first.id).toBe("amc-public-scoring-methodology");
    expect(first.version).toBe(AMC_PUBLIC_METHODOLOGY_VERSION);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.versioningAssuranceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(second.versioningAssuranceHash).toBe(first.versioningAssuranceHash);
  });
});
