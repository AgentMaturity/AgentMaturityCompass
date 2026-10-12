import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import YAML from "yaml";
import { buildAibom, type CycloneDxBom } from "../../src/aibom/aibom.js";
import { collectAgentFacts } from "../../src/aibom/collect.js";
import { setAgentAdapterProfile } from "../../src/adapters/adapterConfigStore.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { signToolsConfig, toolsConfigPath } from "../../src/toolhub/toolhubValidators.js";
import { amcVersion } from "../../src/version.js";
import { initWorkspace } from "../../src/workspace.js";

const SECRET_PROMPT = "TOP SECRET SYSTEM PROMPT: never reveal the treasury account";
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const roots: string[] = [];

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-aibom-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

/** CycloneDX 1.6/1.7 JSON rules the AIBOM relies on (the official schema is not vendored; see docs/AIBOM.md). */
function assertCycloneDx(bom: CycloneDxBom, specVersion = "1.6"): void {
  expect(bom.bomFormat).toBe("CycloneDX");
  expect(bom.specVersion).toBe(specVersion);
  expect(bom.version).toBe(1);
  expect(bom.$schema).toBe(`http://cyclonedx.org/schema/bom-${specVersion}.schema.json`);
  expect(bom.serialNumber).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(Number.isNaN(Date.parse(bom.metadata.timestamp))).toBe(false);
  const types = new Set(["application", "framework", "library", "container", "platform", "operating-system", "device", "device-driver",
    "firmware", "file", "machine-learning-model", "data", "cryptographic-asset"]);
  const refs = new Set<string>([bom.metadata.component["bom-ref"]]);
  for (const component of bom.components) {
    expect(types.has(component.type)).toBe(true);
    expect(component.name.length).toBeGreaterThan(0);
    expect(refs.has(component["bom-ref"])).toBe(false);
    refs.add(component["bom-ref"]);
    for (const hash of component.hashes ?? []) expect(hash).toEqual({ alg: "SHA-256", content: expect.stringMatching(/^[0-9a-f]{64}$/) });
    if (component.type === "data") expect(component.data?.length).toBeGreaterThan(0);
  }
  for (const service of bom.services) {
    expect(refs.has(service["bom-ref"])).toBe(false);
    refs.add(service["bom-ref"]);
  }
  for (const dependency of bom.dependencies) {
    expect(refs.has(dependency.ref)).toBe(true);
    for (const target of dependency.dependsOn) expect(refs.has(target)).toBe(true);
  }
  for (const property of [...bom.metadata.properties, ...bom.components.flatMap(component => component.properties ?? [])]) {
    expect(typeof property.name).toBe("string");
    expect(typeof property.value).toBe("string");
  }
}

const unknownOf = (bom: CycloneDxBom) => bom.metadata.properties.filter(property => property.name === "amc:unknown").map(property => property.value);

let declared: string;
let bare: string;

