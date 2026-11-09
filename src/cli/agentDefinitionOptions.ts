import { agentDefinitionRoots, agentDefinitionsDigest, readAgentDefinitions, type AgentDefinition, type AgentDefinitionCatalog } from "../agent/agentDefinitions.js";
import type { AgentLoopCliIo, RunOptions } from "../cli-agent-options.js";

/** `agent-loop run --list-agents [name]`: inspect agent definitions without composing a session or selecting a provider. */
export function showAgentDefinitionSelection(opts: RunOptions, io: AgentLoopCliIo): boolean {
  if (opts.listAgents === undefined) return false;
  let catalog: AgentDefinitionCatalog;
  try { catalog = readAgentDefinitions(agentDefinitionRoots(process.cwd(), opts.credentialsHome)); }
  catch (error) {
    const reason = error instanceof Error ? error.message : "Agent definition discovery is incomplete.";
    if (opts.json) io.log(JSON.stringify({ ok: false, reason, observation: { version: 1, complete: false } }));
    else io.error(reason);
    io.fail(); return true;
  }
  const selected = typeof opts.listAgents === "string" ? catalog.definitions.get(opts.listAgents) : undefined;
  const reason = typeof opts.listAgents === "string" && selected === undefined
    ? `No admitted agent definition named "${opts.listAgents}". Review discovery problems and the available names.` : undefined;
  const summary = (one: AgentDefinition) => ({ name: one.name, description: one.description, sourcePath: one.sourcePath, sha256: one.sha256,
    tools: one.tools ?? null, scope: one.scope ?? null, timeoutMs: one.timeoutMs ?? null, maxSteps: one.maxSteps ?? null });
  const result = { ok: reason === undefined && catalog.observation.complete && catalog.problems.length === 0,
    ...(reason === undefined ? {} : { reason }), digest: agentDefinitionsDigest(catalog.definitions),
    observation: catalog.observation, problems: catalog.problems,
    ...(selected === undefined ? { agents: [...catalog.definitions.values()].map(summary) } : { agent: { ...summary(selected), body: selected.body } }) };
  if (opts.json) io.log(JSON.stringify(result, null, 2));
  else {
    io.log(`Agent definitions: ${result.ok ? "complete" : "incomplete"}; digest ${result.digest}`);
    for (const one of catalog.definitions.values()) {
      io.log(`${one.name}: ${one.description} (${one.sourcePath}; sha256 ${one.sha256}; tools ${one.tools?.join(",") ?? "inherited"}; scope ${one.scope?.join(",") ?? "inherited"})`);
    }
    for (const problem of catalog.problems) io.error(`${problem.sourcePath}: ${problem.reason}`);
    if (selected !== undefined) io.log(selected.body);
    if (reason !== undefined) io.error(reason);
  }
  if (!result.ok) io.fail();
  return true;
}

/**
 * The definitions a `--delegate` run offers its children. A definition that
 * fails its rules is reported and withheld, never offered: a role nobody could
 * review is not a role. Discovery that cannot be completed withholds every
 * definition and says so, because an unexamined layer may shadow any name.
 */
export function loadAgentDefinitionsForRun(opts: RunOptions, warn: (line: string) => void): ReadonlyMap<string, AgentDefinition> {
  const catalog = readAgentDefinitions(agentDefinitionRoots(process.cwd(), opts.credentialsHome));
  for (const problem of catalog.problems) warn(`agent definition withheld: ${problem.sourcePath}: ${problem.reason}`);
  if (catalog.definitions.size > 0) warn(`agent definitions offered to delegates: ${[...catalog.definitions.keys()].join(", ")} (digest ${agentDefinitionsDigest(catalog.definitions)})`);
  return catalog.definitions;
}
