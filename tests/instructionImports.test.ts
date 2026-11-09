import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalImportRefusal, importTargets, MAX_IMPORT_DEPTH, MAX_IMPORTS_PER_FILE, resolveImportPath, resolveInstructionImports } from "../src/prompt/context/instructionImports.js";
import { MACOS_SECRET_PATHS } from "../src/sandbox/seatbeltNativeShell.js";
import { loadInstructionFiles } from "../src/prompt/context/instructionFiles.js";
import { INSTRUCTION_FILE_NAMES, instructionCandidates, STRONGEST_INSTRUCTION_FILE } from "../src/prompt/context/instructionPrecedence.js";
import { renderInstructionContext } from "../src/prompt/context/instructionsContext.js";

/** The first words of the precedence statement: everything before it in a rendered context is the omission block. */
const INSTRUCTION_PRECEDENCE_LEAD = "Workspace instructions follow";
import { chooseGuardrailsTarget } from "../src/guide/oneClickFix.js";
import { registerPromptCommands } from "../src/cli-prompt-commands.js";

/**
 * SH-LOOP-05: AMC.md joins the instruction files BELOW AGENTS.md (the writer's target stays strongest), and a line
 * of the form `@path` in a PROJECT file imports a workspace file: relative to the importer, at most four hops,
 * confined to regular files inside the workspace, never AMC state, version control, dependencies or .env files.
 */
let workspace: string;
beforeEach(() => { workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-instruction-imports-"))); });
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); });
const put = (path: string, text: string) => { mkdirSync(join(workspace, path, ".."), { recursive: true }); writeFileSync(join(workspace, path), text); };

describe("precedence", () => {
  it("ranks CLAUDE.md < AMC.md < AGENTS.md, and the writer's target is still the strongest file", () => {
    expect(INSTRUCTION_FILE_NAMES).toEqual(["CLAUDE.md", "AMC.md", "AGENTS.md"]);
    put("AGENTS.md", "agents\n"); put("AMC.md", "amc\n"); put("CLAUDE.md", "claude\n");
    const project = instructionCandidates({ workspace, workspaceOnly: true }).map(candidate => candidate.displayPath);
    expect(project.slice(0, 3)).toEqual(["CLAUDE.md", "AMC.md", "AGENTS.md"]);
    expect(project).toContain("AMC.local.md");
    expect(chooseGuardrailsTarget(workspace)).toBe(STRONGEST_INSTRUCTION_FILE);
    const load = loadInstructionFiles({ workspace, workspaceOnly: true });
    expect(load.included.map(file => file.candidate.displayPath)).toEqual(["CLAUDE.md", "AMC.md", "AGENTS.md"]);
  });
});

