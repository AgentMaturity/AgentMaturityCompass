// `amc residency init|status`: an operator-written registry is validated with the registry schema, written and signed
// through initDestinationRegistry; a file that does not match is refused and nothing is written.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerResidencyCommands } from "../src/cli-residency-commands.js";
import { storageAdmissionRefusal } from "../src/residency/admissionWords.js";
import { destinationRegistryPath, loadDestinationRegistrySnapshot } from "../src/residency/destinationRegistry.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { setMode } from "../src/mode/mode.js";

vi.setConfig({ testTimeout: 60_000 });
let root = "", files = "";
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-residency-cli-vault");
  root = mkdtempSync(join(tmpdir(), "amc-residency-cli-"));
  files = mkdtempSync(join(tmpdir(), "amc-residency-cli-files-"));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", files);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  vi.spyOn(process, "cwd").mockReturnValue(root);
});
afterEach(() => {
  lockVault(root); vi.restoreAllMocks(); vi.unstubAllEnvs(); process.exitCode = undefined;
  for (const dir of [root, files]) rmSync(dir, { recursive: true, force: true });
});

async function residency(args: string[]): Promise<string> {
  const out: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { out.push(String(line)); });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => { out.push(String(line)); });
  const program = new Command().exitOverride();
  registerResidencyCommands(program);
  await program.parseAsync(["residency", ...args], { from: "user" });
  return out.join("\n");
}

const REGISTRY = `schemaVersion: amc.residency-destinations/v1
profile: null
destinations:
  - destinationId: this-laptop
    match: { hosts: [localhost] }
    channels: [storage]
    region: { jurisdiction: US, code: us-operator-laptop }
    transferBasis: null
rules:
  - ruleId: us-data-stays-us
    controlId: operator-us-01
    appliesTo: { dataClasses: [health], jurisdictions: [US] }
    allowedJurisdictions: [US]
    acceptsTransferBasis: false
`;

test("init validates, writes and signs the operator's registry, and status reads it back in words", async () => {
  const file = join(files, "registry.yaml");
  writeFileSync(file, REGISTRY);
  const said = await residency(["init", "--file", file]);
  expect(process.exitCode).toBeUndefined();
  expect(said).toContain("Wrote and signed .amc/residency/destinations.yaml.");
  expect(said).toContain("1 rule(s); destinations: this-laptop (storage; region US/us-operator-laptop)");
  expect(loadDestinationRegistrySnapshot(root).state).toBe("verified");
  const status = await residency(["status"]);
  expect(status).toContain("Active compiled plan: none.");
  // Status says what admission does: this registry declares no storage URL (profile: null), so sessions are held.
  expect(status).toContain("the destination registry declares no storage URL");
  expect(storageAdmissionRefusal(root)?.detail).toBe("storage_destination_missing");
});

test("a registry that does not match the schema is refused and nothing is written", async () => {
  const file = join(files, "registry.yaml");
  writeFileSync(file, REGISTRY.replace("rules:", "rulez:"));
  const said = await residency(["init", "--file", file]);
  expect(process.exitCode).toBe(1);
  expect(said).toContain("The registry does not match the schema");
  expect(existsSync(destinationRegistryPath(root))).toBe(false);
});

test("agent mode refuses init, so an agent cannot rewrite the registry", async () => {
  const file = join(files, "registry.yaml");
  writeFileSync(file, REGISTRY);
  setMode(root, "agent");
  const said = await residency(["init", "--file", file]);
  expect(process.exitCode).toBe(1);
  expect(said).toContain("'residency init' is blocked in agent mode");
  expect(existsSync(destinationRegistryPath(root))).toBe(false);
});
