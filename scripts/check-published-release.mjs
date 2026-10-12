#!/usr/bin/env node
/**
 * P1-41: read-only checks of a published release against public endpoints, with no credentials.
 *
 *   node scripts/check-published-release.mjs <X.Y.Z> [--out <receipt.json>]
 *
 * Checks npm (the version with an integrity, its SLSA provenance attestation, dist-tag latest), the GitHub release
 * (every asset release.yml attaches) and the Studio image (tag v<X.Y.Z> resolves for an anonymous client; its digest is
 * recorded for comparison with the release's image-digests.json). Each check is pass, fail or "not measured" when its
 * endpoint cannot be read; the result is pass only when every check passed, and the exit code is 0 only then.
 * post-publish-verify.yml runs it after every Release run. P0-40 adds the install smoke on clean machines.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.mjs";
import { getPublicJson } from "./lib/publicJson.mjs";

const PACKAGE = "agent-maturity-compass";
const REPO = "AgentMaturity/AgentMaturityCompass";
const IMAGE = "agentmaturity/amc-studio";
const PROVENANCE = "https://slsa.dev/provenance/v1";
const INDEX_TYPES = "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json";

/** The assets release.yml's github-release job attaches (gh release create with failglob). */
export const REQUIRED_RELEASE_ASSETS = (version) => ["SHA256SUMS", `${PACKAGE}-${version}.tgz`, `amc-${version}.amcrelease`,
  "sbom.cdx.json", "licenses.json", "provenance.json", "release-verify.txt", "image-digests.json"];

const check = (name, status, detail) => ({ name, status, detail });
const unread = (name, reason) => check(name, "not measured", reason);

function npmChecks(version, reply) {
  if (!reply.ok && reply.reason !== "HTTP 404") return [unread("npm-version", reply.reason), unread("npm-provenance", reply.reason)];
  const body = reply.ok ? reply.body : null;
  const published = body?.version === version && /^sha512-/.test(body?.dist?.integrity ?? "");
  const provenance = body?.dist?.attestations?.provenance?.predicateType === PROVENANCE;
  return [
    check("npm-version", published ? "pass" : "fail", published ? body.dist.integrity : `${PACKAGE}@${version} is not on npm with an integrity`),
    check("npm-provenance", published && provenance ? "pass" : "fail", provenance ? PROVENANCE : "no SLSA provenance attestation")
  ];
}

async function imageCheck(fetchImpl, version) {
  const name = "studio-image-public";
  const token = await getPublicJson(fetchImpl, `https://ghcr.io/token?scope=repository:${IMAGE}:pull&service=ghcr.io`);
  if (!token.ok) return unread(name, `ghcr.io token: ${token.reason}`);
  if (typeof token.body?.token !== "string") return check(name, "fail", "ghcr.io issued no anonymous pull token");
  try {
    const response = await fetchImpl(`https://ghcr.io/v2/${IMAGE}/manifests/v${version}`, {
      method: "HEAD", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { accept: INDEX_TYPES, authorization: `Bearer ${token.body.token}`, "user-agent": "amc-release-train" }
    });
    const digest = response.headers.get("docker-content-digest") ?? "";
    if (response.status >= 500) return unread(name, `HTTP ${response.status}`);
    if (response.status !== 200 || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
      return check(name, "fail", `ghcr.io/${IMAGE}:v${version} is not pullable anonymously (HTTP ${response.status})`);
    }
    return check(name, "pass", `ghcr.io/${IMAGE}:v${version}@${digest}; compare with image-digests.json on the release`);
  } catch (error) {
    return unread(name, error instanceof Error ? error.message : String(error));
  }
}

/** @param {{ version: string; fetch?: (url: string, init?: any) => Promise<any>; now?: () => Date }} options */
export async function checkPublishedRelease({ version, fetch: fetchImpl = globalThis.fetch, now = () => new Date() }) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error(`"${version}" is not a release version (X.Y.Z)`);
  const checkedAt = now().toISOString();
  const checks = npmChecks(version, await getPublicJson(fetchImpl, `https://registry.npmjs.org/${PACKAGE}/${version}`));

  const tags = await getPublicJson(fetchImpl, `https://registry.npmjs.org/-/package/${PACKAGE}/dist-tags`);
  checks.push(!tags.ok ? unread("npm-latest", tags.reason)
    : check("npm-latest", tags.body?.latest === version ? "pass" : "fail", `dist-tag latest is ${tags.body?.latest}`));

  const release = await getPublicJson(fetchImpl, `https://api.github.com/repos/${REPO}/releases/tags/v${version}`);
  if (!release.ok && release.reason !== "HTTP 404") checks.push(unread("github-release-assets", release.reason));
  else {
    const names = new Set((release.ok && Array.isArray(release.body?.assets) ? release.body.assets : []).map((asset) => asset?.name));
    const missing = REQUIRED_RELEASE_ASSETS(version).filter((name) => !names.has(name));
    checks.push(check("github-release-assets", missing.length ? "fail" : "pass",
      !release.ok ? `no GitHub release v${version}` : missing.length ? `missing: ${missing.join(", ")}` : `${names.size} assets`));
  }

  checks.push(await imageCheck(fetchImpl, version));
  const result = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "not measured") ? "not measured" : "pass";
  return { version, checkedAt, host: `${process.platform}-${process.arch}`, ci: process.env.GITHUB_ACTIONS === "true", result, checks };
}

if (isEntrypoint(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--out");
  try {
    const receipt = await checkPublishedRelease({ version: args.find((arg, index) => !arg.startsWith("--") && index !== at + 1) });
    const text = `${JSON.stringify(receipt, null, 2)}\n`;
    if (at >= 0) {
      mkdirSync(dirname(args[at + 1]), { recursive: true });
      writeFileSync(args[at + 1], text);
    }
    process.stdout.write(text);
    process.exitCode = receipt.result === "pass" ? 0 : 1;
  } catch (error) {
    console.error(`usage: node scripts/check-published-release.mjs <X.Y.Z> [--out <receipt.json>]: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
}
