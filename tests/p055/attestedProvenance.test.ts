/** P0-55 case 6 (P0-18): an attested copy binds to its event's time, and one event counts once per agent across sessions. */
import { expect, test } from "vitest";
import { bundleDigest, countAttestedOnce, effectiveTrustTier, type ThirdPartyAttestation } from "../../src/claims/evidenceProvenance.js";
import { signHexDigest } from "../../src/crypto/keys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { context, listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const KEY = testKey();
const TRUST = context({ lists: [trustList([listEntry(KEY, { purposes: ["independent-attestation"] })])] });
const PAYLOAD = sha256Hex("user: hello");
const ROW_TS = 1_000_000;

function copy(sessionId: string, entryTs: number, rowTs: number | undefined) {
  const bundle = [{ id: "orig-1", sha256: PAYLOAD, ts: entryTs, agentId: "agent-a", sessionId }];
  const digest = bundleDigest(bundle);
  const attestation: ThirdPartyAttestation = { keyId: KEY.keyId, sigB64: signHexDigest(digest, KEY.privateKeyPem), digestSha256: digest,
    attestedBy: "Example Audit LLP", bundle };
  const meta = { source: "attested_ingest", trustTier: "ATTESTED", agentId: "agent-a", ingestSessionId: sessionId, originalEventId: "orig-1", attestation };
  return { meta_json: JSON.stringify(meta), payload_sha256: PAYLOAD, session_id: sessionId, ...(rowTs === undefined ? {} : { ts: rowTs }) };
}

test("a bound copy within the skew bound reads ATTESTED (the control)", () => {
  expect(effectiveTrustTier(copy("s-a", ROW_TS, ROW_TS), { trustList: TRUST })).toBe("ATTESTED");
});

test("an attested event 10 minutes after the row that copies it reads SELF_REPORTED", () => {
  expect(effectiveTrustTier(copy("s-a", ROW_TS + 10 * 60_000, ROW_TS), { trustList: TRUST })).toBe("SELF_REPORTED");
});

test("a copy row without ts reads SELF_REPORTED", () => {
  expect(effectiveTrustTier(copy("s-a", ROW_TS, undefined), { trustList: TRUST })).toBe("SELF_REPORTED");
});

test("two bound copies of one original event for one agent in two sessions count once, as the earliest", () => {
  const first = { ...copy("s-a", ROW_TS, ROW_TS + 1), ts: ROW_TS + 1 };
  const second = { ...copy("s-b", ROW_TS, ROW_TS + 2), ts: ROW_TS + 2 };
  const tierOf = (row: typeof first) => effectiveTrustTier(row, { trustList: TRUST });
  expect([first, second].map(tierOf)).toEqual(["ATTESTED", "ATTESTED"]);
  expect(countAttestedOnce([second, first], tierOf, { startTs: 0, endTs: ROW_TS + 10 })).toEqual([first]);
});
