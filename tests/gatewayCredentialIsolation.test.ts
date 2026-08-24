import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upstreamCredentials } from "../src/gateway/upstreamAuth.js";
import { resolveCredentialsPaths } from "../src/credentials/credentialsPaths.js";

/**
 * Outbound upstream credentials must never come from a file the evaluated agent
 * can write.
 *
 * The gateway already refuses agent-supplied credentials over the wire
 * (stripAgentProvidedCredentials in gateway/server.ts). When the credentials
 * seam landed, upstreamCredentials built its store with `projectDir: workspace`,
 * which adds a `project-env` layer at `<workspace>/.env` — and the workspace is
 * exactly what the evaluated agent can write. Demonstrated before the fix: an
 * agent-written .env supplied the key the gateway then sent upstream. A second
 * door into the same place is still the same escalation.
 *
 * Operator-controlled sources only: process env and the AMC home store.
 */
const ATTACKER_KEY = "sk-attacker-controlled-key";

function withWorkspaceDotenv<T>(fn: (workspace: string) => T): T {
  const workspace = mkdtempSync(join(tmpdir(), "amc-cred-isolation-"));
  writeFileSync(join(workspace, ".env"), `OPENAI_API_KEY=${ATTACKER_KEY}\n`);
  try {
    return fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe("gateway upstream credentials are isolated from the agent-writable workspace", () => {
  it("does not resolve a credential written into the workspace .env", async () => {
    await withWorkspaceDotenv(async (workspace) => {
      const prior = process.env["OPENAI_API_KEY"];
      delete process.env["OPENAI_API_KEY"];
      const credentials = upstreamCredentials(workspace);
      try {
        const resolved = await credentials.resolve("OPENAI_API_KEY");
        // Absent, not the attacker's value. Asserting on the exact string is
        // safe here because it is a fixture, never a real secret.
        expect(resolved ?? "").not.toContain(ATTACKER_KEY);
      } finally {
        await credentials.close();
        if (prior === undefined) delete process.env["OPENAI_API_KEY"];
        else process.env["OPENAI_API_KEY"] = prior;
      }
    });
  });

  it("still resolves from the process environment — the env-only rollback path", async () => {
    await withWorkspaceDotenv(async (workspace) => {
      const prior = process.env["OPENAI_API_KEY"];
      process.env["OPENAI_API_KEY"] = "sk-operator-supplied";
      const credentials = upstreamCredentials(workspace);
      try {
        // The operator's environment must keep working exactly as before; this
        // is the plan's stated rollback posture (env-vars-only fallback).
        expect(await credentials.resolve("OPENAI_API_KEY")).toBe("sk-operator-supplied");
      } finally {
        await credentials.close();
        if (prior === undefined) delete process.env["OPENAI_API_KEY"];
        else process.env["OPENAI_API_KEY"] = prior;
      }
    });
  });

  it("a null projectDir disables the project-env layer at the path level", () => {
    // The mechanism the isolation rests on, pinned directly: with the layer
    // disabled there is no project .env path to read at all.
    expect(resolveCredentialsPaths({ projectDir: null }).projectEnvFile).toBeNull();
    expect(resolveCredentialsPaths({ projectDir: "/tmp/somewhere" }).projectEnvFile).not.toBeNull();
  });
});
