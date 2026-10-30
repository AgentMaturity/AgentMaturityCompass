import { describe, expect, test } from "vitest";
import { checkPublishedRelease, REQUIRED_RELEASE_ASSETS } from "../scripts/check-published-release.mjs";

const V = "2.0.1";
const NPM = `https://registry.npmjs.org/agent-maturity-compass/${V}`;
const TAGS = "https://registry.npmjs.org/-/package/agent-maturity-compass/dist-tags";
const RELEASE = `https://api.github.com/repos/AgentMaturity/AgentMaturityCompass/releases/tags/v${V}`;
const GHCR_TOKEN = "https://ghcr.io/token?scope=repository:agentmaturity/amc-studio:pull&service=ghcr.io";
const MANIFEST = `https://ghcr.io/v2/agentmaturity/amc-studio/manifests/v${V}`;
const DIGEST = `sha256:${"a".repeat(64)}`;
const PROVENANCE = { predicateType: "https://slsa.dev/provenance/v1" };

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;
function fakeFetch(overrides: Record<string, Reply> = {}) {
  const replies: Record<string, Reply> = {
    [NPM]: { status: 200, body: { version: V, dist: { integrity: "sha512-x", attestations: { provenance: PROVENANCE } } } },
    [TAGS]: { status: 200, body: { latest: V } },
    [RELEASE]: { status: 200, body: { tag_name: `v${V}`, assets: REQUIRED_RELEASE_ASSETS(V).map(name => ({ name })) } },
    [GHCR_TOKEN]: { status: 200, body: { token: "anonymous" } },
    [MANIFEST]: { status: 200, headers: { "docker-content-digest": DIGEST } },
    ...overrides
  };
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[] = [];
  const fetch = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
    calls.push({ url, init });
    const reply = replies[url] ?? { status: 404 };
    if (reply instanceof Error) throw reply;
    return { status: reply.status, json: async () => reply.body, headers: { get: (name: string) => reply.headers?.[name.toLowerCase()] ?? null } };
  };
  return { fetch, calls };
}
const NOW = () => new Date("2026-10-21T10:00:00Z");
const statuses = (receipt: { checks: { name: string; status: string }[] }) => Object.fromEntries(receipt.checks.map(c => [c.name, c.status]));

describe("post-publish release check (P1-41)", () => {
  test("a fully published release passes every read-only check and records the image digest", async () => {
    const { fetch, calls } = fakeFetch();
    const receipt = await checkPublishedRelease({ version: V, fetch, now: NOW });
    expect(receipt.result).toBe("pass");
    expect(receipt.checkedAt).toBe("2026-10-21T10:00:00.000Z");
    expect(statuses(receipt)).toEqual({ "npm-version": "pass", "npm-provenance": "pass", "npm-latest": "pass",
      "github-release-assets": "pass", "studio-image-public": "pass" });
    expect(receipt.checks.find(c => c.name === "studio-image-public")?.detail).toContain(DIGEST);
    expect(calls.every(call => !JSON.stringify(call.init ?? {}).includes("authorization") || call.url === MANIFEST)).toBe(true);
    expect(calls.filter(call => call.init?.method && call.init.method !== "GET" && call.init.method !== "HEAD")).toEqual([]);
  });

  test("a version missing from npm fails, and its provenance cannot pass without it", async () => {
    const { fetch } = fakeFetch({ [NPM]: { status: 404 } });
    const receipt = await checkPublishedRelease({ version: V, fetch, now: NOW });
    expect(receipt.result).toBe("fail");
    expect(statuses(receipt)).toMatchObject({ "npm-version": "fail", "npm-provenance": "fail" });
  });

  test("no provenance attestation, a latest tag on another version or a missing asset fails", async () => {
    const { fetch } = fakeFetch({
      [NPM]: { status: 200, body: { version: V, dist: { integrity: "sha512-x" } } },
      [TAGS]: { status: 200, body: { latest: "2.0.0" } },
      [RELEASE]: { status: 200, body: { assets: REQUIRED_RELEASE_ASSETS(V).filter(name => name !== "SHA256SUMS").map(name => ({ name })) } }
    });
    const receipt = await checkPublishedRelease({ version: V, fetch, now: NOW });
    expect(statuses(receipt)).toMatchObject({ "npm-provenance": "fail", "npm-latest": "fail", "github-release-assets": "fail" });
    expect(receipt.checks.find(c => c.name === "npm-latest")?.detail).toBe("dist-tag latest is 2.0.0");
    expect(receipt.checks.find(c => c.name === "github-release-assets")?.detail).toBe("missing: SHA256SUMS");
  });

  test("an unreachable endpoint is not measured, never a pass, and the result is not a pass", async () => {
    const { fetch } = fakeFetch({ [TAGS]: new Error("connect ETIMEDOUT"), [GHCR_TOKEN]: { status: 502 } });
    const receipt = await checkPublishedRelease({ version: V, fetch, now: NOW });
    expect(statuses(receipt)).toMatchObject({ "npm-latest": "not measured", "studio-image-public": "not measured" });
    expect(receipt.result).toBe("not measured");
  });

  test("an image that anonymous clients cannot pull fails", async () => {
    const { fetch } = fakeFetch({ [MANIFEST]: { status: 401 } });
    const receipt = await checkPublishedRelease({ version: V, fetch, now: NOW });
    expect(statuses(receipt)["studio-image-public"]).toBe("fail");
    expect(receipt.result).toBe("fail");
  });

  test("refuses anything but an X.Y.Z version before any request", async () => {
    const { fetch, calls } = fakeFetch();
    await expect(checkPublishedRelease({ version: "2.0.1; rm -rf /", fetch, now: NOW })).rejects.toThrow(/X\.Y\.Z/);
    expect(calls).toEqual([]);
  });
});
