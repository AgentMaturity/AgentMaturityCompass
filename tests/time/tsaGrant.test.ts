import { describe, expect } from "vitest";
import { requestTimestamp, TSA_TIMEOUT_MS } from "../../src/time/tsaClient.js";
import { ANCHOR_ID, DIGEST, POLICY, optionalTsaTest, withGrantFixture } from "./tsaTestFixture.js";

const optionalGrantTest = optionalTsaTest(["FIRST-GRANT", "HTTP500-THEN-GRANT"]);

describe("P1-25 optional OpenSSL genuine fresh-query timestamp grants", () => {
  optionalGrantTest("accepts the genuine first grant and never dispatches the later TSA", async () => {
    expect(TSA_TIMEOUT_MS).toBe(10_000);
    await withGrantFixture("FIRST-GRANT", "/good-first", async fixture => {
      const result = await requestTimestamp({ digestHex: DIGEST, anchors: [fixture.anchor], config: { tsa: [
        { name: "good-first", url: fixture.url("/good-first"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY },
        { name: "unused-last", url: fixture.url("/unused-last"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY }
      ] } }, fixture.workspace);
      fixture.recordResult(result);
      const attested = await fixture.verifyReply("/good-first");
      expect(fixture.requests.map(request => request.path)).toEqual(["/good-first"]);
      expect(result.failures).toEqual([]);
      // A missing real grant is decisive only after the independent query-bound positive.
      expect(result.grant).not.toBeNull();
      if (result.grant === null) throw new Error("verified first response produced no grant");
      expect(result.grant.tsa).toBe("good-first");
      expect(result.grant.attested).toEqual(attested);
      expect(result.grant.tokenDer).toEqual(Buffer.from(attested.tokenDerB64, "base64"));
    });
  });

  optionalGrantTest("preserves the finite first refusal then accepts the genuine second grant", async () => {
    expect(TSA_TIMEOUT_MS).toBe(10_000);
    await withGrantFixture("HTTP500-THEN-GRANT", "/good-second", async fixture => {
      const result = await requestTimestamp({ digestHex: DIGEST, anchors: [fixture.anchor], config: { tsa: [
        { name: "http-first", url: fixture.url("/http-first"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY },
        { name: "good-second", url: fixture.url("/good-second"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY },
        { name: "unused-last", url: fixture.url("/unused-last"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY }
      ] } }, fixture.workspace);
      fixture.recordResult(result);
      const attested = await fixture.verifyReply("/good-second");
      expect(fixture.requests.map(request => request.path)).toEqual(["/http-first", "/good-second"]);
      expect(result.failures).toEqual(["http-first: HTTP 500"]);
      expect(result.grant).not.toBeNull();
      if (result.grant === null) throw new Error("verified second response produced no grant");
      expect(result.grant.tsa).toBe("good-second");
      expect(result.grant.attested).toEqual(attested);
      expect(result.grant.tokenDer).toEqual(Buffer.from(attested.tokenDerB64, "base64"));
    });
  });
});
