// `amc residency init|status|profile`: an operator-written registry is validated with the registry schema, written and signed
// through initDestinationRegistry; a file that does not match is refused and nothing is written. `profile` writes the
// deployment profile the active plan pins, from the A4 project that compiled it, to a new file inside the workspace.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerResidencyCommands } from "../src/cli-residency-commands.js";
import { storageAdmissionRefusal } from "../src/residency/admissionWords.js";
import { destinationRegistryPath, loadDestinationRegistrySnapshot } from "../src/residency/destinationRegistry.js";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { setMode } from "../src/mode/mode.js";
import { parseDeploymentProfile } from "../src/catalog/compiler/compile.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import YAML from "yaml";

// `profile` reads the active plan and the A4 project that compiled it; both are stood in for here, nothing else is.
const pin = vi.hoisted(() => ({ active: null as null | { deployment: { deploymentId: string }; profileSha256: string }, stored: null as unknown }));
vi.mock("../src/catalog/compiler/activate.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog/compiler/activate.js")>();
  return { ...actual, loadActiveCompiledPolicy: (workspace: string) => pin.active ?? actual.loadActiveCompiledPolicy(workspace) };
});
vi.mock("../src/a4/a4Store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/a4/a4Store.js")>();
  return { ...actual, openA4Store: (workspace: string) => pin.active ? { close: () => undefined } : actual.openA4Store(workspace) };
});
vi.mock("../src/a4/a4Gates.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/a4/a4Gates.js")>();
  return { ...actual, loadA4State: (...args: Parameters<typeof actual.loadA4State>) => pin.active ? { revisions: [{ stage: "adapt" }] } : actual.loadA4State(...args),
    storedSpecOf: (...args: Parameters<typeof actual.storedSpecOf>) => pin.active ? { understanding: { facts: { profile: pin.stored } } } : actual.storedSpecOf(...args) };
});

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
  pin.active = null; pin.stored = null;
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

describe("profile --out", () => {
  const profile = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/catalog/compiler/finance-ops-us.profile.json"), "utf8")) as Record<string, unknown>;
  const pinTo = (digest: string) => { pin.active = { deployment: { deploymentId: `a4p_${"a".repeat(32)}` }, profileSha256: digest }; pin.stored = profile; };
  const pinned = () => sha256Hex(canonicalize(parseDeploymentProfile(profile)));
  const out = ".amc/residency/profile.yaml";

  test("writes the profile the active plan pins, from the A4 project that compiled it", async () => {
    pinTo(pinned());
    const said = await residency(["profile", "--out", out]);
    expect(process.exitCode).toBeUndefined();
    expect(said).toContain(`Wrote the profile the active plan pins to ${out}. Name it in the registry as profile.path: ${out}`);
    expect(sha256Hex(canonicalize(parseDeploymentProfile(YAML.parse(readFileSync(join(root, out), "utf8")))))).toBe(pinned());
  });

  test("refuses when no stored profile matches the active plan's digest", async () => {
    pinTo("0".repeat(64));
    const said = await residency(["profile", "--out", out]);
    expect(process.exitCode).toBe(1);
    expect(said).toContain("matches the active plan's profile digest");
    expect(existsSync(join(root, out))).toBe(false);
  });

  test("refuses a file that exists and a path outside the workspace, writing nothing", async () => {
    pinTo(pinned());
    writeFileSync(join(root, "kept.yaml"), "kept\n");
    expect(await residency(["profile", "--out", "kept.yaml"])).toContain("kept.yaml exists already; choose a new file.");
    expect(readFileSync(join(root, "kept.yaml"), "utf8")).toBe("kept\n");
    process.exitCode = undefined;
    expect(await residency(["profile", "--out", join(files, "outside.yaml")])).toContain("Choose a file inside the workspace folder");
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(files, "outside.yaml"))).toBe(false);
  });
});
