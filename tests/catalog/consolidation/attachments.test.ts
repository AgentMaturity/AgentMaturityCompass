/**
 * P1-53: the strong assets attach to the catalog without changing what they evaluate. Compliance mappings name catalog
 * controls (old signed maps still parse), the policy-pack binding map validates, crosswalk receipts read catalog
 * crosswalks and fail closed without linked evidence, and the binder crosswalk index in CONSOLIDATION.md is current.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import YAML from "yaml";
import { defaultAuditMapBuiltin } from "../../../src/audit/auditMapBuiltin.js";
import { validatePolicyPackBindings } from "../../../src/catalog/compiler/policyPackBindings.js";
import { binderCrosswalkIndex, renderBinderCrosswalkIndex } from "../../../src/catalog/crosswalks.js";
import { loadCatalog } from "../../../src/catalog/loader.js";
import type { PolicyPackBindingMap } from "../../../src/catalog/types.js";
import { builtInComplianceMappings, defaultComplianceMapsFile } from "../../../src/compliance/builtInMappings.js";
import { loadComplianceMaps, verifyComplianceMapsSignature } from "../../../src/compliance/complianceEngine.js";
import { complianceMapsPath } from "../../../src/compliance/complianceMapPublication.js";
import { buildControlCrosswalkReceipt, crosswalkRowsFromCatalog, verifyControlCrosswalkReceipt } from "../../../src/compliance/controlCrosswalk.js";
import { complianceMapsSchema } from "../../../src/compliance/mappingSchema.js";
import { signDigestWithPolicy } from "../../../src/crypto/signing/signer.js";
import { listPolicyPacks } from "../../../src/policyPacks/builtInPacks.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { initWorkspace } from "../../../src/workspace.js";

const cat = loadCatalog();
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

describe("catalogControls on compliance mappings (P1-53)", () => {
  it("every built-in pairing names an existing Layer 0 catalog control", () => {
    const paired = builtInComplianceMappings.filter((m) => m.catalogControls.length > 0);
    expect(paired.length).toBeGreaterThan(0);
    for (const id of paired.flatMap((m) => m.catalogControls)) {
      expect(cat.controls.get(id)?.layer, id).toBe(0);
    }
  });

  it("a compliance map signed before P1-53 still verifies and parses, with catalogControls defaulting to []", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-p1-53-maps-"));
    dirs.push(workspace);
    process.env.AMC_VAULT_PASSPHRASE = "p1-53-consolidation-passphrase";
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const file = defaultComplianceMapsFile();
    const old = { complianceMaps: { ...file.complianceMaps,
      mappings: file.complianceMaps.mappings.map(({ catalogControls: _dropped, ...rest }) => rest) } };
    const bytes = Buffer.from(YAML.stringify(old));
    expect(bytes.toString("utf8")).not.toContain("catalogControls");
    const path = complianceMapsPath(workspace);
    writeFileSync(path, bytes);
    const signed = signDigestWithPolicy({ workspace, kind: "COMPLIANCE_MAPS", digestHex: sha256Hex(bytes) });
    writeFileSync(`${path}.sig`, JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs,
      signer: "auditor", envelope: signed.envelope }, null, 2));
    expect(verifyComplianceMapsSignature(workspace)).toMatchObject({ valid: true });
    const loaded = loadComplianceMaps(workspace).complianceMaps.mappings;
    expect(loaded).toHaveLength(file.complianceMaps.mappings.length);
    expect(loaded.every((m) => Array.isArray(m.catalogControls) && m.catalogControls.length === 0)).toBe(true);
  });

  it("refuses a catalogControls entry that is not a control id", () => {
    const mapping = { ...builtInComplianceMappings[0]!, catalogControls: ["not-a-control"] };
    expect(complianceMapsSchema.safeParse({ complianceMaps: { version: 1, mappings: [mapping] } }).success).toBe(false);
  });
});

describe("policy-pack binding map (P1-53)", () => {
  const map = cat.policyPackBindings!;
  const packs = listPolicyPacks();

  it("references only setting paths present in every built-in pack and only parameters the catalog compiler declares", () => {
    expect(map).toBeDefined();
    expect(map.packs).toEqual(packs.map((p) => p.id));
    expect(validatePolicyPackBindings(map, packs)).toEqual([]);
    expect(map.settings.some((s) => s.parameter === "toolPipeline.visibleTools")).toBe(true);
  });

  it("flags an unknown parameter, a missing setting, a value the parameter refuses and a missing pack", () => {
    const withRow = (row: PolicyPackBindingMap["settings"][number]): PolicyPackBindingMap => ({ ...map, settings: [...map.settings, row] });
    const messages = (m: PolicyPackBindingMap) => validatePolicyPackBindings(m, packs).map((i) => i.message);
    expect(messages(withRow({ setting: "tools.tools.denyByDefault", parameter: "toolPipeline.denyAll", reason: "x" }))[0])
      .toContain("not a catalog binding parameter");
    expect(messages(withRow({ setting: "tools.tools.noSuchSetting", parameter: null, reason: "x" }))[0]).toContain("does not exist in policy pack");
    expect(messages(withRow({ setting: "tools.tools.allowedTools[*].name", parameter: "approvals.{actionClass}.requiredApprovals", reason: "x" }))[0])
      .toContain("must both or neither use {actionClass}");
    expect(messages(withRow({ setting: "tools.tools.denyByDefault", parameter: "toolPipeline.visibleTools", reason: "x" }))[0])
      .toContain("is not a list of tool names");
    expect(messages({ ...map, packs: map.packs.slice(1) })[0]).toContain("is missing from the map");
  });
});

describe("crosswalk receipts fed from the catalog (P1-53)", () => {
  it("builds one row per catalog crosswalk entry, borrowing evidence only from mappings that name the control", () => {
    const rows = crosswalkRowsFromCatalog(cat, "atlas");
    const entries = [...cat.controls.values()].flatMap((c) => c.crosswalk.filter((x) => x.framework === "atlas").map((x) => `${c.id}:atlas:${x.clause}`));
    expect(rows.map((r) => r.id).sort()).toEqual(entries.sort());
    const linked = rows.find((r) => r.catalogControls[0] === "L0-ADV-01")!;
    expect(linked.evidenceRequirements.length).toBeGreaterThan(0);
    const unlinked = rows.find((r) => r.catalogControls[0] === "L0-ADV-04")!;
    expect(unlinked.evidenceRequirements).toEqual([]);
  });

  it("a receipt over a row with no linked mapping fails closed instead of inventing coverage", () => {
    const rows = crosswalkRowsFromCatalog(cat, "atlas").filter((r) => r.catalogControls[0] === "L0-ADV-04");
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "p1-53", mappings: rows, generatedAt: "2026-10-29T00:00:00.000Z",
      sourceCitations: [{ sourceId: "src-fixture", title: "fixture", url: "https://example.org/", retrievedAt: "2026-10-29" }],
      ownersByMappingId: Object.fromEntries(rows.map((r) => [r.id, "ciso"])),
      evidenceByMappingId: Object.fromEntries(rows.map((r) => [r.id, [{ eventId: "e1", eventHash: "a".repeat(64), evidenceType: "audit", signedEvidenceRef: "ref" }]]))
    });
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([`${rows[0]!.id}:amcQuestionIds:missing`, `${rows[0]!.id}:evidenceTypes:missing`]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });
});

describe("audit binder crosswalk index (P1-53)", () => {
  it("CONSOLIDATION.md carries the current index for all 36 binder controls", () => {
    const ids = defaultAuditMapBuiltin().auditMap.controlFamilies.flatMap((f) => f.controls.map((c) => c.controlId));
    expect(ids).toHaveLength(36);
    const index = binderCrosswalkIndex(cat, ids);
    for (const row of index) for (const id of row.catalogControls) expect(cat.controls.has(id)).toBe(true);
    const doc = readFileSync("docs/catalog/CONSOLIDATION.md", "utf8");
    const block = /<!-- binder-index:begin[^>]*-->\n([\s\S]*?)\n<!-- binder-index:end -->/.exec(doc)?.[1];
    expect(block, "run node scripts/gen-consolidation-index.mjs after a build").toBe(renderBinderCrosswalkIndex(index));
  });

  it("CONSOLIDATION.md covers all eight systems with a removal owner", () => {
    const doc = readFileSync("docs/catalog/CONSOLIDATION.md", "utf8");
    const rows = doc.split("\n").filter((l) => /^\| (Domain rubrics|Deep questions|Cross-framework map|Crosswalk receipts|Compliance mappings|Policy packs|Audit binder|Domain proof) \|/.test(l));
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(row).toMatch(/\| (P2-29|None) \|$/);
  });
});
