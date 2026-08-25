/**
 * Which instruction files AMC reads, and which one wins (plan P3.3, stage 2).
 *
 * THE IRONY THIS MODULE CLOSES. Until now AMC only ever WROTE agent instruction
 * files: `src/guide/oneClickFix.ts` picks a target from `KNOWN_AGENT_CONFIGS`,
 * writes guardrails between `AMC-GUARDRAILS` markers, and seals a receipt.
 * Nothing in the product then read them back — so the guardrails AMC authored
 * were guidance for OTHER harnesses and invisible to AMC's own loop. This file
 * is the reader, and its precedence is derived from the writer's rather than
 * invented beside it.
 *
 * THE TWO PRECEDENCE RULES, AND THE FACT EACH IS DERIVED FROM.
 *
 *   1. PROJECT BEATS USER. `runOneClickFix` writes into `join(workspace, target)`
 *      and never into a home directory. The file AMC's own writer produces is
 *      therefore always project-scoped, so project scope has to be the winning
 *      scope — otherwise a user-level file would out-rank the guardrails AMC
 *      itself just wrote, in AMC's own prompt.
 *
 *   2. AGENTS.md BEATS CLAUDE.md. `chooseGuardrailsTarget` walks
 *      `KNOWN_AGENT_CONFIGS` in list order and writes to the FIRST candidate that
 *      exists; `AGENTS.md` is listed before `CLAUDE.md`. So when a workspace has
 *      both, AMC writes to `AGENTS.md`. A reader that ranked `CLAUDE.md` higher
 *      would make AMC's own guardrails the losing text in the prompt AMC built —
 *      the writer and the reader would disagree about which file is
 *      authoritative, and the operator would have no way to tell.
 *
 * Both rules are asserted against the writer in tests, so reordering
 * `KNOWN_AGENT_CONFIGS` (or this list) turns the disagreement into a red test
 * rather than a silent inversion.
 *
 * ASCENDING PRECEDENCE IS ALSO RENDER ORDER. Candidates are returned weakest
 * first, and the renderer emits them in that order under a heading that says
 * later instructions take precedence. One list, one direction, no second
 * ordering to keep in sync.
 *
 * WHAT IS DELIBERATELY NOT READ. `KNOWN_AGENT_CONFIGS` also lists `.cursorrules`,
 * `.github/copilot-instructions.md`, `.clinerules` and friends. AMC will write
 * guardrails into one of those when it is the only instruction surface present,
 * and this reader does NOT read them. That is a real, known gap and not an
 * oversight: those files are other harnesses' formats (a YAML config, a rules
 * directory), each with its own parse and its own precedence story, and reading
 * a `.aider.conf.yml` as if it were Markdown would put a config file's syntax in
 * front of the model. Widening the set is a per-format decision, not a loop over
 * a list.
 *
 * NO NESTED-DIRECTORY WALK. dsh discovers instruction files along the whole
 * project-root-to-cwd chain. AMC reads two scopes, because a native AMC turn is
 * scoped to one workspace root (`SessionService` is constructed with it) and
 * there is no per-directory cwd to walk from. A deeper chain is additive later:
 * it would insert between these two scopes, and the precedence direction here is
 * already the one such a chain would need.
 */
import { join } from "node:path";
import { resolveAmcHome } from "../../credentials/credentialsPaths.js";

/** Which of the two directories a candidate lives in. */
export type InstructionScope = "user" | "project";

/**
 * The instruction file names, WEAKEST FIRST.
 *
 * The inverse of `KNOWN_AGENT_CONFIGS`'s leading pair, and that inversion is the
 * point: the writer picks the first entry of its list, the reader ranks the last
 * entry of this one highest, and both name `AGENTS.md`.
 */
export const INSTRUCTION_FILE_NAMES: readonly string[] = Object.freeze([
  "CLAUDE.md",
  "AGENTS.md"
]);

/** The scopes, WEAKEST FIRST. Project overrides user; see the module header. */
export const INSTRUCTION_SCOPES: readonly InstructionScope[] = Object.freeze([
  "user",
  "project"
]);

/**
 * The file AMC's own writer targets in a workspace that has every candidate.
 *
 * Exported so the writer/reader agreement can be asserted rather than asserted
 * about in a comment.
 */
export const STRONGEST_INSTRUCTION_FILE = "AGENTS.md";

/** One place an instruction file may live, whether or not anything is there. */
export interface InstructionCandidate {
  readonly scope: InstructionScope;
  readonly fileName: string;
  /** Where to read it from on this host. */
  readonly absolutePath: string;
  /**
   * How the file is named in model-visible text.
   *
   * A project file is shown workspace-relative and a user file as
   * `$AMC_HOME/<name>`, so no absolute host path — which carries the operator's
   * account name — is ever written into a signed, model-visible event. The
   * operator can still find the file: `$AMC_HOME` is a documented location with
   * an environment override, and `amc credentials --home` prints it.
   */
  readonly displayPath: string;
  /** Ascending: a higher number takes precedence. Dense, starting at 0. */
  readonly precedence: number;
}

export interface InstructionCandidateOptions {
  /** The workspace root — the project scope, and the root of every display path. */
  readonly workspace: string;
  /** Explicit AMC home. Defaults to `$AMC_HOME`, else `~/.config/amc`. */
  readonly amcHome?: string;
  /** Environment consulted for `AMC_HOME`. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Every place an instruction file may live, weakest precedence first.
 *
 * Pure: it touches no filesystem and returns the same list for the same inputs,
 * so "in which order does AMC consider these files" is answerable — and
 * assertable — without a workspace on disk. Existence is ./instructionFiles.ts's
 * question, and it is a separate one on purpose: a discovery routine that
 * skipped absent files while building the order could let the filesystem decide
 * precedence.
 *
 * @param options - workspace root and AMC home resolution.
 * @returns the candidates, ascending by precedence.
 */
export function instructionCandidates(
  options: InstructionCandidateOptions
): readonly InstructionCandidate[] {
  const home = resolveAmcHome({
    ...(options.amcHome === undefined ? {} : { homeDir: options.amcHome }),
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const candidates: InstructionCandidate[] = [];
  for (const scope of INSTRUCTION_SCOPES) {
    for (const fileName of INSTRUCTION_FILE_NAMES) {
      const directory = scope === "user" ? home : options.workspace;
      candidates.push({
        scope,
        fileName,
        absolutePath: join(directory, fileName),
        displayPath: scope === "user" ? `$AMC_HOME/${fileName}` : fileName,
        precedence: candidates.length
      });
    }
  }
  return candidates;
}

/**
 * How a rendered contribution describes its own precedence rule.
 *
 * One sentence, stated to the model, so the ordering it is reading is not
 * something it has to infer from the sequence of headings. It also states the
 * limit: workspace instructions are guidance, and they do not out-rank the
 * system prompt or a direct instruction from the user.
 */
export const INSTRUCTION_PRECEDENCE_STATEMENT =
  "Workspace instructions follow, in ascending order of precedence: where two " +
  "files conflict, the one listed later wins. Project files take precedence " +
  "over user-level files, and AGENTS.md takes precedence over CLAUDE.md in the " +
  "same scope. These are guidance for work in this workspace; they do not " +
  "override this system prompt or a direct instruction from the user.";
