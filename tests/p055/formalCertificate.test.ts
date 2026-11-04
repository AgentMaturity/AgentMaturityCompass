/** P0-55 case 2: a genuine boundedModelCheck certificate is UNTRUSTED at /api/v1/enforce/formal/certificate (no signer). */
import { expect, test } from "vitest";
import { handleEnforceRoute } from "../../src/api/enforceRouter.js";
import { boundedModelCheck } from "../../src/enforce/formalVerification.js";
import { postRoute } from "./route.js";

test("a boundedModelCheck certificate is 200 UNTRUSTED, valid false, integrityValid true, reason not-pinned", async () => {
  const certificate = boundedModelCheck("p055-formal-fixture").certificates[0]!;
  const out = await postRoute(handleEnforceRoute, "/api/v1/enforce/formal/certificate", { certificate });
  expect(out.status).toBe(200);
  expect(out.body.data).toMatchObject({ status: "UNTRUSTED", valid: false, integrityValid: true });
  expect(out.body.data?.reason).toMatch(/^certificateHash \(artifact-seal\): not-pinned/);
});
