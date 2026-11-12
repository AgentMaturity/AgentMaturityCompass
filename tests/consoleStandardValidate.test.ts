import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initWorkspace } from "../src/workspace.js";

/** H6: Standard → Validate Artifact reads only workspace files, never echoes content, and answers bad input with 400. */
describe("POST /standard/validate", () => {
  let workspace: string;
  let outside: string;
  let api: Awaited<ReturnType<typeof startStudioApiServer>>;
  const validate = async (body: unknown) => {
    const res = await fetch(`${api.url}/standard/validate`, {
      method: "POST",
      headers: { "x-amc-admin-token": "std-token", "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    });
    return { status: res.status, text: await res.text() };
  };

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), "amc-std-validate-"));
    outside = mkdtempSync(join(tmpdir(), "amc-std-outside-"));
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "std-validate");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    writeFileSync(join(outside, "secret.txt"), "TOPSECRET-CONTENT not json");
    writeFileSync(join(workspace, "notjson.txt"), "INSIDE-CONTENT not json");
    writeFileSync(join(workspace, "empty.json"), "{}");
    symlinkSync(join(outside, "secret.txt"), join(workspace, "link.json"));
    api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "std-token" });
  }, 60_000);

  afterAll(async () => {
    await api?.close();
    vi.unstubAllEnvs();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  test("an absolute path outside the workspace is refused with 400 and no content", async () => {
    const out = await validate({ schemaId: "amcpass", file: join(outside, "secret.txt") });
    expect(out.status).toBe(400);
    expect(out.text).toMatch(/inside the workspace/);
    expect(out.text).not.toContain("TOPSECRET");
    const etc = await validate({ schemaId: "amcpass", file: "/etc/passwd" });
    expect(etc.status).toBe(400);
    expect(etc.text).not.toContain("root:");
  });

  test("a relative traversal is refused", async () => {
    const out = await validate({ schemaId: "amcpass", file: "../../../../../../etc/passwd" });
    expect(out.status).toBe(400);
    expect(out.text).not.toContain("root:");
  });

  test("a symlink that escapes the workspace is refused", async () => {
    const out = await validate({ schemaId: "amcpass", file: "link.json" });
    expect(out.status).toBe(400);
    expect(out.text).not.toContain("TOPSECRET");
  });

  test("the protected .amc directory is refused", async () => {
    const out = await validate({ schemaId: "amcpass", file: ".amc/amc.config.yaml" });
    expect(out.status).toBe(400);
  });

  test("empty or invalid input is 400, never 500", async () => {
    expect((await validate("")).status).toBe(400);
    expect((await validate("{not json")).status).toBe(400);
    expect((await validate({ schemaId: "", file: "" })).status).toBe(400);
    expect((await validate({ schemaId: "amcpass", file: "  " })).status).toBe(400);
    expect((await validate({ schemaId: "no-such-schema", file: "empty.json" })).status).toBe(400);
  });

  test("a workspace file that is not JSON fails validation without echoing its content", async () => {
    const out = await validate({ schemaId: "amcpass", file: "notjson.txt" });
    expect(out.status).toBe(422);
    expect(out.text).not.toContain("INSIDE");
    expect(JSON.parse(out.text)).toMatchObject({ ok: false });
  });

  test("a workspace file is validated and its schema errors returned", async () => {
    const out = await validate({ schemaId: "amcpass", file: "empty.json" });
    expect(out.status).toBe(422);
    const body = JSON.parse(out.text) as { ok: boolean; errors: string[]; file: string };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.file).toBe("empty.json");
    expect(body.errors.every((line) => /^[\w.()]+: /.test(line))).toBe(true);
  });
});
