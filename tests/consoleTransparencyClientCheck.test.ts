import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/** M1: the browser's consistency check digests the seal exactly as the server signs it, so a valid seal reads CONSISTENT. */
test("the console digests the seal with the server's signed serialisation", () => {
  const server = readFileSync("src/transparency/logChain.ts", "utf8");
  const sealBytes = server.slice(server.indexOf("function sealBytes("), server.indexOf("function sealSignatureBytes("));
  expect(sealBytes).toContain("Buffer.from(JSON.stringify(seal, null, 2))");
  const app = readFileSync("src/console/assets/app.js", "utf8");
  const client = app.slice(app.indexOf("async function verifySealSignatureClientSide"), app.indexOf("async function verifyTransparencyClientSide"));
  expect(client).toContain("const sealText = JSON.stringify(raw.seal, null, 2);");
});
