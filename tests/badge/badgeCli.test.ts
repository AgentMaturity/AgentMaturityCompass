import { describe, it, expect } from "vitest";
import { badgeUrl, generateBadge, formatBadgeOutput } from "../../src/badge/badgeCli.js";

describe("badge generator", () => {
  it("generates correct shields.io URL for L0", () => {
    const url = badgeUrl({ level: 0 });
    expect(url).toContain("img.shields.io/badge");
    expect(url).toContain("L0");
    expect(url).toContain("lightgrey");
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
  });
});
