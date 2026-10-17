import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { CITATION_STATUS_TYPES, type CitationStatusType as SharedCitationStatusType } from "../../src/compliance/citations/citationRecord.js";
import { listDomainIds, type Domain } from "../../src/domains/domainRegistry.js";
import {
  STATIONS, bindingSchema, citationSchema, controlRecordSchema, controlTestSchema, evidenceContractSchema,
  fixtureEnvelopeSchema, packManifestSchema, predicateSchema, producerRecordSchema
} from "../../src/catalog/schema.js";
import type {
  Binding, Citation, CitationStatusType, ControlRecord, ControlTest, EvidenceContract, FixtureEnvelope,
  PackManifest, Predicate, ProducerRecord, Station
} from "../../src/catalog/types.js";

describe("catalog exported types", () => {
  it("matches the actual inferred record, binding, evidence and fixture schemas", () => {
    expectTypeOf<z.infer<typeof controlRecordSchema>>().toEqualTypeOf<ControlRecord>();
    expectTypeOf<z.infer<typeof citationSchema>>().toEqualTypeOf<Citation>();
    expectTypeOf<z.infer<typeof bindingSchema>>().toEqualTypeOf<Binding>();
    expectTypeOf<z.infer<typeof controlTestSchema>>().toEqualTypeOf<ControlTest>();
    expectTypeOf<z.infer<typeof evidenceContractSchema>>().toEqualTypeOf<EvidenceContract>();
    expectTypeOf<z.infer<typeof packManifestSchema>>().toEqualTypeOf<PackManifest>();
    expectTypeOf<z.infer<typeof producerRecordSchema>>().toEqualTypeOf<ProducerRecord>();
    expectTypeOf<z.infer<typeof fixtureEnvelopeSchema>>().toEqualTypeOf<FixtureEnvelope>();
    expectTypeOf<z.infer<typeof predicateSchema>>().toEqualTypeOf<Predicate>();
  });

  it("reuses the existing seven-station Domain type and values", () => {
    expectTypeOf<Station>().toEqualTypeOf<Domain>();
    expectTypeOf<(typeof STATIONS)[number]>().toEqualTypeOf<Station>();
    expect([...STATIONS].sort()).toEqual([...listDomainIds()].sort());
    expect(new Set(STATIONS).size).toBe(7);
  });

  it("shares P0-25 citation status spellings rather than forking the vocabulary", () => {
    expectTypeOf<CitationStatusType>().toEqualTypeOf<SharedCitationStatusType>();
    expect(citationSchema.shape.statusType.options).toEqual([...CITATION_STATUS_TYPES]);
  });
});
