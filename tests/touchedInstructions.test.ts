import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  createInstructionsContextPlugin,
  loadInstructionFiles,
  renderInstructionContext
} from "../src/prompt/context/index.js";
import { touchedInstructionDirectories } from "../src/prompt/context/touchedInstructions.js";

const roots: string[] = [];
function temporary(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-touched-instructions-"));
  roots.push(root);
  return root;
}
function put(root: string, path: string, content = path): void {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content);
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("DXC-31 — independent instruction discovery bounds", () => {
  const workspace = "/workspace/project";

  test("limits 65 touches even when every touch names the same directory", () => {
    const discovery = touchedInstructionDirectories(workspace, Array.from({ length: 65 }, (_, index) => ({
      path: "shared/file.ts", eventId: `touch-${index}`
    })));
    expect(discovery.limited).toBe(true);
    expect(discovery.excluded).toBe(false);
    expect(discovery.directories).toEqual([
      { path: "", eventId: "touch-63" },
      { path: "shared", eventId: "touch-63" }
    ]);
  });

  test("caps the ancestor union at 64 directories independently of the 64-touch limit", () => {
    const discovery = touchedInstructionDirectories(workspace, Array.from({ length: 32 }, (_, index) => ({
      path: `branch-${index}/sub/file.ts`, eventId: `touch-${index}`
    })));
    expect(discovery.directories).toHaveLength(64);
    expect(discovery.limited).toBe(true);
    expect(discovery.excluded).toBe(false);
    expect(discovery.directories.some(directory => directory.path === "branch-31")).toBe(true);
    expect(discovery.directories.some(directory => directory.path === "branch-31/sub")).toBe(false);
  });

  test("accepts 32 directory levels and explicitly omits a 33-level chain", () => {
    const segments = Array.from({ length: 33 }, (_, index) => `level-${index}`);
    const boundary = touchedInstructionDirectories(workspace, [{
      path: segments.slice(0, 32).join("/"), directory: true, eventId: "depth-boundary"
    }]);
    expect(boundary.limited).toBe(false);
    expect(boundary.directories).toHaveLength(33);
    const overflow = touchedInstructionDirectories(workspace, [{
      path: segments.join("/"), directory: true, eventId: "depth-overflow"
    }]);
    expect(overflow.limited).toBe(true);
    expect(overflow.excluded).toBe(false);
    expect(overflow.directories).toEqual([{ path: "" }]);
  });

  test("accepts a 4096-character path and rejects 4097 characters before path parsing", () => {
    const boundary = touchedInstructionDirectories(workspace, [{ path: "a".repeat(4096), eventId: "length-boundary" }]);
    expect(boundary.limited).toBe(false);
    expect(boundary.directories).toEqual([{ path: "", eventId: "length-boundary" }]);
    const overflow = touchedInstructionDirectories(workspace, [{ path: "a".repeat(4097), eventId: "length-overflow" }]);
    expect(overflow.limited).toBe(true);
    expect(overflow.excluded).toBe(false);
    expect(overflow.directories).toEqual([{ path: "" }]);
  });

  test("excludes null-byte paths without generating candidates", () => {
    const discovery = touchedInstructionDirectories(workspace, [{ path: "sub/\0/file.ts", eventId: "null-path" }]);
    expect(discovery.excluded).toBe(true);
    expect(discovery.limited).toBe(false);
    expect(discovery.directories).toEqual([{ path: "" }]);
  });

  test.each(["../outside/file.ts", "/workspace/outside/file.ts", "../../escape/file.ts"])(
    "excludes lexical workspace escape %s before generating a directory chain", path => {
      const discovery = touchedInstructionDirectories(workspace, [{ path, eventId: "outside" }]);
      expect(discovery.excluded).toBe(true);
      expect(discovery.limited).toBe(false);
      expect(discovery.directories).toEqual([{ path: "" }]);
    }
  );

  test.each([".git/config", ".amc/state", "sub/.GIT/config", "sub/.AMC/state"])(
    "excludes metadata path %s before generating an ancestor chain", path => {
      const discovery = touchedInstructionDirectories(workspace, [{ path, eventId: "metadata" }]);
      expect(discovery.excluded).toBe(true);
      expect(discovery.limited).toBe(false);
      expect(discovery.directories).toEqual([{ path: "" }]);
    }
  );

  test("allows ordinary dot directories whose names only start with an excluded name", () => {
    const discovery = touchedInstructionDirectories(workspace, [{ path: ".github/file.ts", eventId: "ordinary-dot-directory" }]);
    expect(discovery.excluded).toBe(false);
    expect(discovery.limited).toBe(false);
    expect(discovery.directories.map(directory => directory.path)).toEqual(["", ".github"]);
  });
});

