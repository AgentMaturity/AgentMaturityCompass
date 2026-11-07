import { lstatSync, opendirSync, realpathSync, type Stats } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { parseSkillFrontmatter, type SkillFields } from "./skillFrontmatter.js";

/**
 * A layered, digest-driven skill catalog (plan P6.2).
 *
 * A skill is a `SKILL.md` under a layer root: frontmatter naming it, and a body
 * of instructions the model is given when the skill loads. A COMMAND (SH-EXT-05)
 * is the same thing without a directory: `<name>.md` or `<ns>/<name>.md` in the
 * `commands` directory beside a skill root (`.amc/commands` beside `.amc/skills`),
 * invoked as `/name` or `/ns:name`.
 *
 * THE SECURITY QUESTION, and why this file does not answer it. A SKILL.md is a
 * file in a workspace — untrusted content that becomes INSTRUCTIONS. The prompt
 * spine already settled that case: `PromptContext.literal`
 * (../prompt/assembly/promptTypes.ts) exists so workspace-authored instruction
 * text is never interpolated, and its docstring names `AGENTS.md` as the
 * motivating example. A skill is the same example under a different filename, so
 * a loaded skill enters the prompt as a LITERAL CONTEXT and never as a
 * `PromptSection`, which is deployment-authored and always interpolated. This
 * module produces the text; ./skillPrompt.ts is where that rule is applied.
 *
 * LAYERS OVERRIDE BY POSITION, later winning, which is the usual shape (a
 * workspace layer over a shared one). What matters more than the rule is that
 * the WINNER records where it came from: "which of the three files on disk is
 * the model actually being given" should never need inference.
 *
 * DIGESTS NAME CONTENT, NOT LOCATION. Two identical skills in different
 * directories produce the same catalog digest, and one changed byte produces a
 * different one — so a signed run can say exactly which instructions the model
 * was given, and moving a layer does not read as a change.
 */

export interface Skill extends SkillFields {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  /** Which file won, after layering. */
  readonly sourcePath: string;
  /** sha256 of the file's full contents. */
  readonly digest: string;
  /** `disable-model-invocation: true`: loads on `/name` only, never advertised to or loaded by the model. */
  readonly disableModelInvocation?: true;
  /** A directory skill, or a command file. */
  readonly kind: "skill" | "command";
  /** The skill's directory; a command file has none. */
  readonly directory?: string;
  /** Regular files beside SKILL.md (names and sizes only, at most 64), so the model knows what `fs.read` can reach. */
  readonly siblings?: readonly { readonly name: string; readonly bytes: number }[];
}

export interface SkillProblem {
  readonly name: string;
  readonly sourcePath: string;
  readonly reason: string;
}

export interface SkillCatalog {
  readonly skills: readonly Skill[];
  /**
   * Skills that exist on disk and could not be read.
   *
   * Reported rather than dropped: a skill that cannot be parsed is not the same
   * as a skill that is absent, and an operator who wrote one and sees nothing
   * needs to be told which file and why.
   */
  readonly problems: readonly SkillProblem[];
  /** Coverage has its own digest; it never changes the historical content digest. */
  readonly observation: {
    readonly version: 1;
    readonly complete: boolean;
    readonly roots: readonly { readonly sourcePath: string; readonly status: "absent" | "read" | "incomplete" }[];
    readonly digest: string;
  };
}

const SKILL_CATALOG_LIMITS = Object.freeze({ fileBytes: 64 * 1024, totalBytes: 1024 * 1024,
  entries: 2048, roots: 64, problems: 64, siblings: 64 });

/** One name grammar for skills and commands: a segment, or `ns:name` for a command in a subdirectory. */
const SEGMENT = "[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}";
const SKILL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const COMMAND_NAME = new RegExp(`^${SEGMENT}(?::${SEGMENT})?$`);

