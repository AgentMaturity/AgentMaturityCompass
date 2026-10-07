/**
 * The `agent-loop guide` and `agent-loop mcp-catalog` commands: local inspection
 * that writes nothing and calls no provider. Split out of cli-agent-commands.ts,
 * which sits at the 800-line new-file cap; behaviour is unchanged.
 */
import type { Command } from "commander";
import { inspectNativeFirstUse, renderNativeFirstUseGuide, type NativeFirstUseOptions } from "./setup/nativeFirstUseGuide.js";
import { NativeMcpConfigError } from "./setup/nativeMcpConfig.js";
import type { AgentLoopCliIo } from "./cli-agent-options.js";

export function selectedAgentOption(command: Command): string | undefined {
  return command.opts<{ agent?: string }>().agent ?? command.optsWithGlobals<{ agent?: string }>().agent;
}

export function registerAgentGuideCommands(group: Command, io: AgentLoopCliIo): void {
  group
    .command("guide")
    .option("--agent <id>", "agent identity; defaults to AMC_AGENT_ID, the current agent, then default")
    .description("Inspect local setup without writes or provider calls and show the next native task command")
    .option("--provider <id>", "choose openai (Chat Completions), openai-responses, anthropic, deepseek, gemini, gemini-audio, ollama (local model server), or stub (local demonstration)")
    .option("--model <model>", "your model ID; required for a real provider")
    .option("--base-url <origin>", "explicit HTTP(S) provider origin; no path or embedded credentials")
    .option("--credential <ref>", "credential reference name, never a key value")
    .option("--credentials-home <dir>", "same credential home as agent-loop run")
    .option("--credentials-file <path>", "same explicit credential file as agent-loop run")
    .option("--json", "Output local inspection status and structured next-action argv")
    .action(async (opts: Omit<NativeFirstUseOptions, "workspace" | "env" | "userEnvPath"> & { agent?: string; json?: boolean }, command: Command) => {
      const guide = await inspectNativeFirstUse({ ...opts, agentId: selectedAgentOption(command), workspace: process.cwd() });
      io.log(opts.json ? JSON.stringify(guide, null, 2) : renderNativeFirstUseGuide(guide));
      if (guide.status === "blocked") io.fail();
    });

  group
    .command("mcp-catalog")
    .description("Connect to an explicitly configured stdio or Streamable HTTP MCP server, report its catalog, and disconnect")
    .requiredOption("--config <path>", "operator-authored MCP JSON config; envRefs/headerRefs hold references, never literal credentials")
    .option("--credentials-home <dir>", "credential home used to resolve explicit server credential references")
    .option("--credentials-file <path>", "explicit credential file used to resolve server credential references")
    .option("--json", "Output the discovered catalog and exact generated allowlist names")
    .option("--authorize", "interactively authorize an OAuth (auth.kind oauth2) HTTP server: prints the authorization URL, stores the grant, then reads the catalog")
    .action(async (opts: { config: string; credentialsHome?: string; credentialsFile?: string; json?: boolean; authorize?: boolean }) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.on("SIGINT", cancel);
      try {
        const { authorizeNativeMcpCatalog, loadNativeMcpConfiguration, resolveNativeMcpServer } = await import("./setup/nativeMcpConfig.js");
        const { discoverNativeMcpCatalog, nativeMcpToolName } = await import("./mcp/nativeMcpClient.js");
        const loaded = loadNativeMcpConfiguration(opts.config);
        const workspace = process.cwd();
        const { server, catalog } = opts.authorize
          // The URL goes to stderr so --json output stays parseable; no browser is opened.
          ? await authorizeNativeMcpCatalog(loaded.config, { ...opts, workspace, signal: controller.signal,
            onAuthorizationUrl: url => io.error(`Open this URL in a browser to authorize AMC for this MCP server:\n${url}`) })
          : await (async () => {
            const resolved = await resolveNativeMcpServer(loaded.config, { ...opts, workspace });
            return { server: resolved, catalog: await discoverNativeMcpCatalog(resolved, workspace, controller.signal) };
          })();
        const receipt = {
          schemaVersion: 1, serverStarted: true, configSha256: loaded.sha256,
          ...catalog,
          auth: server.transport === "streamable-http" ? server.auth ?? null : null,
          allowlistNames: catalog.tools.map(tool => ({ remoteName: tool.name, amcToolName: nativeMcpToolName(catalog.serverId, tool.name) })),
          grantsCreated: false,
          next: "Review every tool schema. Pin digest as expectedCatalogDigest, add explicit name/actionClass grants, and separately review and sign matching amcToolName/actionClass allowlist entries. Run requires --tools workspace and --approve-tools; no policy was changed."
        };
        if (!opts.json) io.log("MCP catalog discovered; the configured server has been disposed. This command executed a local program and created no tool grants.");
        io.log(JSON.stringify(receipt, null, 2));
      } catch (error) {
        // These classes carry fixed local diagnostics only, never server or network text.
        const fixed = error instanceof NativeMcpConfigError || (error instanceof Error && ["NativeMcpHttpRefused", "NativeMcpProtocolRefused"].includes(error.name));
        io.error(fixed ? (error as Error).message : "MCP discovery failed or was cancelled. Check the explicit config and credential references; no catalog or grant is accepted.");
        io.fail();
      } finally { process.removeListener("SIGINT", cancel); }
    });
}
