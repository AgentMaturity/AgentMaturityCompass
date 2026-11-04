/** P2-01 pack registry publish PUT (src/packs/packCli.ts packPublishCli). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { packInitCli, packPublishCli } from "../../src/packs/packCli.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string, blocked: string, open: string, packDir: string;
beforeEach(() => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  packDir = join(root, "residency-pack");
  expect(packInitCli({ directory: packDir, name: "residency-pack" }).success).toBe(true);
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

describe("pack registry publish", () => {
  test("a denied upload calls no fetch and opens no socket; the local tarball it already wrote remains", async () => {
    const registry = await listen();
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await packPublishCli({ workspace: blocked, packDir, registry: registry.url });
    expect(result).toMatchObject({ success: false, published: false, message: expect.stringMatching(/^Residency egress blocked/) });
    expect(spy).not.toHaveBeenCalled();
    expect(registry.connections).toBe(0);
    expect(existsSync(join(packDir, ".amc", "tarballs"))).toBe(true);
  });

  test("the operation workspace is read once: a carrier that later names an open workspace does not widen the check", async () => {
    const registry = await listen();
    let reads = 0;
    const params = { packDir, registry: registry.url, get workspace() { reads += 1; return reads === 1 ? blocked : open; } };
    const result = await packPublishCli(params);
    expect(result).toMatchObject({ success: false, message: expect.stringMatching(/^Residency egress blocked/) });
    expect(reads).toBe(1);
    expect(registry.connections).toBe(0);
  });

  test("a 3xx from the registry is a failed upload, not followed", async () => {
    const target = await listen();
    const redirector = await redirectTo(target);
    const result = await packPublishCli({ workspace: open, packDir, registry: redirector.url });
    expect(result).toMatchObject({ success: false, published: false, message: expect.stringMatching(/registry upload failed \(302\)/) });
    expect(target.connections).toBe(0);
  });
});
