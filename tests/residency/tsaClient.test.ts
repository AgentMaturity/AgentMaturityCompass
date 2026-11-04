/**
 * P2-01 TSA/Rekor shared pinned POST (src/time/tsaClient.ts postToConfiguredUrl), reached by RFC 3161 timestamp queries
 * (requestTimestamp) and Rekor v2 submissions (src/transparency/anchors/rekorV2.ts submitRekorV2Entry).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { buildTimestampRequest, postTimestampQuery, requestTimestamp } from "../../src/time/tsaClient.js";
import { submitRekorV2Entry } from "../../src/transparency/anchors/rekorV2.js";
import type { TimestampAuthority } from "../../src/trust/trustList.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const DIGEST = "a".repeat(64);
const ANCHORS = [{ anchorId: "tsa-anchor", name: "fixture", rootCertificatePem: "unused" }] as unknown as TimestampAuthority[];
let root: string, blocked: string, open: string, tsa: Listener;
beforeEach(async () => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  tsa = await listen((_req, res) => { res.writeHead(200, { "content-type": "text/plain" }).end("not a token"); });
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

const tsaConfig = (...urls: string[]) => ({ tsa: urls.map((url, index) => ({ name: `tsa${index}`, url, anchorIds: ["tsa-anchor"] })) });

describe("TSA and Rekor POST", () => {
  test("denied timestamp queries and Rekor submissions open no socket; all configured TSAs denied throws the typed refusal", async () => {
    await expect(postTimestampQuery(new URL(`${tsa.url}/tsr`), buildTimestampRequest(DIGEST).der, 5_000, blocked)).rejects.toBeInstanceOf(EgressBlocked);
    await expect(submitRekorV2Entry(new URL(tsa.url), Buffer.from("note"), blocked)).rejects.toBeInstanceOf(EgressBlocked);
    await expect(requestTimestamp({ digestHex: DIGEST, config: tsaConfig(`${tsa.url}/a`, `${tsa.url}/b`), anchors: ANCHORS }, blocked))
      .rejects.toBeInstanceOf(EgressBlocked);
    // An explicit workspace wins over an open ambient scope.
    await expect(withWorkspaceScope(open, () => postTimestampQuery(new URL(`${tsa.url}/tsr`), buildTimestampRequest(DIGEST).der, 5_000, blocked)))
      .rejects.toBeInstanceOf(EgressBlocked);
    expect(tsa.connections).toBe(0);
  });

  test("the captured workspace is rechecked per TSA: blocked after the first reply, the second TSA is refused", async () => {
    const second = await listen();
    const input = { digestHex: DIGEST, config: tsaConfig("", `${second.url}/b`), anchors: ANCHORS };
    const first = await listen((_req, res) => {
      blockResidency(open);
      res.writeHead(200, { "content-type": "text/plain" }).end("not a token");
    });
    input.config.tsa[0]!.url = `${first.url}/a`;
    const { grant, failures } = await requestTimestamp(input, open);
    expect(grant).toBeNull();
    expect(failures).toEqual([expect.stringMatching(/^tsa0: content type/), expect.stringMatching(/^tsa1: Residency egress blocked/)]);
    expect(first.requests).toHaveLength(1);
    expect(second.connections).toBe(0);
  });

  test("a 3xx is refused, not followed", async () => {
    const redirector = await redirectTo(tsa);
    await expect(postTimestampQuery(new URL(`${redirector.url}/tsr`), buildTimestampRequest(DIGEST).der, 5_000, open)).rejects.toThrow(/redirect \(HTTP 302\) refused/);
    await expect(submitRekorV2Entry(new URL(redirector.url), Buffer.from("note"), open)).rejects.toThrow(/redirect \(HTTP 302\) refused/);
    expect(tsa.connections).toBe(0);
  });
});
