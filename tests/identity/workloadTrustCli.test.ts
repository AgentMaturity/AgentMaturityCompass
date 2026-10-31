import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkloadTrustCommands } from "../../src/cli-workload-trust-commands.js";
import { loadWorkloadTrustConfig } from "../../src/identity/workload/workloadTrust.js";
import { newWorkspace } from "../catalog/l0/workspaces.js";

/** P2-25: `amc identity workload-trust publish|verify|show` publishes a signed config, verifies it, and shows no key material. */
const JWK = { kty: "EC", crv: "P-256", x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU", y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0", kid: "bundle-1" };
let workspace = "", cwd = "", out: string[] = [], err: string[] = [];

beforeEach(() => {
  workspace = newWorkspace("amc-workload-cli-");
  cwd = process.cwd();
  process.chdir(workspace);
  out = []; err = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { out.push(String(line)); });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => { err.push(String(line)); });
});
afterEach(() => {
  process.chdir(cwd);
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerWorkloadTrustCommands(program.command("identity"));
  await program.parseAsync(["node", "amc", "identity", "workload-trust", ...args]);
}

describe("amc identity workload-trust", () => {
  it("publishes a signed config, verifies it, shows names and counts only, and refuses a tampered one", async () => {
    await run("verify");
    expect(out.pop()).toMatch(/no workload trust config/);
    const file = join(workspace, "trust-input.yaml");
    writeFileSync(file, JSON.stringify({ v: 1, spiffe: { trustDomains: [{ trustDomain: "example.org", audience: "amc", jwtAuthorities: [JWK] }] },
      services: ["svc-nightly"], bindings: [{ agentId: "payments", spiffeIds: ["spiffe://example.org/agent/payments"] }] }));
    await run("publish", file);
    expect(out.pop()).toMatch(/published .*workload-trust\.yaml \(signed\)/);
    expect(loadWorkloadTrustConfig(workspace)?.services).toEqual(["svc-nightly"]);
    await run("verify");
    expect(out.pop()).toBe("workload trust config verifies");
    await run("show", "--json");
    const shown = out.pop()!;
    expect(JSON.parse(shown)).toMatchObject({ trustDomains: [{ trustDomain: "example.org", jwtAuthorities: 1 }], services: ["svc-nightly"] });
    expect(shown).not.toContain(JWK.x);
    const path = join(workspace, ".amc", "workload-trust.yaml");
    writeFileSync(path, readFileSync(path, "utf8").replace("svc-nightly", "svc-attacker"));
    await run("verify");
    expect(err.pop()).toMatch(/does not verify/);
    expect(process.exitCode).toBe(1);
  });

  it("refuses to publish an invalid config", async () => {
    const file = join(workspace, "bad.yaml");
    writeFileSync(file, "v: 1\noidcAgentIssuers:\n  - issuer: http://insecure.example\n    audience: x\n    jwksUri: http://insecure.example/keys\n");
    await expect(run("publish", file)).rejects.toThrow();
    expect(loadWorkloadTrustConfig(workspace)).toBeNull();
  });
});
