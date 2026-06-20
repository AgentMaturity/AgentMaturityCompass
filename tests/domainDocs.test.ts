import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("domain documentation", () => {
  test("documents canonical domain IDs and supply-chain logistics aliases", () => {
    const root = process.cwd();
    const domainPacks = readFileSync(join(root, "docs", "DOMAIN_PACKS.md"), "utf8");
    const sectorPacks = readFileSync(join(root, "docs", "SECTOR_PACKS.md"), "utf8");
    const personas = readFileSync(join(root, "docs", "PERSONAS.md"), "utf8");
    const supplyChain = readFileSync(join(root, "docs", "SUPPLY_CHAIN.md"), "utf8");

    expect(domainPacks).toContain("| `health` | Health |");
    expect(domainPacks).toContain("| `wealth` | Wealth / Financial Services |");
    expect(domainPacks).toContain("| `mobility` | Mobility / Transport |");
    expect(domainPacks).not.toMatch(/^\| `healthcare` \|/m);
    expect(domainPacks).not.toMatch(/^\| `financial` \|/m);
    expect(domainPacks).not.toMatch(/^\| `safety-critical` \|/m);

    expect(domainPacks).toContain("## Supply Chain / Logistics Routing");
    expect(domainPacks).toContain("`supply-chain`, `supply chain`, `scm`, `procurement`, `vendor-risk`");
    expect(domainPacks).toContain("`logistics`, `freight`, `3pl`, `warehouse`, `carrier`, `transportation`");
    expect(domainPacks).toContain("ISO 28000:2022");
    expect(domainPacks).toContain("NIST SP 800-161r1-upd1");
    expect(domainPacks).toContain("`freight-3pl-warehouse`");

    expect(sectorPacks).toContain("## Supply Chain and Logistics Discovery");
    expect(sectorPacks).toContain("`freight-3pl-warehouse`");
    expect(personas).toContain("## Supply chain / logistics operator");
    expect(supplyChain).toContain("## Operational AI Agent Routing");
    expect(supplyChain).toContain("amc domain assess --agent <agent-id> --domain supply-chain");
    expect(supplyChain).toContain("amc domain assess --agent <agent-id> --domain logistics");
    expect(supplyChain).toContain("amc score operational-independence <agent-id> --domain logistics --json");
  });
});