describe("DXC-31 — touched-directory workspace instructions", () => {
  test("loads only root-to-touched chains, with local overlays after each directory's base files", () => {
    const workspace = temporary();
    const amcHome = temporary();
    put(amcHome, "AGENTS.md", "outside home rule");
    const expected = [
      "CLAUDE.md", "AGENTS.md", "CLAUDE.local.md", "AGENTS.local.md",
      "src/CLAUDE.md", "src/AGENTS.md", "src/CLAUDE.local.md", "src/AGENTS.local.md",
      "src/sub/AGENTS.md", "src/sub/AGENTS.local.md"
    ];
    for (const path of [...expected, "unseen/AGENTS.md"]) put(workspace, path);
    const loaded = loadInstructionFiles({
      workspace, amcHome, workspaceOnly: true,
      touchedPaths: [{ path: "src/sub/file.ts", eventId: "touch-17" }]
    });
    expect(loaded.included.map(file => file.candidate.displayPath)).toEqual(expected);
    expect(loaded.included.every(file => file.candidate.touchEventId === "touch-17")).toBe(true);
    expect(renderInstructionContext(loaded)).toContain("local overlays");
  });

  test("an empty touch set still loads root local overlays without reading AMC home", () => {
    const workspace = temporary();
    const amcHome = temporary();
    put(amcHome, "AGENTS.md", "host-only-secret");
    put(workspace, "AGENTS.local.md", "workspace-local-rule");
    const loaded = loadInstructionFiles({ workspace, amcHome, workspaceOnly: true, touchedPaths: [] });
    expect(loaded.included.map(file => file.candidate.displayPath)).toEqual(["AGENTS.local.md"]);
    expect(renderInstructionContext(loaded)).not.toContain("host-only-secret");
  });

  test("attributes exact, untrimmed content with its sha256 and triggering touch event", () => {
    const workspace = temporary();
    const content = "\n  preserve {{literal}} and whitespace\n\n";
    put(workspace, "sub/AGENTS.md", content);
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true,
      touchedPaths: [{ path: join(workspace, "sub/file.ts"), eventId: "signed-tool-call-42" }]
    });
    const digest = createHash("sha256").update(content).digest("hex");
    expect(loaded.included[0]?.sha256).toBe(digest);
    const rendered = renderInstructionContext(loaded);
    expect(rendered).toContain("sub/AGENTS.md");
    expect(rendered).toContain(digest);
    expect(rendered).toContain("signed-tool-call-42");
    expect(rendered).toContain(content);
    expect(rendered).not.toContain(workspace);
  });

  test("reobserves touched directories on each boundary for additions, edits and removals", async () => {
    const workspace = temporary();
    mkdirSync(join(workspace, "sub"));
    const plugin = createInstructionsContextPlugin({ workspace, workspaceOnly: true });
    const boundary = { turn: 1, step: 2, touchedPaths: [{ path: "sub/file.ts", eventId: "touch-1" }] };
    expect(await plugin.collect(boundary)).toBe("");
    put(workspace, "sub/AGENTS.md", "first nested rule");
    const first = await plugin.collect({ ...boundary, step: 3 });
    expect(first).toContain("first nested rule");
    expect(first).toContain("touch-1");
    put(workspace, "sub/AGENTS.md", "changed nested rule");
    const changed = await plugin.collect({ ...boundary, step: 4 });
    expect(changed).toContain("changed nested rule");
    expect(changed).not.toContain("first nested rule");
    rmSync(join(workspace, "sub/AGENTS.md"));
    expect(await plugin.collect({ ...boundary, step: 5 })).toBe("");
  });

  test("directory touches include that directory and same-content paths retain separate provenance", () => {
    const workspace = temporary();
    put(workspace, "AGENTS.md", "shared exact rule\n");
    put(workspace, "sub/AGENTS.md", "shared exact rule\n");
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true,
      touchedPaths: [{ path: "sub", directory: true, eventId: "touch-glob" }]
    });
    expect(loaded.included.map(file => file.candidate.displayPath)).toEqual(["AGENTS.md", "sub/AGENTS.md"]);
    expect(loaded.included.every(file => file.candidate.touchEventId === "touch-glob")).toBe(true);
  });

  test("refuses outside paths, metadata directories, instruction symlinks and symlink directory escapes", () => {
    const workspace = temporary();
    const outside = temporary();
    put(outside, "AGENTS.md", "outside-instructions-secret");
    put(workspace, ".git/AGENTS.md", "git-instructions-secret");
    put(workspace, ".amc/AGENTS.md", "amc-instructions-secret");
    symlinkSync(join(outside, "AGENTS.md"), join(workspace, "AGENTS.md"));
    symlinkSync(outside, join(workspace, "escape"), "dir");
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true,
      touchedPaths: [
        { path: join(outside, "file.ts"), eventId: "outside" },
        { path: ".git/config", eventId: "git" },
        { path: ".amc/state", eventId: "amc" },
        { path: "escape/file.ts", eventId: "symlink" }
      ]
    });
    expect(loaded.included).toEqual([]);
    expect(loaded.omitted.length).toBeGreaterThan(0);
    const rendered = renderInstructionContext(loaded);
    expect(rendered).not.toContain("outside-instructions-secret");
    expect(rendered).not.toContain("git-instructions-secret");
    expect(rendered).not.toContain("amc-instructions-secret");
    expect(rendered).not.toContain(workspace);
    expect(rendered).not.toContain(outside);
  });

  test("bounds touch path count, directory count and depth, and makes incomplete discovery explicit", () => {
    const workspace = temporary();
    const paths = Array.from({ length: 80 }, (_, index) => {
      const path = `branch-${index}/nested/file.ts`;
      put(workspace, `branch-${index}/nested/AGENTS.md`);
      return { path, eventId: `touch-${index}` };
    });
    const deep = Array.from({ length: 34 }, (_, index) => `d${index}`).join("/");
    put(workspace, `${deep}/AGENTS.md`, "beyond-depth-secret");
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true,
      touchedPaths: [{ path: `${deep}/file.ts`, eventId: "too-deep" }, ...paths]
    });
    expect(loaded.included.length).toBeLessThanOrEqual(64);
    expect(loaded.omitted.some(omission => omission.reason === "discovery-limit")).toBe(true);
    expect(renderInstructionContext(loaded)).toContain("discovery limit");
    expect(renderInstructionContext(loaded)).not.toContain("beyond-depth-secret");
  });

  test("applies per-file and total budgets to nested overlays, retaining the strongest whole file", () => {
    const workspace = temporary();
    put(workspace, "AGENTS.md", "weak root rule\n");
    put(workspace, "sub/AGENTS.md", "x".repeat(50));
    put(workspace, "sub/AGENTS.local.md", "strong rule\n");
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true, maxFileBytes: 30, maxTotalBytes: 15,
      touchedPaths: [{ path: "sub/file.ts", eventId: "touch-budget" }]
    });
    expect(loaded.included.map(file => file.candidate.displayPath)).toEqual(["sub/AGENTS.local.md"]);
    expect(loaded.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayPath: "AGENTS.md", reason: "over-budget" }),
      expect.objectContaining({ displayPath: "sub/AGENTS.md", reason: "oversize" })
    ]));
  });

  test("nonregular instruction files are omissions without attempting a blocking FIFO read", () => {
    const workspace = temporary();
    mkdirSync(join(workspace, "sub"));
    execFileSync("mkfifo", [join(workspace, "sub/AGENTS.md")]);
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true,
      touchedPaths: [{ path: "sub/file.ts", eventId: "touch-fifo" }]
    });
    expect(loaded.included).toEqual([]);
    expect(loaded.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayPath: "sub/AGENTS.md", reason: "unreadable" })
    ]));
  });

  test("invalid UTF-8 instruction bytes are unreadable rather than replacement-character content", () => {
    const workspace = temporary();
    mkdirSync(join(workspace, "sub"));
    writeFileSync(join(workspace, "sub/AGENTS.md"), Buffer.from([0xff]));
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true,
      touchedPaths: [{ path: "sub/file.ts", eventId: "touch-invalid-utf8" }]
    });
    expect(loaded.included).toEqual([]);
    expect(loaded.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayPath: "sub/AGENTS.md", reason: "unreadable" })
    ]));
    expect(renderInstructionContext(loaded)).not.toContain("\uFFFD");
  });

  test.each(["symlink", "replacement"])("keeps the plugin's workspace pinned across boundaries after root %s", async replacement => {
    const workspace = temporary();
    const outside = temporary();
    put(workspace, "AGENTS.md", "original workspace rule");
    put(outside, "AGENTS.md", "outside-root-secret");
    const plugin = createInstructionsContextPlugin({ workspace, workspaceOnly: true });
    expect(await plugin.collect({ turn: 1, step: 1, touchedPaths: [] })).toContain("original workspace rule");
    const moved = `${workspace}-moved`;
    roots.push(moved);
    renameSync(workspace, moved);
    if (replacement === "symlink") symlinkSync(outside, workspace, "dir");
    else renameSync(outside, workspace);
    const rendered = await plugin.collect({ turn: 1, step: 2, touchedPaths: [] });
    expect(rendered).not.toContain("outside-root-secret");
    expect(rendered).toContain("could not be read");
    expect(rendered).not.toContain(outside);
    expect(rendered).not.toContain(workspace);
  });

  test("discards content when workspace identity changes mid-read", () => {
    const workspace = temporary();
    const outside = temporary();
    put(workspace, "AGENTS.md", "original rule");
    put(outside, "AGENTS.md", "outside-mid-read-secret");
    const loaded = loadInstructionFiles({
      workspace, workspaceOnly: true, touchedPaths: [],
      readTextFile: () => {
        const moved = `${workspace}-moved`;
        roots.push(moved);
        renameSync(workspace, moved);
        symlinkSync(outside, workspace, "dir");
        return "outside-mid-read-secret";
      }
    });
    expect(loaded.included).toEqual([]);
    expect(renderInstructionContext(loaded)).not.toContain("outside-mid-read-secret");
    expect(loaded.omitted.some(omission => omission.reason === "unreadable")).toBe(true);
  });
});
