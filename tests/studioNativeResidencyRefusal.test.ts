// 2026-11-17 A4 walk: once storage admission holds a workspace's sessions, Studio's native task start must say why in
// words before it writes a task descriptor, instead of a generic "Native startup did not finish" after using a task slot.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { NativeTaskDescriptors } from "../src/studio/nativeTaskDescriptors.js";
import { registryStatus } from "../src/residency/admissionWords.js";
import type { NativeTaskActor, NativeTaskService } from "../src/studio/nativeTaskTypes.js";

let createService: typeof import("../src/studio/nativeTaskService.js").createNativeTaskService;
beforeAll(async () => {
  const file = resolve("dist/studio/nativeTaskService.js");
  if (!existsSync(file)) throw new Error("Build the candidate before native Studio process tests.");
  createService = (await import(pathToFileURL(file).href) as typeof import("../src/studio/nativeTaskService.js")).createNativeTaskService;
}, 60_000);

const pass = "synthetic-residency-refusal-vault";
const actor: NativeTaskActor = { principalId: "studio-test:owner", agentId: "default", demo: true };
let root = "", home = "", prior: string | undefined, priorCheckpoints: string | undefined;
const services: NativeTaskService[] = [];
beforeEach(() => {
  prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = pass;
  root = mkdtempSync(join(tmpdir(), "amc-residency-refusal-"));
  home = mkdtempSync(join(tmpdir(), "amc-residency-refusal-home-")); mkdirSync(join(home, ".amc"), { mode: 0o700 });
  // The plan loader reads the host checkpoint root: keep it in this test's own home, never the operator's.
  priorCheckpoints = process.env.AMC_CONTROL_CHECKPOINT_DIR; process.env.AMC_CONTROL_CHECKPOINT_DIR = join(home, ".amc");
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
}, 60_000);
afterEach(async () => {
  await Promise.allSettled(services.splice(0).map(service => service.close()));
  lockVault(root); rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
  if (priorCheckpoints === undefined) delete process.env.AMC_CONTROL_CHECKPOINT_DIR; else process.env.AMC_CONTROL_CHECKPOINT_DIR = priorCheckpoints;
}, 60_000);

test("a held workspace refuses the start in words, with its codes, and writes no task descriptor", async () => {
  // A registry with no signature is refused by storage admission (registry_unverifiable, signature_missing).
  mkdirSync(join(root, ".amc", "residency"), { recursive: true });
  writeFileSync(join(root, ".amc", "residency", "destinations.yaml"), "schemaVersion: amc.residency-destinations/v1\n");
  expect(registryStatus(root).held).toBe("signature_missing");
  const service = createService({ workspace: root, credentialsHome: home, credentialsFile: join(home, ".credentials.yaml"),
    environment: { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass, AMC_TRUST_WORKSPACE: "1" } });
  services.push(service);
  const refused = await service.start(actor, { agentId: "default", clientRequestId: randomUUID(), provider: "stub", tools: "none", prompt: "Say hello.",
    maxSteps: 2, maxTokens: 64 }).then(() => null, (error: unknown) => error as { code: string; statusCode: number; message: string; detail?: unknown });
  expect(refused).toMatchObject({ code: "NATIVE_RESIDENCY_REFUSED", statusCode: 409, detail: { reason: "registry_unverifiable", detail: "signature_missing" } });
  expect(refused!.message).toContain("the destination registry has no signature");
  expect(refused!.message).toContain("amc residency init --file");
  expect(refused!.message).not.toContain(root);
  const directory = new NativeTaskDescriptors(root).directory;
  expect((existsSync(directory) ? readdirSync(directory) : []).filter(name => name.endsWith(".json"))).toEqual([]);
}, 60_000);