describe("resolveImportPath", () => {
  it("resolves relative to the importer and a leading slash to the workspace root; refuses everything that leaves it", () => {
    expect(resolveImportPath("docs/rules.md", "AMC.md")).toEqual({ ok: true, path: "docs/rules.md" });
    expect(resolveImportPath("../shared.md", "docs/AMC.md")).toEqual({ ok: true, path: "shared.md" });
    expect(resolveImportPath("/docs/rules.md", "deep/dir/AMC.md")).toEqual({ ok: true, path: "docs/rules.md" });
    // MUTATION: drop the `../` check and `@../../etc/hostname` resolves to a path outside the workspace.
    for (const target of ["../outside.md", "~/.config/amc/AGENTS.md", "/../x", ".amc/vault.json", "/.amc/tools.yaml", "a/.git/config", "node_modules/x/README.md", ".env", "conf/.env.local", "a\\b"]) {
      expect(resolveImportPath(target, "AMC.md").ok, target).toBe(false);
    }
  });
  it("refuses AMC state and credential carriers case-insensitively, as a case-insensitive filesystem would resolve them (S17, S18)", () => {
    // MUTATION: drop the toLowerCase() and `.AMC/vault.json` resolves; on APFS that reads .amc/vault.json.
    const refused = [".AMC/vault.json", "/.Git/config", "Node_Modules/x/README.md", ".ENV", "conf/.Env.Local", ".envrc", ".npmrc", ".netrc", ".pypirc",
      ".git-credentials", ".ssh/id_ed25519", "keys/id_rsa", "keys/ID_RSA.pub", ".aws/credentials", "certs/server.pem", "certs/Server.KEY", "store.p12", "store.pfx", "ops/.NetRC"];
    for (const target of refused) expect(resolveImportPath(target, "AMC.md").ok, target).toBe(false);
    for (const target of ["docs/environment.md", "envs/README.md", "keys.md", "identity/notes.md", "pemberton.md"]) expect(resolveImportPath(target, "AMC.md").ok, target).toBe(true);
  });
  it("refuses segment shapes that alias another name on some volumes, and anything that is not a text file (S17 follow-up)", () => {
    // MUTATION: drop aliasedSegmentReason and `.amc./notes.md` resolves; Win32 strips the trailing dot and opens .amc.
    const aliasing = [".amc./notes.md", ".AMC /notes.md", "docs./rules.md", "notes.md:secret", "notes.md:x.md", "a/b~1/x.md", "docs/bad<name>.md", "docs/bad|name.md", "docs/q?.md", "docs/star*.md", "docs/\u0001.md", ".ａmc/notes.md"];
    for (const target of aliasing) expect(resolveImportPath(target, "AMC.md").ok, JSON.stringify(target)).toBe(false);
    // MUTATION: drop the extension allowlist and `@package.json` or `@scripts/deploy.sh` is quoted to the provider.
    for (const target of ["package.json", "scripts/deploy.sh", "notes", "image.png", "docs/rules.MD.bak"]) expect(resolveImportPath(target, "AMC.md").ok, target).toBe(false);
    for (const target of ["docs/rules.MD", "docs/guide.mdx", "notes/plain.txt"]) expect(resolveImportPath(target, "AMC.md").ok, target).toBe(true);
  });
  it("refuses credential carriers that were renamed into an importable text file, and every directory the shell sandbox denies (S18)", () => {
    // MUTATION: narrow the .env rule back to /^\.env(\.|$)/ and `.env-prod.txt` resolves; drop the stem suffix rule and `.npmrc.txt` does.
    const renamed = [".env-prod.txt", ".envsecrets.md", "conf/.ENV_LOCAL.md", ".envrc.txt", ".npmrc.txt", ".netrc.md", ".pypirc.txt", ".git-credentials.md",
      "credentials.md", "secrets/Credentials.TXT", "keys/id_rsa.txt", "keys/ID_ED25519.md", "keys/id_ecdsa_backup.md", "certs/server.pem.txt", "api.key.md",
      ".azure/notes.md", ".config/gcloud/notes.md", "Library/Keychains/notes.md", ".npmrc/notes.md"];
    for (const target of renamed) expect(resolveImportPath(target, "AMC.md").ok, target).toBe(false);
    for (const target of ["docs/environment.md", "keys.md", "identity/notes.md", "pemberton.md", "docs/id_scheme.md", "my.keynotes.md", "config/gcloud.md", ".config/notes.md"]) {
      expect(resolveImportPath(target, "AMC.md").ok, target).toBe(true);
    }
    // The macOS shell sandbox's home-relative secret list and the import denylist stay in step (a workspace can be a home directory).
    for (const secret of MACOS_SECRET_PATHS) expect(resolveImportPath(`${secret}/notes.md`, "AMC.md").ok, secret).toBe(false);
  });
  it("judges the canonical on-disk path: a spelling or a directory link that lands on a refused name is refused", () => {
    // MUTATION: make canonicalImportRefusal return null and both refused spellings pass.
    put(".amc/notes.md", "state\n"); put("docs/rules.md", "rules\n");
    symlinkSync(join(workspace, ".amc"), join(workspace, "docs", "state"));
    // Case-insensitive volume: realpath names .amc. Case-sensitive volume: .AMC does not exist. Refused either way.
    expect(canonicalImportRefusal(workspace, ".AMC/notes.md")).not.toBeNull();
    expect(canonicalImportRefusal(workspace, "docs/state/notes.md")).toMatch(/AMC state/);
    expect(canonicalImportRefusal(workspace, "docs/rules.md")).toBeNull();
    // A name that merely starts with two dots is inside the workspace, not above it.
    put("..notes.md", "dots\n");
    expect(canonicalImportRefusal(workspace, "..notes.md")).toBeNull();
  });
  it("reads only exact @ lines", () => {
    expect(importTargets("@a.md\nsee @b.md inline\n  @c.md  \n@ spaced\n@d.md\n")).toEqual(["a.md", "d.md"]);
  });
});

