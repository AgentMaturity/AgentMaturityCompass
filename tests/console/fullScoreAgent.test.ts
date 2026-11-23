/**
 * studio-ui inherit slice: "Run the full score" ran bare `amc` and was offered only on the default agent, on the
 * assumption that bare `amc` scores "default". It scores resolveAgentId(cwd, --agent): --agent, else AMC_AGENT_ID in
 * Studio's environment, else the workspace's current agent, else "default" (src/cli.ts program.action,
 * src/fleet/paths.ts). The console now names the agent with --agent. Since 2026-11-19 the page reads the run with
 * /runs/:id/report?agentId=<agent> (that agent's records), so the button is offered for every agent the page shows.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { validateCliExec } from "../../src/studio/cliBridge.js";

const app = readFileSync("src/console/assets/app.js", "utf8");

describe("Run the full score", () => {
  test("sends the page's agent as --agent", () => {
    expect(app).toContain('apiPost("/cli/exec", { command: "amc", format: "json", timeout: 120000, args: { agent: agentId } })');
    expect(app).toContain('bindFullScore("agentRunScore", renderAgent, agentId);');
    expect(app).toContain("action: '<button id=\"agentRunScore\"");
    expect(app).toContain("/report?agentId=${encodeURIComponent(agentId)}`");
    expect(readFileSync("src/cli.ts", "utf8")).toContain("const agentId = resolveAgentId(process.cwd(), opts.agent ?? activeAgent(program) ?? undefined);");
  });

  test("the CLI bridge accepts the agent option", () => {
    expect(validateCliExec({ command: "amc", format: "json", args: { agent: "helper-1" } } as never)).toBeNull();
  });
});
