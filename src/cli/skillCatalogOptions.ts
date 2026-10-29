import { buildSkillCatalog } from "../skills/skillCatalog.js";
import { workspaceSkillRoots } from "../skills/skillTurn.js";
import type { AgentLoopCliIo, RunOptions } from "../cli-agent-options.js";

/** Inspect discovery without composing a session or selecting a provider. */
export function showSkillCatalogSelection(opts: RunOptions, io: AgentLoopCliIo): boolean {
  if (opts.listSkills === undefined) return false;
  let roots: string[];
  try { roots = workspaceSkillRoots(process.cwd(), opts.credentialsHome); }
  catch (error) {
    const reason = error instanceof Error ? error.message : "Skill root discovery is incomplete.";
    if (opts.json) io.log(JSON.stringify({ ok: false, reason, observation: { version: 1, complete: false } }));
    else io.error(reason);
    io.fail(); return true;
  }
  const catalog = buildSkillCatalog(roots);
  const selected = typeof opts.listSkills === "string" ? catalog.skills.find(skill => skill.name === opts.listSkills) : undefined;
  const reason = typeof opts.listSkills === "string" && selected === undefined
    ? `No admitted skill named "${opts.listSkills}". Review discovery problems and the available names.` : undefined;
  const result = { ok: reason === undefined && catalog.observation.complete, ...(reason === undefined ? {} : { reason }),
    observation: catalog.observation, problems: catalog.problems,
    ...(selected === undefined ? { skills: catalog.skills.map(skill => ({ name: skill.name, description: skill.description,
      sourcePath: skill.sourcePath, digest: skill.digest, modelInvocation: skill.disableModelInvocation !== true })) } : { skill: selected }) };
  if (opts.json) io.log(JSON.stringify(result, null, 2));
  else {
    io.log(`Skill discovery: ${catalog.observation.complete ? "complete" : "incomplete"}; observation ${catalog.observation.digest}`);
    for (const skill of catalog.skills) io.log(`${skill.name}: ${skill.description} (${skill.sourcePath}; sha256 ${skill.digest})`);
    for (const problem of catalog.problems) io.error(`${problem.sourcePath}: ${problem.reason}`);
    if (selected !== undefined) io.log(selected.body);
    if (reason !== undefined) io.error(reason);
  }
  if (reason !== undefined || !catalog.observation.complete) io.fail();
  return true;
}
