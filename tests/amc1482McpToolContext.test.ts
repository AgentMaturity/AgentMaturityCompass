import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../src/workspace.js";
import {
  initToolsConfig,
  loadToolsConfig,
  signToolsConfig,
  toolsConfigPath
} from "../src/toolhub/toolhubValidators.js";
import {
  inspectToolhubContext,
  requireTrustedToolhubContext
} from "../src/toolhub/toolContext.js";
import { formatToolhubContextText } from "../src/toolhub/toolhubCli.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { cgxBuildCli } from "../src/cgx/cgxCli.js";
import { cgxLatestGraphPath } from "../src/cgx/cgxStore.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1482-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1482-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function addMcpTools(workspace: string): void {
  const config = loadToolsConfig(workspace);
  config.tools.allowedTools.push(
    {
      name: "github.search",
      actionClass: "READ_ONLY",
      context: {
        kind: "mcp",
        server: {
          id: "com.example.github",
          name: "GitHub MCP",
          version: "1.4.0",
          transport: "streamable-http"
        }
      }
    },
    {
      name: "github.create_issue",
      actionClass: "WRITE_LOW",
      requireExecTicket: true,
      context: {
        kind: "mcp",
        server: {
          id: "com.example.github",
          name: "GitHub MCP",
          version: "1.4.0",
          transport: "streamable-http"
        }
      }
    },
    {
      name: "docs.lookup",
      actionClass: "READ_ONLY",
      context: {
        kind: "mcp",
        server: {
          id: "com.example.docs",
          name: "Docs MCP",
          transport: "stdio"
        }
      }
    }
  );
  initToolsConfig(workspace, config);
}

function fileSnapshot(root: string): string[] {
  const rows: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort((a, b) => a.localeCompare(b))) {
      const path = join(directory, name);
      const stats = statSync(path);
      const key = relative(root, path);
      if (stats.isDirectory()) {
        rows.push(`d:${key}`);
        visit(path);
      } else {
        rows.push(`f:${key}:${stats.size}:${stats.mtimeMs}`);
      }
    }
  };
  visit(root);
  return rows;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") throw new Error("failed to allocate port");
  return address.port;
}

