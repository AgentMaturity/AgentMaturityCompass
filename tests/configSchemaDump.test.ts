import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { renderConfigSchema } from "../src/config/configSchemaDump.js";
import { amcAgentSchema, amcDeclarativeConfigSchema } from "../src/config/amcConfigSchema.js";

const addFormats: import("ajv-formats").FormatsPlugin = createRequire(import.meta.url)("ajv-formats");

describe("config JSON Schema dump", () => {
  it("defaults to the declarative input schema and renders stable, sorted JSON", () => {
    const text = renderConfigSchema();
    expect(text).toBe(renderConfigSchema("declarative"));
    expect(text).toBe(renderConfigSchema());
    const schema = JSON.parse(text);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.required).toEqual(["agents"]);
    expect(text).toBe(`${JSON.stringify(schema, null, 2)}\n`);
    function checkKeys(value: unknown): void {
      if (Array.isArray(value)) value.forEach(checkKeys);
      else if (value !== null && typeof value === "object") {
        expect(Object.keys(value)).toEqual(Object.keys(value).sort());
        Object.values(value).forEach(checkKeys);
      }
    }
    checkKeys(schema);
  });

  const fixtures: Array<[string, unknown, boolean]> = [
    ["minimal defaults", { agents: [{ id: "worker" }] }, true],
    ["nested defaults", { agents: [{ id: "worker" }], thresholds: {}, output: {}, ci: {} }, true],
    ["full input", { version: "1.0", agents: [{ id: "worker", runtime: "claude", riskTier: "high" }],
      providers: [{ id: "local", baseUrl: "https://example.test/v1" }],
      thresholds: { minIntegrityIndex: 0.7, layers: { Resilience: 3 } },
      assurance: { packs: ["security", { id: "safety", minSeverity: "high" }] } }, true],
    ["ignored extra field", { agents: [{ id: "worker" }], unknown: "ignored by Zod" }, true],
    ["missing agents", {}, false],
    ["empty agents", { agents: [] }, false],
    ["invalid version", { agents: [{ id: "worker" }], version: "2.0" }, false],
    ["invalid agent runtime", { agents: [{ id: "worker", runtime: "unknown" }] }, false],
    ["invalid threshold", { agents: [{ id: "worker" }], thresholds: { minIntegrityIndex: 1.1 } }, false],
    ["invalid layer", { agents: [{ id: "worker" }], thresholds: { layers: { Unknown: 2 } } }, false],
    ["invalid provider URL", { agents: [{ id: "worker" }], providers: [{ id: "bad", baseUrl: "invalid" }] }, false],
    ["invalid union member", { agents: [{ id: "worker" }], assurance: { packs: [42] } }, false],
  ];

  it.each(fixtures)("matches declarative Zod acceptance: %s", (_name, value, accepted) => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(renderConfigSchema()));
    expect(amcDeclarativeConfigSchema.safeParse(value).success).toBe(accepted);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(accepted);
  });

  it("exports the existing agent schema with optional input defaults", () => {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(renderConfigSchema("agent")));
    for (const [value, accepted] of [
      [{ id: "worker" }, true],
      [{ id: "worker", runtime: "sandbox", riskTier: "critical", env: { KEY: "value" } }, true],
      [{}, false],
      [{ id: "worker", riskTier: "impossible" }, false],
      [{ id: "worker", env: { KEY: 1 } }, false],
    ] as const) {
      expect(amcAgentSchema.safeParse(value).success).toBe(accepted);
      expect(validate(value), JSON.stringify(validate.errors)).toBe(accepted);
    }
  });

  it.each(["missing", "toString", "__proto__", "studio", "preset"])("refuses unsupported target %s", (name) => {
    expect(() => renderConfigSchema(name)).toThrow(/Unknown config schema/);
  });

  it("imports and dumps from an empty directory without booting a workspace", () => {
    const directory = mkdtempSync(join(tmpdir(), "amc-schema-dump-"));
    try {
      const moduleUrl = new URL("../dist/config/configSchemaDump.js", import.meta.url).href;
      const script = `globalThis.fetch = () => { throw new Error("schema dump must not fetch"); }; const { renderConfigSchema } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(renderConfigSchema());`;
      const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], { cwd: directory, encoding: "utf8" });
      expect(output).toBe(renderConfigSchema());
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["declarative", "agent"])("dumps %s through the public CLI without workspace boot", (name) => {
    const directory = mkdtempSync(join(tmpdir(), "amc-schema-cli-"));
    try {
      const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
      const args = [cli, "config", "validate", "--schema", ...(name === "agent" ? [name] : [])];
      const options = { cwd: directory, encoding: "utf8" as const, env: {
        ...process.env, AMC_NO_AUTO_REBUILD: "1", AMC_BOOTSTRAP: "true",
        AMC_VAULT_PASSPHRASE_FILE: join(directory, "missing-secret"), NO_COLOR: "1",
      } };
      const first = spawnSync(process.execPath, args, options);
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout).toBe(renderConfigSchema(name));
      const second = spawnSync(process.execPath, args, options);
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toBe(first.stdout);
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["declarative", "agent"])("skips native ABI repair and network for public %s dump", (name) => {
    const directory = mkdtempSync(join(tmpdir(), "amc-schema-native-"));
    try {
      // Static CLI imports may load the SQLite JS wrapper; only the native guard's actual probe is refused.
      const preload = `
        import Module, { syncBuiltinESMExports } from "node:module";
        import childProcess from "node:child_process";
        import http from "node:http";
        import https from "node:https";
        import net from "node:net";
        import tls from "node:tls";
        const load = Module._load;
        Module._load = function(request, parent, ...args) {
          if (request === "better-sqlite3" && parent?.filename?.endsWith("/storage/nativeGuard.js")) {
            process.exitCode = 91;
            throw new Error("NODE_MODULE_VERSION schema dump attempted native SQLite probe");
          }
          return load.call(this, request, parent, ...args);
        };
        const refuse = () => { process.exitCode = 92; throw new Error("schema dump attempted process or network work"); };
        for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) childProcess[key] = refuse;
        for (const api of [http, https]) { api.request = refuse; api.get = refuse; }
        net.connect = refuse; net.createConnection = refuse; net.Socket.prototype.connect = refuse; tls.connect = refuse;
        globalThis.fetch = refuse;
        syncBuiltinESMExports();
      `;
      const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_BOOTSTRAP: "true",
        AMC_VAULT_PASSPHRASE_FILE: join(directory, "missing-secret") };
      delete env.CI;
      delete env.CONTINUOUS_INTEGRATION;
      delete env.AMC_NO_AUTO_REBUILD;
      const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
      const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`,
        cli, "config", "validate", "--schema", name], { cwd: directory, encoding: "utf8", env });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(renderConfigSchema(name));
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["--schema", "--config", "missing.yaml"],
    ["--schema", "--config", ""],
    ["--schema", "--user-config", "missing.yaml"],
    ["--schema", "--user-config", ""],
    ["--schema", "--no-user-config"],
    ["--schema", "agent", "extra"],
  ])("rejects incompatible public CLI schema arguments: %j", (...args) => {
    const directory = mkdtempSync(join(tmpdir(), "amc-schema-cli-refusal-"));
    try {
      const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
      const result = spawnSync(process.execPath, [cli, "config", "validate", ...args], {
        cwd: directory, encoding: "utf8", env: { ...process.env, AMC_NO_AUTO_REBUILD: "1", NO_COLOR: "1" },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/cannot be combined|too many arguments/);
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
