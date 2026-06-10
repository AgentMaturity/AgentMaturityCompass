import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson, queryParam } from "./apiHelpers.js";
import {
  evaluateRuntimeFirewall,
  exportRuntimeFirewallDecisions,
  listRuntimeFirewallDecisions,
  runtimeFirewallStatus,
  writeRuntimeFirewallPolicy,
  type RuntimeFirewallDirection,
  type RuntimeFirewallMode
} from "../runtime/firewall.js";

function parseMode(mode: unknown): RuntimeFirewallMode {
  if (mode === "observe" || mode === "warn" || mode === "block") {
    return mode;
  }
  throw new Error("mode must be observe, warn, or block");
}

function parseDirection(direction: unknown): RuntimeFirewallDirection {
  if (direction === "request" || direction === "response") {
    return direction;
  }
  throw new Error("direction must be request or response");
}

function parseFormat(format: unknown): "json" | "jsonl" | "splunk" {
  if (format === "json" || format === "jsonl" || format === "splunk") {
    return format;
  }
  throw new Error("format must be json, jsonl, or splunk");
}

function numericLimit(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function exportPath(workspace: string, requested: unknown, format: "json" | "jsonl" | "splunk"): string {
  const root = resolve(workspace);
  const ext = format === "json" ? "json" : "jsonl";
  const raw = typeof requested === "string" && requested.trim().length > 0
    ? requested.trim()
    : `.amc/firewall/runtime-firewall.${ext}`;
  const out = resolve(root, raw);
  if (out !== root && !out.startsWith(`${root}/`)) {
    throw new Error("export path must stay inside the workspace");
  }
  return out;
}

export async function handleFirewallRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/firewall")) return false;

  if (pathname === "/api/v1/firewall/status" && method === "GET") {
    apiSuccess(res, runtimeFirewallStatus(workspace));
    return true;
  }

  if (pathname === "/api/v1/firewall/enable" && method === "POST") {
    try {
      const body = await bodyJson<{
        mode?: RuntimeFirewallMode;
        enabled?: boolean;
        failClosedOnMissingPolicy?: boolean;
      }>(req);
      const out = writeRuntimeFirewallPolicy({
        workspace,
        mode: parseMode(body.mode ?? "warn"),
        enabled: body.enabled ?? true,
        failClosedOnMissingPolicy: body.failClosedOnMissingPolicy ?? true
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "could not enable Runtime Firewall");
    }
    return true;
  }

  if (pathname === "/api/v1/firewall/check" && method === "POST") {
    try {
      const body = await bodyJson<{
        text?: string;
        content?: string;
        direction?: RuntimeFirewallDirection;
        agentId?: string;
        provider?: string;
        model?: string;
        route?: string;
        method?: string;
        runId?: string;
        episodeId?: string;
        lifecycleRunId?: string;
        bridgeRequestId?: string;
        requirePolicy?: boolean;
        record?: boolean;
      }>(req);
      const content = typeof body.content === "string" ? body.content : typeof body.text === "string" ? body.text : "";
      if (!content.trim()) {
        apiError(res, 400, "content or text is required");
        return true;
      }
      const decision = evaluateRuntimeFirewall({
        workspace,
        content,
        direction: parseDirection(body.direction ?? "request"),
        source: "api",
        agentId: body.agentId,
        provider: body.provider,
        model: body.model,
        route: body.route,
        method: body.method,
        runId: body.runId,
        episodeId: body.episodeId,
        lifecycleRunId: body.lifecycleRunId,
        bridgeRequestId: body.bridgeRequestId,
        requirePolicy: body.requirePolicy,
        record: body.record
      });
      apiSuccess(res, decision, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "could not evaluate Runtime Firewall");
    }
    return true;
  }

  if (pathname === "/api/v1/firewall/events" && method === "GET") {
    try {
      const limit = numericLimit(queryParam(req.url ?? "", "limit"), 25);
      const redacted = queryParam(req.url ?? "", "redacted") !== "false";
      const events = listRuntimeFirewallDecisions({ workspace, limit, redacted });
      apiSuccess(res, { events, total: events.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "could not list Runtime Firewall decisions");
    }
    return true;
  }

  if (pathname === "/api/v1/firewall/export" && method === "POST") {
    try {
      const body = await bodyJson<{
        outputPath?: string;
        format?: "json" | "jsonl" | "splunk";
        redacted?: boolean;
        limit?: number;
      }>(req);
      const format = parseFormat(body.format ?? "jsonl");
      const out = exportRuntimeFirewallDecisions({
        workspace,
        outputPath: exportPath(workspace, body.outputPath, format),
        format,
        redacted: body.redacted ?? true,
        limit: numericLimit(body.limit, 100)
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "could not export Runtime Firewall decisions");
    }
    return true;
  }

  apiError(res, 404, `Firewall route not found: ${method} ${pathname}`);
  return true;
}