async function getJson(url: string, token: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(url, {
      method: "GET",
      headers: { "x-amc-admin-token": token, connection: "close" }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolvePromise({
        status: response.statusCode ?? 0,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
      }));
    });
    request.on("error", rejectPromise);
    request.end();
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1482 fail-closed MCP server and tool context", () => {
  test("keeps v1 native configs compatible and derives a privacy-safe read-only projection", () => {
    const workspace = newWorkspace();
    const before = fileSnapshot(workspace);
    const projection = inspectToolhubContext(workspace);
    const after = fileSnapshot(workspace);

    expect(after).toEqual(before);
    expect(projection.schemaVersion).toBe("2026-07-13");
    expect(projection.integrity).toEqual({
      status: "trusted",
      signatureValid: true,
      reasonCodes: []
    });
    expect(projection.groups).toHaveLength(1);
    expect(projection.groups[0]).toMatchObject({
      kind: "native",
      label: "Native tools",
      server: null
    });
    expect(projection.tools).toHaveLength(7);
    expect(projection.tools.every((tool) => tool.kind === "native" && tool.serverIdentity === null)).toBe(true);
    expect(new Set(projection.tools.map((tool) => tool.toolIdentity)).size).toBe(projection.tools.length);
    expect(projection).toMatchObject({
      derivedView: true,
      recorded: false,
      proofEligible: false
    });
    expect(JSON.stringify(projection)).not.toContain("hostAllowlist");
    expect(JSON.stringify(projection)).not.toContain("binariesAllowlist");
    expect(projection.claimBoundary).toContain("declared context");
  });

  test("groups MCP tools by exact server identity with deterministic shared IDs", () => {
    const workspace = newWorkspace();
    addMcpTools(workspace);

    const first = requireTrustedToolhubContext(workspace);
    const second = requireTrustedToolhubContext(workspace);
    expect(second).toEqual(first);
    expect(first.groups.map((group) => group.label)).toEqual([
      "Native tools",
      "Docs MCP",
      "GitHub MCP"
    ]);

    const github = first.groups.find((group) => group.server?.id === "com.example.github");
    expect(github).toMatchObject({
      kind: "mcp-server",
      server: {
        id: "com.example.github",
        name: "GitHub MCP",
        version: "1.4.0",
        transport: "streamable-http"
      }
    });
    expect(github?.tools.map((tool) => tool.name)).toEqual(["github.create_issue", "github.search"]);
    expect(github?.tools.every((tool) => tool.serverIdentity === github.server?.serverIdentity)).toBe(true);
    expect(formatToolhubContextText(first)).toContain("MCP server: GitHub MCP");
    expect(formatToolhubContextText(first)).toContain("github.create_issue");

    const serviceProjection = new ToolHubService(workspace).listToolContext();
    expect(serviceProjection).toEqual(first);
    expect(new ToolHubService(workspace).listTools()).toEqual(first.tools);
  });

  test("uses the same identities in Studio and the CGX provider graph", async () => {
    const workspace = newWorkspace();
    addMcpTools(workspace);
    const expected = requireTrustedToolhubContext(workspace);

    const port = await freePort();
    const token = "amc-1482-admin";
    const studio = await startStudioApiServer({ workspace, host: "127.0.0.1", port, token });
    try {
      const response = await getJson(`${studio.url}/toolhub/tools`, token);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(expected);
    } finally {
      await studio.close();
    }

    cgxBuildCli({ workspace, scope: "workspace" });
    const graph = JSON.parse(readFileSync(cgxLatestGraphPath(workspace, {
      type: "workspace",
      id: "workspace"
    }), "utf8")) as {
      nodes: Array<{ id: string; type: string; label: string }>;
      edges: Array<{ type: string; from: string; to: string }>;
    };
    const githubGroup = expected.groups.find((group) => group.server?.id === "com.example.github");
    expect(graph.nodes).toContainEqual(expect.objectContaining({
      id: githubGroup?.server?.serverIdentity,
      type: "MCPServer",
      label: "GitHub MCP"
    }));
    for (const tool of githubGroup?.tools ?? []) {
      expect(graph.nodes).toContainEqual(expect.objectContaining({ id: tool.toolIdentity, type: "Tool" }));
      expect(graph.edges).toContainEqual(expect.objectContaining({
        type: "PROVIDES",
        from: githubGroup?.server?.serverIdentity,
        to: tool.toolIdentity
      }));
    }
  });

  test("fails closed with zero rows for tamper and malformed MCP declarations", () => {
    const tampered = newWorkspace();
    addMcpTools(tampered);
    writeFileSync(toolsConfigPath(tampered), `${readFileSync(toolsConfigPath(tampered), "utf8")}\n# tamper\n`);
    const tamperedProjection = inspectToolhubContext(tampered);
    expect(tamperedProjection.tools).toEqual([]);
    expect(tamperedProjection.groups).toEqual([]);
    expect(tamperedProjection.integrity).toEqual({
      status: "untrusted",
      signatureValid: false,
      reasonCodes: ["TOOL_CONTEXT_SIGNATURE_INVALID"]
    });
    expect(() => requireTrustedToolhubContext(tampered)).toThrow("TOOL_CONTEXT_SIGNATURE_INVALID");
    expect(() => cgxBuildCli({ workspace: tampered, scope: "workspace" })).toThrow("TOOL_CONTEXT_SIGNATURE_INVALID");

    const malformed = newWorkspace();
    const malformedText = readFileSync(toolsConfigPath(malformed), "utf8").replace(
      "    actionClass: READ_ONLY",
      "    actionClass: READ_ONLY\n    context:\n      kind: mcp"
    );
    writeFileSync(toolsConfigPath(malformed), malformedText);
    signToolsConfig(malformed);
    const malformedProjection = inspectToolhubContext(malformed);
    expect(malformedProjection.tools).toEqual([]);
    expect(malformedProjection.integrity.reasonCodes).toEqual(["TOOL_CONTEXT_SCHEMA_INVALID"]);
  });

  test("fails closed for duplicate tools and conflicting metadata for one server identity", () => {
    const duplicate = newWorkspace();
    const duplicateConfig = loadToolsConfig(duplicate);
    duplicateConfig.tools.allowedTools.push({ ...duplicateConfig.tools.allowedTools[0]! });
    initToolsConfig(duplicate, duplicateConfig);
    expect(inspectToolhubContext(duplicate)).toMatchObject({
      tools: [],
      groups: [],
      integrity: { reasonCodes: ["TOOL_CONTEXT_DUPLICATE_TOOL_NAME"] }
    });

    const conflict = newWorkspace();
    const conflictConfig = loadToolsConfig(conflict);
    conflictConfig.tools.allowedTools.push(
      {
        name: "server.read",
        actionClass: "READ_ONLY",
        context: {
          kind: "mcp",
          server: { id: "com.example.shared", name: "Server A", transport: "stdio" }
        }
      },
      {
        name: "server.write",
        actionClass: "WRITE_LOW",
        context: {
          kind: "mcp",
          server: { id: "com.example.shared", name: "Server B", transport: "stdio" }
        }
      }
    );
    initToolsConfig(conflict, conflictConfig);
    expect(inspectToolhubContext(conflict)).toMatchObject({
      tools: [],
      groups: [],
      integrity: { reasonCodes: ["TOOL_CONTEXT_SERVER_METADATA_CONFLICT"] }
    });
  });

  test("keeps CLI, OpenAPI, Studio, and docs on the same bounded projection", () => {
    const generated = generateFullOpenApiSpec() as any;
    const studioRoute = generated.paths["/toolhub/tools"];
    expect(studioRoute?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/ToolContextProjection"
    );
    expect(generated.components.schemas.ToolContextProjection.properties.schemaVersion.const).toBe("2026-07-13");

    const published = YAML.parse(readFileSync(resolve(process.cwd(), "website/openapi.yaml"), "utf8")) as any;
    expect(published.paths["/v1/tools/list"].get.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/ToolContextApiResponse"
    );
    expect(published.components.schemas.ToolContextProjection.properties.schemaVersion.enum).toEqual(["2026-07-13"]);

    const cli = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
    const studio = readFileSync(resolve(process.cwd(), "src/console/assets/app.js"), "utf8");
    const toolhub = readFileSync(resolve(process.cwd(), "docs/TOOLHUB.md"), "utf8");
    const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
    expect(cli).toContain("emit the complete tool context projection as JSON");
    expect(studio).toContain("renderToolContext(toolContext)");
    expect(studio).not.toContain('JSON.stringify(tools, null, 2)');
    expect(toolhub).toContain("context.kind: mcp");
    expect(toolhub).toContain("proofEligible: false");
    expect(readme).toContain("amc tools list --json");

    for (const file of [
      "src/toolhub/toolContext.ts",
      "src/toolhub/toolsSchema.ts",
      "src/cgx/cgxBuilder.ts",
      "src/console/assets/app.js"
    ]) {
      const body = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(body).not.toMatch(/AgentApprove|agent-event-protocol|AEP schema/i);
    }
  });
});
