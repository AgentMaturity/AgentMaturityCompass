import type { Command } from "commander";
import { startAcpStdio } from "./acpStdioMain.js";

/**
 * `amc acp` (plan P7.1a).
 *
 * Speaks the Agent Client Protocol on stdio, which is how an editor launches an
 * agent: the client spawns this process and talks JSON-RPC down the pipe.
 *
 * NOTHING IS PRINTED ON SUCCESS. Not a banner, not a version line. Stdout is the
 * protocol stream and the first bytes a client reads must be a frame -- this is
 * the opposite of every other command in this CLI, and the reason `--json` is
 * absent rather than being a no-op.
 *
 * THE PROCESS STAYS UP UNTIL THE CLIENT CLOSES ITS SIDE. There is no idle
 * timeout: an editor may hold a session open for hours with nothing to say.
 */
export function registerAcpCommands(program: Command): void {
  program
    .command("acp")
    .description("Serve the Agent Client Protocol on stdio (for editors; prints nothing but frames)")
    .option("--provider <id>", "Provider route to serve", "stub")
    .option("--model <model>", "Model, required for a real provider")
    .option("--base-url <url>", "Override the provider base URL")
    .option("--credential <ref>", "Credential reference to resolve per request")
    .option("--credentials-home <dir>", "Credential home fixed for this ACP process")
    .option("--credentials-file <path>", "Explicit credential file fixed for this ACP process")
    .option("--tools <mode>", "none or explicitly enabled workspace tools", "none")
    .option("--approve-tools <actionClass>", "Require the existing signed approval gate for tool calls")
    .option("--approve-risk <tier>", "Signed approval risk tier; requires --approve-tools")
    .option("--mcp-config <path>", "Reviewed native MCP config; requires workspace tools and signed approvals")
    .option("--mcp-config-sha256 <digest>", "Pin exact reviewed MCP configuration bytes")
    .option("--max-tokens <n>", "Positive output-token bound per model request", "512")
    .option("--max-steps <n>", "Positive model-step bound per turn (default 8, stub 2)")
    .option("--agent-id <id>", "Agent identity recorded in the ledger", "default")
    .option("--system-prompt <text>", "System prompt for each session", "You are a careful assistant.")
    .action((opts: {
      provider: string;
      model?: string;
      baseUrl?: string;
      credential?: string;
      credentialsHome?: string;
      credentialsFile?: string;
      tools: string;
      approveTools?: string;
      approveRisk?: string;
      mcpConfig?: string;
      mcpConfigSha256?: string;
      maxTokens: string;
      maxSteps?: string;
      agentId: string;
      systemPrompt: string;
    }) => {
      let handle;
      try {
        handle = startAcpStdio({
          workspace: process.cwd(),
          agentId: opts.agentId,
          providerId: opts.provider,
          systemPrompt: opts.systemPrompt,
          tools: opts.tools as "none" | "workspace",
          maxTokens: Number(opts.maxTokens),
          ...(opts.maxSteps === undefined ? {} : { maxSteps: Number(opts.maxSteps) }),
          ...(opts.credentialsHome === undefined ? {} : { credentialsHome: opts.credentialsHome }),
          ...(opts.credentialsFile === undefined ? {} : { credentialsFile: opts.credentialsFile }),
          ...(opts.approveTools === undefined ? {} : { approveTools: opts.approveTools }),
          ...(opts.approveRisk === undefined ? {} : { approveRisk: opts.approveRisk }),
          ...(opts.mcpConfig === undefined ? {} : { mcpConfig: opts.mcpConfig }),
          ...(opts.mcpConfigSha256 === undefined ? {} : { mcpConfigSha256: opts.mcpConfigSha256 }),
          ...(opts.model === undefined ? {} : { model: opts.model }),
          ...(opts.baseUrl === undefined ? {} : { baseUrl: opts.baseUrl }),
          ...(opts.credential === undefined ? {} : { credential: opts.credential })
        });
      } catch (error) {
        // To stderr and a non-zero exit. A misconfiguration reported as a frame
        // would be read by the client as a protocol message.
        process.stderr.write(`amc acp: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(2);
      }
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => {
          void handle.close().then(() => process.exit(0), () => {
            process.stderr.write("amc acp: shutdown could not seal every owned session\n");
            process.exit(1);
          });
        });
      }
    });
}