function sameSource(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink
    && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseSkill(expected: string, sourcePath: string, raw: string, kind: Skill["kind"]): Skill | SkillProblem {
  const matched = FRONTMATTER.exec(raw);
  if (!matched) return { name: expected, sourcePath, reason: "no --- frontmatter block at the top of the file" };
  const [, front = "", body = ""] = matched;
  const parsed = parseSkillFrontmatter(front);
  if ("reason" in parsed) return { name: expected, sourcePath, reason: parsed.reason };
  const { fields } = parsed;
  const name = fields.name ?? (kind === "command" ? expected : "");
  if (name.length === 0) return { name: expected, sourcePath, reason: "frontmatter has no name" };
  if (name !== expected) {
    // The directory (or file name) is what `/name` resolves against; the
    // frontmatter is what a reader believes. Two answers to "what is this skill
    // called" is one too many, and the mismatch is how a skill gets loaded under
    // a name nobody reviewed.
    return { name: expected, sourcePath, reason: `frontmatter name ${JSON.stringify(name)} does not match its ${kind === "skill" ? "directory" : "file"} ${JSON.stringify(expected)}` };
  }
  // A command file may leave the description to its first line, as Claude Code's do.
  const description = fields.description ?? (kind === "command" ? (body.split(/\r?\n/).find(line => line.trim().length > 0)?.trim().slice(0, 200) ?? "") : "");
  if (description.length === 0) return { name: expected, sourcePath, reason: "frontmatter has no description" };
  if (!(kind === "skill" ? SKILL_NAME : COMMAND_NAME).test(name))
    return { name: expected, sourcePath, reason: kind === "skill" ? "skill name must be a slash-command name of at most 128 characters" : "command name must be a slash-command segment, or ns:name, of at most 64 characters each" };
  return { ...fields, name, description, body, sourcePath, digest: sha256Hex(raw), kind };
}

/** Where a layer's command files live: the `commands` directory beside its `skills` directory. */
export function commandsRootFor(skillRoot: string): string {
  return join(dirname(resolve(skillRoot)), "commands");
}

interface Candidate { readonly name: string; readonly rel: string; readonly sourcePath: string; readonly kind: Skill["kind"]; readonly directory?: string }

/**
 * Read every layer in order, later layers overriding earlier ones by name.
 *
 * A root that does not exist contributes nothing and is not an error: layering a
 * workspace directory over a shared one means the workspace usually has none.
 */
export function buildSkillCatalog(roots: readonly string[]): SkillCatalog {
  const winners = new Map<string, Skill>();
  const problems = new Map<string, SkillProblem>();
  const observations: { sourcePath: string; status: "absent" | "read" | "incomplete" }[] = [];
  const witnesses = new Map<string, Stats | null>();
  let complete = true, entriesSeen = 0, totalBytes = 0;
  const report = (name: string, sourcePath: string, reason: string) => {
    complete = false;
    winners.delete(name);
    if (problems.has(name) || problems.size < SKILL_CATALOG_LIMITS.problems - 1)
      problems.set(name, { name, sourcePath, reason });
    else problems.set("*diagnostics", { name: "*diagnostics", sourcePath, reason: "Additional discovery problems omitted at the diagnostic limit." });
  };
  const witness = (path: string): Stats => {
    const stat = lstatSync(path);
    witnesses.set(path, stat);
    return stat;
  };
  /** Names in a directory, through the same entry limit every listing shares. */
  const listDirectory = (path: string): string[] => {
    const names: string[] = [];
    const directory = opendirSync(path);
    try {
      let entry;
      while ((entry = directory.readSync()) !== null) {
        if (++entriesSeen > SKILL_CATALOG_LIMITS.entries) throw new Error("entry limit");
        names.push(entry.name);
      }
    } finally { directory.closeSync(); }
    return names.sort();
  };
  const readCandidate = (root: string, candidate: Candidate, observation: { status: "absent" | "read" | "incomplete" }, layerNames: Set<string>) => {
    try {
      let before: Stats;
      try { before = witness(candidate.sourcePath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      // Reuse the contained, nonblocking, no-follow reader. Recheck its exact
      // source witness after reading and once more before publishing a catalog.
      const bytes = readContainedOrNull(root, candidate.rel, SKILL_CATALOG_LIMITS.fileBytes);
      const after = lstatSync(candidate.sourcePath);
      if (bytes === null || !sameSource(before, after) || bytes.length !== after.size)
        throw new Error("skill changed during discovery");
      if ((totalBytes += bytes.length) > SKILL_CATALOG_LIMITS.totalBytes) throw new Error("aggregate byte limit");
      const parsed = parseSkill(candidate.name, candidate.sourcePath, new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), candidate.kind);
      if (!("digest" in parsed)) { observation.status = "incomplete"; report(candidate.name, candidate.sourcePath, parsed.reason); return; }
      if (layerNames.has(candidate.name)) { observation.status = "incomplete"; report(candidate.name, candidate.sourcePath, "command name collides with a skill in the same layer"); return; }
      layerNames.add(candidate.name);
      const siblings = candidate.directory === undefined ? {} : { siblings: listDirectory(candidate.directory)
        .filter(name => name !== "SKILL.md").map(name => ({ name, stat: lstatSync(join(candidate.directory!, name)) }))
        .filter(({ stat }) => stat.isFile()).slice(0, SKILL_CATALOG_LIMITS.siblings).map(({ name, stat }) => ({ name, bytes: stat.size })) };
      winners.set(candidate.name, { ...parsed, ...(candidate.directory === undefined ? {} : { directory: candidate.directory }), ...siblings });
      problems.delete(candidate.name);
    } catch (error) {
      observation.status = "incomplete";
      const message = error instanceof Error ? error.message : "";
      const reason = /symlink|symbolic-link/.test(message) ? "symbolic-link skill source refused"
        : /bytes|limit/.test(message) ? "skill exceeds a file or aggregate byte limit"
        : /changed/.test(message) ? "skill source changed during discovery; retry after review"
        : "skill source could not be examined or read as a regular UTF-8 file";
      report(candidate.name, candidate.sourcePath, reason);
    }
  };
  /** Skill directories under a skills root, or `.md` files (one namespace level deep) under a commands root. */
  const candidates = (root: string, kind: Skill["kind"]): Candidate[] => {
    const out: Candidate[] = [];
    for (const name of listDirectory(root)) {
      const path = join(root, name);
      const stat = witness(path);
      if (stat.isSymbolicLink()) throw new Error(kind === "skill" ? "symbolic-link skill directory" : "symbolic-link command entry");
      if (kind === "skill") {
        if (stat.isDirectory()) out.push({ name, rel: `${name}/SKILL.md`, sourcePath: join(path, "SKILL.md"), kind, directory: path });
      } else if (stat.isFile() && name.endsWith(".md")) {
        out.push({ name: basename(name, ".md"), rel: name, sourcePath: path, kind });
      } else if (stat.isDirectory()) {
        for (const inner of listDirectory(path)) {
          const innerPath = join(path, inner), innerStat = witness(innerPath);
          if (innerStat.isSymbolicLink()) throw new Error("symbolic-link command entry");
          if (innerStat.isFile() && inner.endsWith(".md")) out.push({ name: `${name}:${basename(inner, ".md")}`, rel: `${name}/${inner}`, sourcePath: innerPath, kind });
        }
      }
    }
    return out;
  };

  if (roots.length > SKILL_CATALOG_LIMITS.roots)
    report("*roots", "", `Skill roots exceed the ${SKILL_CATALOG_LIMITS.roots} root limit.`);
  for (const input of roots.slice(0, SKILL_CATALOG_LIMITS.roots)) {
    const layerNames = new Set<string>();
    for (const [root, kind] of [[resolve(input), "skill"], [commandsRootFor(input), "command"]] as const) {
      const observation = { sourcePath: root, status: "read" as "absent" | "read" | "incomplete" };
      observations.push(observation);
      let found: Candidate[] = [];
      try {
        let rootStat: Stats;
        try { rootStat = witness(root); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          witnesses.set(root, null); observation.status = "absent"; continue;
        }
        if (rootStat.isSymbolicLink() || realpathSync(root) !== root) throw new Error("symbolic-link root");
        if (!rootStat.isDirectory()) throw new Error("root is not a directory");
        found = candidates(root, kind);
      } catch (error) {
        // Unknown higher-layer contents may shadow ANY lower skill. Never expose
        // a stale fallback as though the intended override had been examined.
        winners.clear(); observation.status = "incomplete";
        const detail = error instanceof Error && /symbolic-link|directory|limit/.test(error.message) ? error.message : "root could not be read or listed";
        report(`*root:${observations.length}`, root, detail);
        if (entriesSeen > SKILL_CATALOG_LIMITS.entries) break;
        continue;
      }
      for (const candidate of found) {
        readCandidate(root, candidate, observation, layerNames);
        if (totalBytes > SKILL_CATALOG_LIMITS.totalBytes) { winners.clear(); break; }
      }
      if (totalBytes > SKILL_CATALOG_LIMITS.totalBytes) break;
    }
    if (totalBytes > SKILL_CATALOG_LIMITS.totalBytes || entriesSeen > SKILL_CATALOG_LIMITS.entries) break;
  }
  // A later layer can take time to scan. Do not publish an earlier layer that
  // changed, disappeared or appeared during that same observation.
  for (const [path, before] of witnesses) {
    try {
      let after: Stats | null;
      try { after = lstatSync(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; after = null; }
      if (before === null ? after !== null : after === null || !sameSource(before, after))
        throw new Error("source changed");
    } catch {
      winners.clear(); report("*changed", path, "skill source changed or became unreadable during discovery; retry after review");
      break;
    }
  }
  if (roots.length > SKILL_CATALOG_LIMITS.roots || entriesSeen > SKILL_CATALOG_LIMITS.entries) winners.clear();
  const skills = [...winners.values()].sort((a, b) => a.name.localeCompare(b.name));
  const diagnostics = [...problems.values()].sort((a, b) => a.name.localeCompare(b.name));
  const observation = { version: 1 as const, complete, roots: observations };
  return { skills, problems: diagnostics,
    observation: { ...observation, digest: sha256Hex(canonicalize({ ...observation, problems: diagnostics,
      skills: skills.map(({ name, digest, sourcePath }) => ({ name, digest, sourcePath })) })) } };
}

/**
 * One digest over the whole catalog, naming content rather than location.
 *
 * Source paths are deliberately excluded: moving a layer is not a change to what
 * the model is told, and a digest that moved with the directory would report one.
 */
export function skillCatalogDigest(catalog: SkillCatalog): string {
  return sha256Hex(
    canonicalize(catalog.skills.map((one) => ({ name: one.name, digest: one.digest })))
  );
}

export type SkillCommand =
  | { readonly kind: "skill"; readonly skill: Skill; readonly rest: string }
  | { readonly kind: "unknown-skill"; readonly name: string; readonly known: readonly string[] }
  | { readonly kind: "message" };

/** A `/name` or `/ns:name` is a bare word after the slash — `/usr/bin/thing` is a path someone typed. */
const COMMAND = new RegExp(`^\\/(${SEGMENT}(?::${SEGMENT})?|[a-zA-Z0-9][a-zA-Z0-9_-]*)(?:\\s+([\\s\\S]*))?$`);

/**
 * Read a user's line as a skill invocation, or as an ordinary message.
 *
 * An UNKNOWN skill is its own answer rather than falling through to a message. A
 * user who typed `/lnit` meant a skill, and passing the typo through would send
 * the model an instruction-shaped string that nobody resolved.
 */
export function resolveSkillCommand(catalog: SkillCatalog, line: string): SkillCommand {
  const matched = COMMAND.exec(line.trim());
  if (!matched) return { kind: "message" };
  const [, name = "", rest = ""] = matched;

  const skill = catalog.skills.find((one) => one.name === name);
  if (!skill) {
    return { kind: "unknown-skill", name, known: catalog.skills.map((one) => one.name) };
  }
  return { kind: "skill", skill, rest: rest.trim() };
}
