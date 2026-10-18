/**
 * P1-38: the optional pi-ai peer is loaded only by a pi route, only at the reviewed pin, and only on a Node that meets
 * its engines floor. Each refusal names the remediation. The real-package case uses the copy pnpm installs from the
 * lockfile; no provider is contacted.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  loadPiAi, PI_AI_NODE_FLOOR, PI_AI_PACKAGE, PI_AI_PROVIDERS, PI_AI_REMEDIATION, PI_AI_VERSION, PiAiUnavailableError
} from "../../src/llm/providers/piAi/piAiLoader.js";

const REMEDIATION = "The pi-ai route needs @earendil-works/pi-ai@1.3.0 and Node 22.19.0 or later; "
  + "install it with pnpm add -D @earendil-works/pi-ai@1.3.0, or use a native route.";

afterEach(() => { vi.unstubAllGlobals(); });

async function refusal(promise: Promise<unknown>): Promise<PiAiUnavailableError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(PiAiUnavailableError);
  return error as PiAiUnavailableError;
}

describe("pi-ai loader (P1-38)", () => {
  test("the pin, floor and remediation are the reviewed values", () => {
    expect({ PI_AI_PACKAGE, PI_AI_VERSION, PI_AI_NODE_FLOOR, PI_AI_REMEDIATION })
      .toEqual({ PI_AI_PACKAGE: "@earendil-works/pi-ai", PI_AI_VERSION: "1.3.0", PI_AI_NODE_FLOOR: "22.19.0", PI_AI_REMEDIATION: REMEDIATION });
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, Record<string, unknown>>;
    expect(manifest.peerDependencies?.[PI_AI_PACKAGE]).toBe(PI_AI_VERSION);
    expect(manifest.peerDependenciesMeta?.[PI_AI_PACKAGE]).toEqual({ optional: true });
    expect(manifest.dependencies?.[PI_AI_PACKAGE]).toBeUndefined();
    expect(manifest.devDependencies?.[PI_AI_PACKAGE]).toBe(PI_AI_VERSION);
    expect(manifest.engines?.node).toBe(">=20");
  });

  test("Node below the floor refuses before anything is resolved or imported", async () => {
    const importModule = vi.fn(), installedVersion = vi.fn(() => PI_AI_VERSION);
    const error = await refusal(loadPiAi({ nodeVersion: "22.18.9", installedVersion, importModule }));
    expect(error.message).toBe(`Node 22.18.9 is below the pi-ai floor 22.19.0. ${REMEDIATION}`);
    expect(error.code).toBe("AMC_PI_AI_UNAVAILABLE");
    expect(installedVersion).not.toHaveBeenCalled();
    expect(importModule).not.toHaveBeenCalled();
  });

  test("an absent package refuses with the remediation and imports nothing", async () => {
    const importModule = vi.fn();
    const error = await refusal(loadPiAi({ nodeVersion: "22.19.0", installedVersion: () => null, importModule }));
    expect(error.message).toBe(`@earendil-works/pi-ai is not installed. ${REMEDIATION}`);
    expect(importModule).not.toHaveBeenCalled();
  });

  test("any version other than the pin refuses, newer included", async () => {
    for (const version of ["1.2.0", "1.3.1", "1.3.0-beta.1"]) {
      const importModule = vi.fn();
      const error = await refusal(loadPiAi({ nodeVersion: "24.0.0", installedVersion: () => version, importModule }));
      expect(error.message).toBe(`@earendil-works/pi-ai@${version} is installed, not the reviewed pin 1.3.0. ${REMEDIATION}`);
      expect(importModule).not.toHaveBeenCalled();
    }
  });

  test("a pinned package missing a reviewed export refuses instead of guessing", async () => {
    const error = await refusal(loadPiAi({ nodeVersion: "22.19.0", installedVersion: () => PI_AI_VERSION,
      importModule: async () => ({}) }));
    expect(error.message).toMatch(/^@earendil-works\/pi-ai@1\.3\.0 does not export stream from @earendil-works\/pi-ai\/api\/openai-completions\. /);
  });

  test("the lockfile-installed pin loads without any network call at import", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("pi-ai import must not touch the network"); });
    vi.stubGlobal("fetch", fetchSpy);
    const library = await loadPiAi();
    expect(library.version).toBe("1.3.0");
    expect(Object.keys(library.catalogs).sort()).toEqual([...PI_AI_PROVIDERS].sort());
    for (const provider of PI_AI_PROVIDERS) expect(Object.keys(library.catalogs[provider]).length).toBeGreaterThan(0);
    expect(typeof library.streamCompletions).toBe("function");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("only the loader names the package, and only through a dynamic import (native routes never load it)", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path); else if (path.endsWith(".ts")) files.push(path);
      }
    };
    walk("src");
    // A quoted specifier is an import or the loader's constant; prose (help text) may name the package.
    const naming = files.filter((file) => /["'`]@earendil-works\/pi-ai/.test(readFileSync(file, "utf8")));
    expect(naming).toEqual([join("src", "llm", "providers", "piAi", "piAiLoader.ts")]);
    const loader = readFileSync(naming[0]!, "utf8");
    expect(loader).not.toMatch(/^\s*import\s[^;()]*["']@earendil-works\/pi-ai/m);
    // Everything outside src/llm/providers/piAi reaches the pi modules lazily, so selecting a native route never
    // evaluates them and never resolves the optional peer.
    const staticPiImports = files.filter((file) => !file.includes(join("providers", "piAi"))
      && /^\s*import\s+(?!type\b)[^;()]*from\s+["'][^"']*providers\/piAi\//m.test(readFileSync(file, "utf8")));
    expect(staticPiImports).toEqual([]);
  });
});
