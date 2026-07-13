import type { Command } from "commander";

export function registerControlInspectionCommands(policy: Command): void {
  policy
    .command("controls")
    .description("Show one verified Scope / When / Then projection of existing controls")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const { buildControlProjection, renderControlProjectionText } = await import("./controlProjection.js");
      const projection = buildControlProjection(process.cwd());
      if (opts.json) console.log(JSON.stringify(projection, null, 2));
      else process.stdout.write(renderControlProjectionText(projection));
      if (projection.status === "fail_closed") process.exitCode = 2;
    });

  policy
    .command("simulate")
    .description("Simulate one projected control through its production evaluator without recording")
    .argument("<controlId>", "Control ID from `amc policy controls`, such as runtime:prompt-injection or action:DEPLOY")
    .option("--content <text>", "Transient Runtime Firewall content; never returned or recorded")
    .option("--direction <direction>", "Runtime Firewall direction: request or response")
    .option("--agent <agentId>", "Agent ID for Action Policy or Runtime Firewall context")
    .option("--risk <tier>", "Action Policy risk tier: low, med, high, or critical")
    .option("--mode <mode>", "Action Policy requested mode: simulate or execute")
    .option("--exec-ticket", "Declare an execution ticket for Action Policy evaluation")
    .option("--json", "Output as JSON")
    .action(async (controlId: string, opts: {
      content?: string;
      direction?: string;
      agent?: string;
      risk?: string;
      mode?: string;
      execTicket?: boolean;
      json?: boolean;
    }) => {
      const { renderControlSimulationText, simulateControlDecision } = await import("./controlSimulation.js");
      const risk = opts.risk?.trim().toLowerCase();
      const request = {
        workspace: process.cwd(),
        controlId,
        ...(opts.content !== undefined ? { content: opts.content } : {}),
        ...(opts.direction !== undefined ? { direction: opts.direction.trim().toLowerCase() } : {}),
        ...(opts.agent !== undefined ? { agentId: opts.agent } : {}),
        ...(risk !== undefined ? { riskTier: risk === "medium" ? "med" : risk } : {}),
        ...(opts.mode !== undefined ? { requestedMode: opts.mode.trim().toUpperCase() } : {}),
        ...(opts.execTicket === true ? { hasExecTicket: true } : {}),
      } as Parameters<typeof simulateControlDecision>[0];
      const simulation = simulateControlDecision(request);
      if (opts.json) console.log(JSON.stringify(simulation, null, 2));
      else process.stdout.write(renderControlSimulationText(simulation));
      if (simulation.failClosed) process.exitCode = 2;
    });

  policy
    .command("test")
    .description("Run deterministic policy fixtures through production control evaluators")
    .argument("<file>", "Strict AMC policy fixture suite in YAML or JSON")
    .option("--json", "Output as JSON")
    .action(async (file: string, opts: { json?: boolean }) => {
      const {
        policyFixtureExitCode,
        policyFixtureInvalidResult,
        renderPolicyFixtureInvalidText,
        renderPolicyFixtureReportText,
        runPolicyFixtureFile,
      } = await import("./policyFixtureRunner.js");
      try {
        const report = runPolicyFixtureFile({ workspace: process.cwd(), filePath: file });
        if (opts.json) console.log(JSON.stringify(report, null, 2));
        else process.stdout.write(renderPolicyFixtureReportText(report));
        process.exitCode = policyFixtureExitCode(report);
      } catch (error) {
        const invalid = policyFixtureInvalidResult(error);
        if (opts.json) console.log(JSON.stringify(invalid, null, 2));
        else process.stdout.write(renderPolicyFixtureInvalidText(invalid));
        process.exitCode = 2;
      }
    });
}