describe("resolveInstructionImports", () => {
  it("follows imports four hops deep, reports the fifth, skips repeats and refuses a symlink", () => {
    // MUTATION: raise MAX_IMPORT_DEPTH or drop the depth check and hop5.md is imported.
    put("AMC.md", "root\n@hop1.md\n@hop1.md\n@link.md\n");
    put("hop1.md", "1\n@hop2.md\n"); put("hop2.md", "2\n@hop3.md\n"); put("hop3.md", "3\n@hop4.md\n"); put("hop4.md", "4\n@hop5.md\n"); put("hop5.md", "5\n");
    put("secret.md", "never\n"); symlinkSync(join(workspace, "secret.md"), join(workspace, "link.md"));
    const resolved = resolveInstructionImports({ workspace, importedBy: "AMC.md", content: "root\n@hop1.md\n@hop1.md\n@link.md\n", maxFileBytes: 4096, maxTotalBytes: 131072 });
    expect(resolved.imports.map(entry => entry.displayPath)).toEqual(["hop1.md", "hop2.md", "hop3.md", "hop4.md"]);
    expect(resolved.imports[3]).toMatchObject({ importedBy: "hop3.md", bytes: 11 });
    expect(MAX_IMPORT_DEPTH).toBe(4);
    expect(resolved.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayPath: "hop5.md", reason: "import-depth" }),
      expect.objectContaining({ displayPath: "link.md", reason: "unreadable" })
    ]));
    expect(JSON.stringify(resolved)).not.toContain("never");
  });

  it("refuses a symlink into .amc, and judges the canonical on-disk path even when the workspace is named through a symlink", () => {
    put(".amc/notes.md", "state\n"); symlinkSync(join(workspace, ".amc", "notes.md"), join(workspace, "state.md"));
    put("docs/rules.md", "rules\n");
    const content = "@state.md\n@docs/rules.md\n";
    const linked = join(workspace, "..", "amc-import-link-" + process.pid); symlinkSync(workspace, linked);
    try {
      const resolved = resolveInstructionImports({ workspace: linked, importedBy: "AMC.md", content, maxFileBytes: 4096, maxTotalBytes: 131072 });
      expect(resolved.imports.map(entry => entry.displayPath)).toEqual(["docs/rules.md"]);
      expect(resolved.omitted).toEqual([expect.objectContaining({ displayPath: "state.md", reason: "unreadable" })]);
      expect(JSON.stringify(resolved)).not.toContain("state\\n");
    } finally { rmSync(linked, { force: true }); }
  });

  it("is applied by the loader to project files only, counted against the total budget and rendered with provenance", () => {
    put("AMC.md", "amc rules\n@docs/style.md\n@.amc/credentials.json\n");
    put("docs/style.md", "style rules\n");
    put(".amc/credentials.json", "{\"secret\":true}\n");
    const load = loadInstructionFiles({ workspace, workspaceOnly: true });
    const amc = load.included.find(file => file.candidate.displayPath === "AMC.md");
    expect(amc?.imports.map(entry => entry.displayPath)).toEqual(["docs/style.md"]);
    expect(load.omitted).toEqual([expect.objectContaining({ reason: "import-refused", displayPath: "AMC.md → @.amc/credentials.json" })]);
    const rendered = renderInstructionContext(load);
    expect(rendered).toContain("Imported by AMC.md from docs/style.md");
    expect(rendered).toContain("style rules");
    expect(rendered).not.toContain("secret");
    // Budget: the import's bytes count with its importer, so a cap below both drops the file whole.
    const squeezed = loadInstructionFiles({ workspace, workspaceOnly: true, maxTotalBytes: 15 });
    expect(squeezed.included).toHaveLength(0);
    expect(squeezed.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ displayPath: "AMC.md", reason: "over-budget" })]));
  });

  it("never follows an @ line in a user-scope file: it stays text", () => {
    // MUTATION: resolve imports for user-scope candidates too and the workspace file is pulled in under $AMC_HOME/AGENTS.md.
    const home = realpathSync(mkdtempSync(join(tmpdir(), "amc-import-home-")));
    try {
      writeFileSync(join(home, "AGENTS.md"), "user rules\n@/docs/x.md\n");
      put("docs/x.md", "workspace doc\n");
      const load = loadInstructionFiles({ workspace, amcHome: home });
      const user = load.included.find(file => file.candidate.scope === "user");
      expect(user?.content).toContain("@/docs/x.md");
      expect(user?.imports).toEqual([]);
      expect(load.omitted).toEqual([]);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it("refuses a hard link: the file has a name nobody judged (an .amc file linked as docs/notes.md)", () => {
    // MUTATION: drop the `links !== 1` refusal and the .amc bytes are quoted to the provider.
    put(".amc/vault-notes.md", "operator vault state\n"); put("docs/rules.md", "rules\n");
    linkSync(join(workspace, ".amc", "vault-notes.md"), join(workspace, "docs", "notes.md"));
    const resolved = resolveInstructionImports({ workspace, importedBy: "AMC.md", content: "@docs/notes.md\n@docs/rules.md\n", maxFileBytes: 4096, maxTotalBytes: 131072 });
    expect(resolved.imports.map(entry => entry.displayPath)).toEqual(["docs/rules.md"]);
    expect(resolved.omitted).toEqual([expect.objectContaining({ displayPath: "docs/notes.md", reason: "import-refused", detail: expect.stringContaining("hard links") })]);
    expect(JSON.stringify(resolved)).not.toContain("vault state");
  });

  it("is bounded: at most MAX_IMPORTS_PER_FILE lines followed, reading stops at the total budget, and the rest is one omission", () => {
    // MUTATION: drop the count cap and all 40 files are imported; drop the byte stop and big3.md is read.
    for (let index = 0; index < 40; index += 1) put(`docs/a${index}.md`, `rule ${index}\n`);
    const many = Array.from({ length: 40 }, (_, index) => `@docs/a${index}.md`).join("\n");
    const counted = resolveInstructionImports({ workspace, importedBy: "AMC.md", content: many, maxFileBytes: 4096, maxTotalBytes: 131072 });
    expect(MAX_IMPORTS_PER_FILE).toBe(32);
    expect(counted.imports).toHaveLength(32);
    expect(counted.omitted).toEqual([expect.objectContaining({ reason: "import-limit", detail: expect.stringContaining("8 further") })]);
    const reads: string[] = [];
    const reader = (path: string) => { reads.push(path); return "x".repeat(3000); };
    const budgeted = resolveInstructionImports({ workspace, importedBy: "AMC.md", content: "@big1.md\n@big2.md\n@big3.md\n", maxFileBytes: 4096, maxTotalBytes: 5000, readTextFile: reader });
    expect(budgeted.imports.map(entry => entry.displayPath)).toEqual(["big1.md"]);
    expect(reads.map(path => path.slice(-7))).toEqual(["big1.md", "big2.md"]);
    expect(budgeted.omitted).toEqual([expect.objectContaining({ displayPath: "big2.md", reason: "over-budget" }), expect.objectContaining({ reason: "import-limit", detail: expect.stringContaining("1 further") })]);
  });

  it("keeps a flood of refused lines and a hostile target out of every step's prompt and the operator's terminal", () => {
    // MUTATION: quote the raw target and the escape sequence and the 9,000-character name reach the rendered context.
    const flood = Array.from({ length: 5_000 }, (_, index) => `@~/x${index}`).join("\n");
    const hostile = `@\u001b]52;c;ZXZpbA==\u0007${"y".repeat(9_000)}.md`;
    put("AMC.md", `${hostile}\n${flood}\n`);
    const load = loadInstructionFiles({ workspace, workspaceOnly: true });
    expect(load.omitted.length).toBeLessThanOrEqual(MAX_IMPORTS_PER_FILE + 1);
    const rendered = renderInstructionContext(load);
    const omissionBlock = rendered.slice(0, rendered.indexOf(INSTRUCTION_PRECEDENCE_LEAD));
    expect(omissionBlock).not.toContain("\u001b");
    expect(omissionBlock).toContain("\\u001b");
    expect(omissionBlock.length).toBeLessThan(16_000);
  });

  it("resolves imports per instruction file: a weaker importer dropped for budget does not take the stronger file's import", () => {
    // MUTATION: dedupe imports across files again and AGENTS.md loses docs/shared.md when CLAUDE.md is dropped.
    const shared = `${"s".repeat(99)}\n`;
    put("docs/shared.md", shared); put("CLAUDE.md", "claude rules\n@docs/shared.md\n"); put("AGENTS.md", "agents rules\n@docs/shared.md\n");
    const load = loadInstructionFiles({ workspace, workspaceOnly: true, maxTotalBytes: 140 });
    const agents = load.included.find(file => file.candidate.displayPath === "AGENTS.md");
    expect(agents?.imports.map(entry => entry.displayPath)).toEqual(["docs/shared.md"]);
    expect(load.included.map(file => file.candidate.displayPath)).toEqual(["AGENTS.md"]);
    expect(load.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ displayPath: "CLAUDE.md", reason: "over-budget" })]));
  });
});

describe("amc agent-loop instructions", () => {
  it("lists what a native run loads: workspace-only discovery, overlays, imports, and no $AMC_HOME files", async () => {
    put("AMC.md", "amc\n@docs/style.md\n"); put("docs/style.md", "style\n"); put("CLAUDE.local.md", "local\n");
    const output: string[] = [];
    const program = new Command().exitOverride();
    registerPromptCommands(program, { log: line => output.push(line), error: line => output.push(line), fail: () => undefined });
    await program.parseAsync(["system-prompt", "instructions", "--workspace", workspace, "--json"], { from: "user" });
    const report = JSON.parse(output.join("\n")) as { searched: string[]; included: { displayPath: string; imports: { displayPath: string; sha256: string }[] }[] };
    expect(report.searched).not.toEqual(expect.arrayContaining([expect.stringContaining("$AMC_HOME")]));
    expect(report.included.map(file => file.displayPath)).toEqual(["AMC.md", "CLAUDE.local.md"]);
    expect(report.included[0]!.imports).toEqual([expect.objectContaining({ displayPath: "docs/style.md" })]);
  });
});
