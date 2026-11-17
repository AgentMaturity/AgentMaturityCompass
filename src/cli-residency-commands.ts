/**
 * `amc residency status|profile|init`: the operator's way to write and sign the destination registry a workspace with
 * an active compiled plan needs before any session opens (docs/OPS_HARDENING.md, Residency routing). Nothing here
 * creates a registry the operator did not write or infers a region: `init` validates the operator's file with the
 * registry schema and signs it through initDestinationRegistry (owner mode). A registry records operator declarations;
 * it is not legal approval or evidence of where data physically resides.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import YAML from "yaml";
import { registryStatus, residencyRefusalWords } from "./residency/admissionWords.js";
import { destinationRegistrySchema, initDestinationRegistry } from "./residency/destinationRegistry.js";

const MAX_FILE_BYTES = 1_048_576;

/** The registry's state in words; the destinations and rules are checked again when each session starts. */
function printStatus(workspace: string): void {
  const status = registryStatus(workspace);
  console.log(status.planActive === null ? "Active compiled plan: present, but it does not verify."
    : status.planActive ? "Active compiled plan: yes. Every session in this workspace needs a signed destination registry that matches it."
      : "Active compiled plan: none.");
  console.log(status.registry === "missing" ? "Destination registry: none (.amc/residency/destinations.yaml)."
    : status.registry === "invalid" ? `Destination registry: present, but it does not verify (${status.invalidReason}).`
      : `Destination registry: signed and readable; ${status.rules} rule(s); destinations: ${status.destinations.join("; ") || "none"}.`);
  if (status.profileMatches !== null) {
    console.log(status.profileMatches ? "Deployment profile: the file the registry names is the one the active plan was compiled from."
      : "Deployment profile: the file the registry names is not the one the active plan was compiled from (`amc residency profile --out <file>` writes that one).");
  }
  console.log(status.held !== null ? chalk.yellow(residencyRefusalWords("registry_unverifiable", status.held, false))
    : status.registry === "verified" ? "Sessions are not held by the registry itself. Each session's storage URL and each model or tool destination is still checked against the rules when it starts."
      : "Nothing holds sessions here.");
}

/** A path the registry can name: inside the workspace, relative, never a symlink target outside it (the loader checks that again). */
function workspaceRelative(workspace: string, out: string): string {
  const path = relative(workspace, resolve(workspace, out));
  if (path === "" || path.startsWith("..") || isAbsolute(path)) throw new Error("Choose a file inside the workspace folder; the registry names it by a relative path.");
  return path.split(sep).join("/"); // the registry names it with forward slashes on every platform
}

/** The deployment profile the active plan pins, from the A4 project that compiled it; null when no stored copy matches. */
async function pinnedA4Profile(workspace: string, projectId: string, profileSha256: string): Promise<unknown> {
  const [{ openA4Store }, { loadA4State, storedSpecOf }, { parseDeploymentProfile }, { sha256Hex }, { canonicalize }] = await Promise.all([
    import("./a4/a4Store.js"), import("./a4/a4Gates.js"), import("./catalog/compiler/compile.js"), import("./utils/hash.js"), import("./utils/json.js")]);
  const store = openA4Store(workspace);
  try {
    const state = loadA4State(store, projectId, Date.now());
    for (const row of [...state.revisions].reverse().filter((one) => one.stage === "adapt")) {
      const profile = (storedSpecOf(row).understanding as { facts?: { profile?: unknown } } | undefined)?.facts?.profile;
      if (profile === undefined || profile === null) continue;
      try { if (sha256Hex(canonicalize(parseDeploymentProfile(profile))) === profileSha256) return profile; } catch { /* not a profile that parses: not this one */ }
    }
    return null;
  } finally {
    store.close();
  }
}

export function registerResidencyCommands(program: Command): void {
  const residency = program.command("residency").description("The signed destination registry a workspace with an active compiled plan needs before sessions open");

  residency.command("status").description("Say whether this workspace's destination registry lets sessions open, and what is missing")
    .action(() => { printStatus(process.cwd()); });

  residency.command("profile").description("Write the deployment profile the active compiled plan pins, for the registry's profile.path")
    .requiredOption("--out <file>", "a new file inside the workspace (for example .amc/residency/profile.yaml)")
    .action(async (opts: { out: string }) => {
      try {
        const workspace = process.cwd(), path = workspaceRelative(workspace, opts.out);
        if (existsSync(resolve(workspace, path))) throw new Error(`${path} exists already; choose a new file.`);
        const { loadActiveCompiledPolicy } = await import("./catalog/compiler/activate.js");
        const active = loadActiveCompiledPolicy(workspace);
        if (active === null) throw new Error("No compiled plan is active here, so no profile is pinned.");
        const projectId = active.deployment?.deploymentId ?? "";
        if (!/^a4p_[0-9a-f]{32}$/.test(projectId)) {
          throw new Error("The active plan was not compiled by an A4 project. Name the profile file you compiled it from (amc catalog compile) in the registry.");
        }
        const profile = await pinnedA4Profile(workspace, projectId, active.profileSha256);
        if (profile === null) throw new Error(`No stored profile of A4 project ${projectId} matches the active plan's profile digest; compile and activate the plan again.`);
        const { writeFileAtomic } = await import("./utils/fs.js");
        writeFileAtomic(resolve(workspace, path), YAML.stringify(profile), 0o600);
        console.log(`Wrote the profile the active plan pins to ${path}. Name it in the registry as profile.path: ${path}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  residency.command("init").description("Validate an operator-written destination registry, write it to .amc/residency/destinations.yaml and sign it (owner mode)")
    .requiredOption("--file <yaml>", "the registry you wrote (schemaVersion amc.residency-destinations/v1)")
    .action((opts: { file: string }) => {
      const workspace = process.cwd();
      try {
        const size = statSync(opts.file).size;
        if (size > MAX_FILE_BYTES) throw new Error("The registry file is larger than 1 MiB.");
        const parsed = destinationRegistrySchema.safeParse(YAML.parse(readFileSync(opts.file, "utf8"), { maxAliasCount: 0, uniqueKeys: true }));
        if (!parsed.success) {
          throw new Error(`The registry does not match the schema:\n${parsed.error.issues.slice(0, 20).map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n")}`);
        }
        initDestinationRegistry(workspace, parsed.data);
        console.log("Wrote and signed .amc/residency/destinations.yaml.");
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
        return;
      }
      printStatus(workspace);
    });
}
