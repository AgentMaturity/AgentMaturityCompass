/** P0-55 case 1: POST /api/v1/passport/trust-token/verify never takes a secret or a pin, and never answers valid. */
import { expect, test } from "vitest";
import { handlePassportRoute } from "../../src/api/passportRouter.js";
import { issueTrustToken } from "../../src/passport/trustInterchange.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { postRoute } from "./route.js";

const PATH = "/api/v1/passport/trust-token/verify";
const token = issueTrustToken("p055-workspace", sha256Hex("p055-key"), "default", [{ dimension: "security", score: 55, level: "L2",
  evidenceCount: 1, observedShare: 0, lastAssessedAt: Date.now() }], "s");

test("a body carrying secret is 400 'request field \"secret\" is refused'", async () => {
  const out = await postRoute(handlePassportRoute, PATH, { token, secret: "s" });
  expect(out.status).toBe(400);
  expect(out.body.error).toMatch(/^request field "secret" is refused/);
});

test("a body carrying allowUnpinned: true is 400", async () => {
  const out = await postRoute(handlePassportRoute, PATH, { token, allowUnpinned: true });
  expect(out.status).toBe(400);
  expect(out.body.error).toContain('request field "allowUnpinned" is refused');
});

test("a token alone is 200 not_evaluated, valid false, never valid true", async () => {
  const out = await postRoute(handlePassportRoute, PATH, { token });
  expect(out.status).toBe(200);
  expect(out.body.data).toMatchObject({ status: "not_evaluated", valid: false, tokenSha256: sha256Hex(JSON.stringify(token)) });
  expect(JSON.stringify(out.body)).not.toContain('"valid":true');
});
