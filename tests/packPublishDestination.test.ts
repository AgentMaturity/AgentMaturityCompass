import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  packInitCli,
  packPublishCli
} from "../src/packs/packCli.js";

const roots: string[] = [];
const originalFetch = globalThis.fetch;

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-publish-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("pack publish destination UX", () => {
  test("default publish creates a local bundle instead of claiming remote registry upload", async () => {
    const root = tempRoot();
    const packDir = join(root, "review-pack");
    const init = packInitCli({ directory: packDir, name: "review-pack" });
    expect(init.success).toBe(true);

    const result = await packPublishCli({ workspace: root, packDir });

    expect(result.success).toBe(true);
    expect(result.published).toBe(false);
    expect(result.destinationKind).toBe("local-bundle");
    expect(result.registry).toBe("local-bundle");
    expect(result.tarballPath).toBeTruthy();
    expect(existsSync(result.tarballPath!)).toBe(true);
    expect(result.message).toContain("Created local publish bundle");
    expect(result.message).not.toContain("Successfully published");
    expect(result.nextSteps.join("\n")).toContain("amc pack registry serve");
    expect(result.nextSteps.join("\n")).toContain("amc pack publish . --registry http://127.0.0.1:4873");
  });

  test("surfaces community registry review gates before upload", async () => {
    const root = tempRoot();
    const packDir = join(root, "review-gated-pack");
    const init = packInitCli({ directory: packDir, name: "review-gated-pack" });
    expect(init.success).toBe(true);

    const result = await packPublishCli({ workspace: root, packDir });
    const nextSteps = result.nextSteps.join("\n");
    const docs = readFileSync(resolve(process.cwd(), "docs/ASSURANCE_LAB.md"), "utf8");

    expect(result.success).toBe(true);
    expect(nextSteps).toContain("Review governance checklist: docs/ASSURANCE_LAB.md#community-registry-review-gates");
    expect(nextSteps).toContain("Confirm provenance/licensing and source references are documented before upload");
    expect(nextSteps).toContain("Run moderation checks: no secrets, malware, unsafe prompts, hidden network calls, or unlicensed copied content");
    expect(docs).toContain("## Community Registry Review Gates");
    expect(docs).toContain("Provenance and license");
    expect(docs).toContain("Moderation rejection criteria");
  });

  test("uploads a real registry PUT payload when --registry is provided", async () => {
    const root = tempRoot();
    const packDir = join(root, "registry-pack");
    const init = packInitCli({ directory: packDir, name: "registry-pack" });
    expect(init.success).toBe(true);

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ success: true, version: "1.0.0" }), { status: 201 });
    }) as typeof fetch;

    const registryUrl = "http://127.0.0.1:4873";
    const result = await packPublishCli({ workspace: root, packDir, registry: registryUrl });

    expect(result.success).toBe(true);
    expect(result.published).toBe(true);
    expect(result.destinationKind).toBe("registry");
    expect(result.registry).toBe(registryUrl);
    expect(result.message).toContain(`Published registry-pack@1.0.0 to ${registryUrl}`);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${registryUrl}/registry-pack`);
    expect(calls[0]?.init?.method).toBe("PUT");

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      name: string;
      version: string;
      _attachments: Record<string, { data: string; length: number }>;
    };
    expect(body.name).toBe("registry-pack");
    expect(body.version).toBe("1.0.0");
    expect(body._attachments["registry-pack-1.0.0.tgz"]?.data).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(body._attachments["registry-pack-1.0.0.tgz"]?.length).toBeGreaterThan(0);
  });

  test("keeps the UX audit aligned with pack publish destination behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R17 — pack publish destination and registry upload are explicit");
    expect(audit).toContain("R35 — community registry governance and moderation gates are explicit");
    expect(audit).toContain("`amc pack publish` creates a local tarball bundle");
    expect(audit).toContain("`amc pack publish . --registry http://127.0.0.1:4873` uploads to a running registry");
    expect(audit).toContain("| 10 | Ryan | Contributor | ⭐⭐⭐ 3/5 | ⭐⭐⭐⭐⭐ 5/5 | +2 | Pack scaffold/test/publish paths and community registry review gates are explicit |");
    expect(audit).not.toContain("Clarify pack publish destination and registry expectations");
    expect(audit).not.toContain("Ryan (⭐⭐⭐⭐) | Decide hosted community registry governance and moderation model");
  });
});
