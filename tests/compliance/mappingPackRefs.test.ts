import { describe, expect, it } from "vitest";
import { listAssurancePacks } from "../../src/assurance/packs/index.js";
import { builtInComplianceMappings } from "../../src/compliance/builtInMappings.js";

const registered = new Set(listAssurancePacks().map((pack) => pack.id));
const loose = (id: string) => id.toLowerCase().replace(/[-_]/g, "");
const registeredLoose = new Set([...registered].map(loose));

describe("built-in compliance mapping pack references", () => {
  it("every requires_assurance_pack packId is a registered assurance pack id (exact match)", () => {
    const unresolved = builtInComplianceMappings.flatMap((mapping) =>
      mapping.evidenceRequirements.flatMap((req) =>
        req.type === "requires_assurance_pack" && !registered.has(req.packId) ? [`${mapping.id}: ${req.packId}`] : []));
    expect(unresolved).toEqual([]);
  });

  it("every related.packs entry resolves after ignoring case, - and _", () => {
    const unresolved = builtInComplianceMappings.flatMap((mapping) =>
      mapping.related.packs.filter((id) => !registeredLoose.has(loose(id))).map((id) => `${mapping.id}: ${id}`));
    expect(unresolved).toEqual([]);
  });
});
