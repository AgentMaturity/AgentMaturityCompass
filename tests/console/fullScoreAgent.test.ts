/**
 * studio-ui inherit slice: "Run the full score" ran bare `amc` and was offered only on the default agent, on the
 * assumption that bare `amc` scores "default". It scores resolveAgentId(cwd, --agent): --agent, else AMC_AGENT_ID in
 * Studio's environment, else the workspace's current agent, else "default" (src/cli.ts program.action,
 * src/fleet/paths.ts). The console now names the agent with --agent. The button stays on "default" only: the page reads
 * the run through /runs/:id/report, which looks only in the workspace's current agent's records (seen live: another
 * agent's new run answered "run report not found").
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { validateCliExec } from "../../src/studio/cliBridge.js";

const app = readFileSync("src/console/assets/app.js", "utf8");

describe("Run the full score", () => {
  test("sends the page's agent as --agent", () => {
    expect(app).toContain('apiPost("/cli/exec", { command: "amc", format: "json", timeout: 120000, args: { agent: agentId } })');
    expect(app).toContain('bindFullScore("agentRunScore", renderAgent, agentId);');
    expect(app).toContain('action: agentId === "default" ? \'<button id="agentRunScore"');
    expect(readFileSync("src/cli.ts", "utf8")).toContain("const agentId = resolveAgentId(process.cwd(), opts.agent ?? activeAgent(program) ?? undefined);");
  });

  test("the CLI bridge accepts the agent option", () => {
    expect(validateCliExec({ command: "amc", format: "json", args: { agent: "helper-1" } } as never)).toBeNull();
  });
});
