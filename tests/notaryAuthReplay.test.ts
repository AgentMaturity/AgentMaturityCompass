import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildNotaryAuthSignature, createNotaryReplayGuard, verifyNotaryRequestAuth } from "../src/notary/notaryAuth.js";

const NOW = 1_800_000_000_000;
const SKEW_SECONDS = 30;
const AUTH = "synthetic-notary-replay-auth";

function authentication(params: {
  method?: string;
  path?: string;
  timestamp?: number;
  timestampText?: string;
  body?: string;
  wireBody?: string;
  signature?: (value: string) => string;
} = {}) {
  const method = params.method ?? "POST";
  const path = params.path ?? "/sign";
  const timestamp = params.timestamp ?? Date.now();
  const bodyBytes = Buffer.from(params.body ?? "synthetic-body");
  const signature = buildNotaryAuthSignature({ secret: AUTH, ts: timestamp, method, path, bodyBytes });
  const req = { method, headers: {
    "x-amc-notary-auth": params.signature?.(signature) ?? signature,
    "x-amc-notary-ts": params.timestampText ?? String(timestamp)
  } } as unknown as IncomingMessage;
  return verifyNotaryRequestAuth({ req, bodyBytes: params.wireBody === undefined ? bodyBytes : Buffer.from(params.wireBody),
    secret: AUTH, headerName: "x-amc-notary-auth", tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: SKEW_SECONDS, path });
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); });

describe("authenticated notary replay admission", () => {
  it.each([["POST", "/sign"], ["GET", "/log/tail"]])(
    "consumes one admission across accepted signature and timestamp spellings for %s %s", (method, path) => {
      const guard = createNotaryReplayGuard();
      const original = authentication({ method, path });
      expect(original.ok).toBe(true);
      if (!original.ok) throw new Error(original.reason);
      expect(original.replayKey).toMatch(/:[a-f0-9]{64}$/);
      expect(guard(original)).toEqual({ ok: true });
      for (const signature of [(value: string) => value.toUpperCase(), (value: string) => ` ${value} `]) {
        const equivalent = authentication({ method, path, signature, timestampText: `${NOW}.0` });
        expect(equivalent.ok).toBe(true);
        if (!equivalent.ok) throw new Error(equivalent.reason);
        expect(equivalent.replayKey).toBe(original.replayKey);
        expect(guard(equivalent)).toEqual({ ok: false, reason: "replay detected" });
      }
    }
  );

  it("retains a future-dated authentication through its inclusive validity boundary", () => {
    const guard = createNotaryReplayGuard();
    const timestamp = NOW + SKEW_SECONDS * 1000;
    const original = authentication({ timestamp });
    expect(original.ok).toBe(true);
    if (!original.ok) throw new Error(original.reason);
    expect(original.replayExpiresTs).toBe(NOW + 2 * SKEW_SECONDS * 1000);
    expect(guard(original)).toEqual({ ok: true });
    for (const now of [NOW + SKEW_SECONDS * 1000 + 1, original.replayExpiresTs]) {
      vi.mocked(Date.now).mockReturnValue(now);
      const replay = authentication({ timestamp });
      expect(replay.ok).toBe(true);
      if (!replay.ok) throw new Error(replay.reason);
      expect(guard(replay)).toEqual({ ok: false, reason: "replay detected" });
    }
    vi.mocked(Date.now).mockReturnValue(original.replayExpiresTs + 1);
    expect(authentication({ timestamp })).toEqual({ ok: false, reason: "timestamp skew exceeded" });
    expect(guard(original)).toEqual({ ok: false, reason: "authentication expired" });
  });

  it("refuses capacity pressure without evicting live consumed authentication", () => {
    const guard = createNotaryReplayGuard(2);
    const admissions = ["one", "two", "three"].map(body => authentication({ body }));
    for (const admission of admissions) if (!admission.ok) throw new Error(admission.reason);
    const [one, two, three] = admissions;
    if (!one?.ok || !two?.ok || !three?.ok) throw new Error("Synthetic authentication failed");
    expect(guard(one)).toEqual({ ok: true });
    expect(guard(two)).toEqual({ ok: true });
    expect(guard(three)).toEqual({ ok: false, reason: "replay protection capacity exhausted" });
    expect(guard(one)).toEqual({ ok: false, reason: "replay detected" });
    expect(guard(two)).toEqual({ ok: false, reason: "replay detected" });
    vi.mocked(Date.now).mockReturnValue(one.replayExpiresTs + 1);
    const fresh = authentication({ body: "three" });
    if (!fresh.ok) throw new Error(fresh.reason);
    expect(guard(fresh)).toEqual({ ok: true });
  });

  it("issues no replay admission for missing or wrong authentication, or changed bytes", () => {
    expect(authentication({ signature: () => "" })).toEqual({ ok: false, reason: "missing signature header" });
    expect(authentication({ signature: value => `${value[0] === "0" ? "1" : "0"}${value.slice(1)}` }))
      .toEqual({ ok: false, reason: "signature mismatch" });
    expect(authentication({ wireBody: "changed-body" })).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("keeps distinct authenticated bodies and routes independent", () => {
    const guard = createNotaryReplayGuard();
    for (const params of [{ body: "one" }, { body: "two" }, { method: "GET", path: "/log/tail", body: "" }]) {
      const admission = authentication(params);
      if (!admission.ok) throw new Error(admission.reason);
      expect(guard(admission)).toEqual({ ok: true });
    }
  });
});
