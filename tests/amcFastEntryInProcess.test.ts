/**
 * src/amc.ts (the `amc` bin entry) run in-process: the --version fast path, the compile cache location, the argv[1]
 * rewrite and the dist resolver hook. cli.js, the native guard and node:module's two start-up APIs are replaced, so no
 * hook is installed in this worker and nothing is written under node_modules.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amcVersion } from "../src/version.js";

type ResolveHook = (specifier: string, context: { parentURL?: string; conditions: string[] }, next: (s: string, c: unknown) => unknown) => unknown;

const srcDir = resolve(__dirname, "../src");
const entryPath = join(srcDir, "amc.ts");
const srcUrl = pathToFileURL(`${srcDir}/`).href;
const exitSentinel = new Error("process.exit called");
const savedArgv = process.argv;

let cliLoads = 0;
let guardLoads = 0;
let compileCacheDirs: string[] = [];
let hooks: { resolve: ResolveHook }[] = [];

function mockStartup(api: { compileCache: boolean; registerHooks: boolean }) {
  vi.doMock("../src/cli.js", () => { cliLoads += 1; return {}; });
  vi.doMock("../src/storage/nativeGuard.js", () => { guardLoads += 1; return {}; });
  vi.doMock("node:module", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:module")>();
    return {
      ...actual,
      enableCompileCache: api.compileCache ? (dir: string) => { compileCacheDirs.push(dir); } : undefined,
      registerHooks: api.registerHooks ? (h: { resolve: ResolveHook }) => { hooks.push(h); } : undefined
    };
  });
}

async function runEntry(args: string[], argv1 = "/somewhere/bin/amc", api = { compileCache: true, registerHooks: true }) {
  process.argv = [process.execPath, argv1, ...args];
  mockStartup(api);
  await import("../src/amc.js");
}

function onlyHook(): ResolveHook {
  expect(hooks).toHaveLength(1);
  return hooks[0]!.resolve;
}

const next = vi.fn((specifier: string) => ({ url: `next:${specifier}` }));
const importContext = (parentURL: string | undefined) => ({ parentURL, conditions: ["node", "import"] });

beforeEach(() => {
  vi.resetModules();
  cliLoads = 0;
  guardLoads = 0;
  compileCacheDirs = [];
  hooks = [];
  next.mockClear();
});

afterEach(() => {
  process.argv = savedArgv;
  vi.doUnmock("../src/cli.js");
  vi.doUnmock("../src/storage/nativeGuard.js");
  vi.doUnmock("node:module");
  vi.restoreAllMocks();
});

describe("amc --version fast path", () => {
  it.each(["--version", "-V"])("%s alone prints the version, exits 0, runs the native guard and never loads cli.js", async (flag) => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw exitSentinel; });
    await expect(runEntry([flag])).rejects.toBe(exitSentinel);
    expect(write).toHaveBeenCalledWith(`${amcVersion}\n`);
    expect(exit).toHaveBeenCalledWith(0);
    expect(guardLoads).toBe(1);
    expect(cliLoads).toBe(0);
    expect(hooks).toHaveLength(0);
    expect(compileCacheDirs).toHaveLength(0);
  });

  it("--version with another argument goes through the full program", async () => {
    const exit = vi.spyOn(process, "exit");
    await runEntry(["--version", "score"]);
    expect(exit).not.toHaveBeenCalled();
    expect(cliLoads).toBe(1);
  });
});

describe("normal start-up", () => {
  it("keeps the compile cache inside the package and loads cli.js once", async () => {
    await runEntry(["score"]);
    expect(compileCacheDirs).toEqual([resolve(srcDir, "../node_modules/.cache/amc-compile-cache")]);
    expect(cliLoads).toBe(1);
    expect(hooks).toHaveLength(1);
  });

  it("names cli.js in argv[1] when the entry itself was run, and leaves any other argv[1] alone", async () => {
    await runEntry(["score"], entryPath);
    expect(process.argv[1]).toBe(join(srcDir, "cli.js"));
    vi.resetModules();
    await runEntry(["score"], "/usr/local/bin/amc");
    expect(process.argv[1]).toBe("/usr/local/bin/amc");
  });

  it("still loads cli.js on a Node without enableCompileCache or registerHooks (Node 20)", async () => {
    await runEntry(["score"], "/x/amc", { compileCache: false, registerHooks: false });
    expect(cliLoads).toBe(1);
    expect(hooks).toHaveLength(0);
    expect(compileCacheDirs).toHaveLength(0);
  });
});

describe("dist resolver hook", () => {
  const assetsParent = `${srcUrl}console/assets/a4.js`;

  it("short-circuits an existing plain .js file under the entry's folder as an ES module", async () => {
    await runEntry(["score"]);
    const hook = onlyHook();
    expect(hook("./a4Adapt.js", importContext(assetsParent), next)).toEqual({
      url: `${srcUrl}console/assets/a4Adapt.js`, format: "module", shortCircuit: true
    });
    // Second lookup in the same folder answers from the cached listing.
    expect(hook("../assets/a4Aspire.js", importContext(assetsParent), next)).toMatchObject({ shortCircuit: true });
    expect(next).not.toHaveBeenCalled();
  });

  it("hands everything it does not recognise to Node's own resolver", async () => {
    await runEntry(["score"]);
    const hook = onlyHook();
    const cases: [string, { parentURL?: string; conditions: string[] }][] = [
      ["chalk", importContext(assetsParent)],                               // bare package
      ["./a4.css", importContext(assetsParent)],                            // not .js
      ["./a4Adapt.js", importContext(undefined)],                           // no parent
      ["./a4Adapt.js", importContext("file:///elsewhere/x.js")],            // parent outside dist
      ["./a4Adapt.js", { parentURL: assetsParent, conditions: ["require"] }], // require, not import
      ["./doesNotExist.js", importContext(assetsParent)],                   // missing file: Node's own error
      ["../../../outside.js", importContext(assetsParent)],                 // escapes the dist folder
      ["./a4Adapt.js?x=1.js", importContext(assetsParent)],                 // query string
      ["./noSuchFolder/a.js", importContext(assetsParent)]                  // folder cannot be listed
    ];
    for (const [specifier, context] of cases) {
      expect(hook(specifier, context, next)).toEqual({ url: `next:${specifier}` });
    }
    expect(next).toHaveBeenCalledTimes(cases.length);
  });
});
