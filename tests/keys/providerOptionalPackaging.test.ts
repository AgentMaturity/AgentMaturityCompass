/** P2-08: cloud SDKs and the native binding must remain explicit installation choices. */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { pkcs11Provider } from "../../src/keys/providers/pkcs11.js";

interface Manifest {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  scripts?: Record<string, string>;
  files?: string[];
}
const root = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as Manifest;
const wrapperPath = new URL("../../packages/key-provider-pkcs11/package.json", import.meta.url);
const wrapperSourcePath = new URL("../../packages/key-provider-pkcs11/index.cjs", import.meta.url);
const wrapperName = "agent-maturity-compass-key-provider-pkcs11";
const cloudPeers = {
  "@aws-sdk/client-kms": "3.1146.0",
  "@google-cloud/kms": "6.2.1",
  "@azure/keyvault-keys": "4.10.2",
  "@azure/identity": "4.13.3"
};

describe("P2-08 SDK and native provider packages remain explicit opt-ins", () => {
  it("pins cloud SDKs and the wrapper only as optional root peers", () => {
    for (const [name, version] of Object.entries({ ...cloudPeers, [wrapperName]: "0.1.0" })) {
      expect(root.peerDependencies?.[name], name).toBe(version);
      expect(root.peerDependenciesMeta?.[name], name).toEqual({ optional: true });
      expect(root.dependencies?.[name], name).toBeUndefined();
      expect(root.optionalDependencies?.[name], name).toBeUndefined();
      expect(root.devDependencies?.[name], name).toBeUndefined();
    }
    expect(root.dependencies?.pkcs11js).toBeUndefined();
    expect(root.optionalDependencies?.pkcs11js).toBeUndefined();
    expect(root.devDependencies?.pkcs11js).toBeUndefined();
    expect(root.peerDependencies?.pkcs11js).toBeUndefined();
  });

  it("keeps the native wrapper free of installed dependencies and lifecycle hooks", () => {
    expect(existsSync(wrapperPath)).toBe(true);
    const wrapper = JSON.parse(readFileSync(wrapperPath, "utf8")) as Manifest;
    expect(wrapper.peerDependencies).toEqual({ pkcs11js: "2.1.7" });
    expect(wrapper.peerDependenciesMeta).toEqual({ pkcs11js: { optional: true } });
    expect(wrapper.dependencies ?? {}).toEqual({});
    expect(wrapper.optionalDependencies ?? {}).toEqual({});
    expect(wrapper.devDependencies ?? {}).toEqual({});
    expect(wrapper.scripts ?? {}).toEqual({});
    expect(wrapper.files).toContain("index.cjs");
  });

  it("ordinary workspace installation does not resolve cloud SDKs or the native addon", () => {
    const installed = createRequire(new URL("../../package.json", import.meta.url));
    for (const name of [...Object.keys(cloudPeers), "pkcs11js"]) {
      expect(() => installed.resolve(name), name).toThrow(expect.objectContaining({ code: "MODULE_NOT_FOUND" }));
    }
    const workspace = YAML.parse(readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8")) as { onlyBuiltDependencies?: string[] };
    expect(workspace.onlyBuiltDependencies).toContain("pkcs11js");
  });

  it("does not resolve the native binding until the wrapper loader is called", () => {
    const requests: string[] = [];
    const binding = { PKCS11: class FakePkcs11 {} };
    const exports: { loadPkcs11?: () => unknown } = {};
    expect(existsSync(wrapperSourcePath)).toBe(true);
    runInNewContext(readFileSync(wrapperSourcePath, "utf8"), { exports, require: (specifier: string) => { requests.push(specifier); return binding; } });
    expect(requests).toEqual([]);
    expect(exports.loadPkcs11!()).toBe(binding);
    expect(requests).toEqual(["pkcs11js"]);
  });

  it("constructs the provider without resolving a wrapper, native binding, or token", () => {
    expect(() => pkcs11Provider({ env: {} })).not.toThrow();
  });
});