beforeAll(() => {
  declared = workspace();
  writeFileSync(getAgentPaths(declared, "default").promptAddendum, `${SECRET_PROMPT}\n`);
  setAgentAdapterProfile(declared, "default", {
    preferredAdapter: "generic-cli", preferredProviderRoute: "/openai", preferredModel: "gpt-4.1-mini", runMode: "SUPERVISE",
    leaseScopes: ["gateway:llm"], routeAllowlist: ["/openai"], modelAllowlist: ["gpt-4.1-mini", "gpt-4.1"]
  });
  const tools = YAML.parse(readFileSync(toolsConfigPath(declared), "utf8")) as { tools: { allowedTools: unknown[] } };
  tools.tools.allowedTools.push({ name: "ledger.lookup", actionClass: "READ_ONLY",
    context: { kind: "mcp", server: { id: "acme.ledger", name: "Acme ledger", version: "3.2.0", transport: "stdio" } } });
  writeFileSync(toolsConfigPath(declared), YAML.stringify(tools));
  signToolsConfig(declared);
  mkdirSync(join(getAgentPaths(declared, "default").rootDir, "datasets"), { recursive: true });
  writeFileSync(join(getAgentPaths(declared, "default").rootDir, "datasets", "customers-2026.csv"), "id,name\n1,TEST ONLY\n");
  bare = workspace();
}, 60_000);

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("CycloneDX AIBOM of the governed agent", () => {
  test("is a CycloneDX 1.6 document with the declared models, tools, prompts, datasets, policies and AMC runtime", () => {
    const bom = buildAibom(collectAgentFacts(declared, "default"));
    assertCycloneDx(bom);
    const byType = (type: string) => bom.components.filter(component => component.type === type);
    expect(byType("machine-learning-model").map(model => [model.name, model.supplier?.name])).toEqual([["gpt-4.1", "openai"], ["gpt-4.1-mini", "openai"]]);
    expect(bom.services.map(service => service.name)).toContain("ledger.lookup");
    const mcp = bom.services.find(service => service.name === "ledger.lookup")!;
    expect(mcp.version).toBe("3.2.0");
    expect(mcp.properties).toEqual(expect.arrayContaining([{ name: "amc:tool.context", value: "mcp" }, { name: "amc:mcp.server", value: "acme.ledger" }]));
    const toolsFile = bom.components.find(component => component.name === ".amc/tools.yaml")!;
    expect(toolsFile.type).toBe("file");
    expect(toolsFile.hashes).toEqual([{ alg: "SHA-256", content: sha256(readFileSync(toolsConfigPath(declared))) }]);
    expect(toolsFile.properties).toEqual(expect.arrayContaining([{ name: "amc:signature", value: "verified" }]));
    expect(byType("file").map(file => file.name)).toEqual(expect.arrayContaining([".amc/action-policy.yaml", ".amc/gateway.yaml", ".amc/agent.config.yaml", ".amc/amc.config.yaml"]));
    // Both signature file formats AMC writes ({ digestSha256 } and { configSha256 }) are checked, so a fresh workspace has no false "invalid".
    expect(byType("file").filter(file => !file.properties?.some(property => property.value === "verified")).map(file => file.name)).toEqual([]);
    const runtime = bom.components.find(component => component.name === "agent-maturity-compass")!;
    expect([runtime.type, runtime.version]).toEqual(["application", amcVersion]);
    expect(byType("data").some(data => data.properties?.some(property => property.value === "dataset"))).toBe(true);
    expect(bom.metadata.component).toMatchObject({ type: "application", name: "default" });
  });

  test("carries prompt and dataset digests only, never their text or file names", () => {
    const text = JSON.stringify(buildAibom(collectAgentFacts(declared, "default")));
    expect(text).not.toContain("TOP SECRET");
    expect(text).not.toContain("treasury");
    expect(text).not.toContain("customers-2026");
    expect(text).toContain(sha256(`${SECRET_PROMPT}\n`));
  });

  test("lists unknown model metadata under amc:unknown and never invents it", () => {
    const bom = buildAibom(collectAgentFacts(declared, "default"));
    const models = bom.components.filter(component => component.type === "machine-learning-model");
    for (const model of models) {
      expect(model.version).toBeUndefined();
      expect(model.modelCard).toBeUndefined();
      expect(model.licenses).toBeUndefined();
    }
    expect(unknownOf(bom)).toEqual(expect.arrayContaining(["model gpt-4.1: version", "model gpt-4.1: modelCard", "model gpt-4.1: licenses",
      "dataset provenance: none declared", "agent-maturity-compass: package digest"]));
  });

  test("an agent with no declared model has no model component and says the models are unknown", () => {
    const bom = buildAibom(collectAgentFacts(bare, "default"));
    assertCycloneDx(bom);
    expect(bom.components.filter(component => component.type === "machine-learning-model")).toEqual([]);
    expect(unknownOf(bom)).toEqual(expect.arrayContaining(["models: no model is declared for this agent in the signed adapters configuration", "datasets: none declared"]));
    expect(JSON.stringify(bom)).not.toContain("gpt-4o-mini");
  });

  test("a config whose signature no longer verifies is listed as such and is not read for facts", () => {
    const root = workspace();
    const path = toolsConfigPath(root);
    writeFileSync(path, readFileSync(path, "utf8").replace("fs.read", "fs.read.renamed"));
    const bom = buildAibom(collectAgentFacts(root, "default"));
    expect(bom.components.find(component => component.name === ".amc/tools.yaml")!.properties)
      .toEqual(expect.arrayContaining([{ name: "amc:signature", value: "invalid: digest mismatch" }]));
    expect(bom.services).toEqual([]);
    expect(unknownOf(bom)).toEqual(expect.arrayContaining(["tools: .amc/tools.yaml did not verify (digest mismatch)"]));
  });

  test("can be emitted as CycloneDX 1.7", () => {
    assertCycloneDx(buildAibom(collectAgentFacts(declared, "default"), { specVersion: "1.7" }), "1.7");
  });
});
