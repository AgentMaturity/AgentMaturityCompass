import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { noCodeAdapterAddCli } from "../src/integrations/noCodeGovernanceCli.js";
import {
  loadNoCodeGovernanceConfig,
  verifyNoCodeGovernanceConfigSignature
} from "../src/integrations/noCodeGovernanceStore.js";
import {
  ingestNoCodeWebhookEvent,
  parseNoCodeExecutionEvent
} from "../src/integrations/noCodeWebhookAdapters.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-nocode-bridge-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("no-code webhook parser", () => {
  test("parses n8n runData into normalized actions", () => {
    const parsed = parseNoCodeExecutionEvent({
      platform: "n8n",
      payload: {
        workflowId: "wf-101",
        workflowName: "Nightly Sync",
        executionId: "exec-501",
        status: "success",
        agentId: "ops-agent",
        data: {
          resultData: {
            runData: {
              "HTTP Request": [
                {
                  executionStatus: "success",
                  executionTime: 45,
                  data: {
                    input: { url: "https://api.example.com" },
                    output: { status: 200 }
                  }
                }
              ],
              "OpenAI Chat": [
                {
                  executionStatus: "success",
                  executionTime: 110,
                  data: {
                    input: { prompt: "summarize" },
                    output: { text: "ok" }
                  }
                }
              ]
            }
          }
        }
      }
    });

    expect(parsed.workflowId).toBe("wf-101");
    expect(parsed.executionId).toBe("exec-501");
    expect(parsed.actions).toHaveLength(2);
    expect(parsed.actions[0]?.name).toContain("HTTP Request");
    expect(parsed.actions[1]?.durationMs).toBe(110);
  });

  test("parses Make/Integromat operations", () => {
    const parsed = parseNoCodeExecutionEvent({
      platform: "make",
      payload: {
        scenario: {
          id: "scn-88",
          name: "Lead Router"
        },
        execution: {
          id: "run-91",
          status: "done"
        },
        operations: [
          {
            id: "op-1",
            module: "HTTP",
            type: "request",
            status: "success",
            durationMs: 27
          },
          {
            id: "op-2",
            module: "Airtable",
            type: "upsert",
            status: "success",
            durationMs: 32
          }
        ]
      }
    });

    expect(parsed.workflowId).toBe("scn-88");
    expect(parsed.executionId).toBe("run-91");
    expect(parsed.status).toBe("done");
    expect(parsed.actions).toHaveLength(2);
    expect(parsed.actions[1]?.name).toBe("Airtable");
  });

  test("parses Zapier steps", () => {
    const parsed = parseNoCodeExecutionEvent({
      platform: "zapier",
      payload: {
        zap_id: "zap-777",
        zap_title: "CRM Sync",
        run_id: "zr-900",
        status: "success",
        steps: [
          {
            id: "st-1",
            app: "gmail",
            event: "send_email",
            status: "success"
          }
        ]
      }
    });

    expect(parsed.workflowId).toBe("zap-777");
    expect(parsed.workflowName).toBe("CRM Sync");
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]?.type).toBe("gmail");
  });

  test("parses generic webhook payload", () => {
    const parsed = parseNoCodeExecutionEvent({
      platform: "generic",
      payload: {
        workflowId: "wf-generic",
        executionId: "ex-generic",
        status: "ok",
        actions: [
          {
            id: "a-1",
            name: "call-api",
            type: "http",
            status: "success"
          }
        ]
      }
    });

    expect(parsed.workflowId).toBe("wf-generic");
    expect(parsed.executionId).toBe("ex-generic");
    expect(parsed.actions[0]?.actionId).toBe("a-1");
  });

  test("rejects non-object webhook payload", () => {
    expect(() =>
      parseNoCodeExecutionEvent({
        platform: "n8n",
        payload: "not-an-object"
      })
    ).toThrowError(/payload must be a JSON object/i);
  });
});

describe("no-code webhook ingestion", () => {
  test("writes execution + action evidence records", () => {
    const workspace = newWorkspace();
    const result = ingestNoCodeWebhookEvent({
      workspace,
      platform: "n8n",
      payload: {
        workflowId: "wf-900",
        workflowName: "Invoice Bot",
        executionId: "ex-900",
        status: "success",
        actions: [
          { id: "step-1", name: "fetch", type: "http", status: "success" },
          { id: "step-2", name: "write", type: "db", status: "success" }
        ]
      }
    });

    expect(result.platform).toBe("n8n");
    expect(result.actionCount).toBe(2);
    expect(result.actionEventIds).toHaveLength(2);

    const ledger = openLedger(workspace);
    try {
      const events = ledger.getAllEvents();
      const execution = events.filter((event) => {
        const meta = parseMeta(event.meta_json);
        return meta.auditType === "NO_CODE_EXECUTION_INGESTED";
      });
      const actions = events.filter((event) => {
        const meta = parseMeta(event.meta_json);
        return meta.auditType === "NO_CODE_ACTION_CAPTURED";
      });

      expect(execution).toHaveLength(1);
      expect(actions).toHaveLength(2);
      expect(actions.every((event) => event.event_type === "tool_action")).toBe(true);
    } finally {
      ledger.close();
    }
  });

  test("captures execution evidence even when action list is empty", () => {
    const workspace = newWorkspace();
    const result = ingestNoCodeWebhookEvent({
      workspace,
      platform: "generic",
      payload: {
        workflowId: "wf-empty",
        executionId: "ex-empty",
        status: "success",
        actions: []
      }
    });

    expect(result.actionCount).toBe(0);

    const ledger = openLedger(workspace);
    try {
      const executionEvents = ledger
        .getAllEvents()
        .filter((event) => parseMeta(event.meta_json).auditType === "NO_CODE_EXECUTION_INGESTED");
      expect(executionEvents).toHaveLength(1);
    } finally {
      ledger.close();
    }
  });
});

describe("no-code adapter cli", () => {
  test("adds adapter config and signs it", () => {
    const workspace = newWorkspace();
    const out = noCodeAdapterAddCli({
      workspace,
      type: "n8n",
      webhookUrl: "https://hooks.example.com/n8n/executions"
    });

    expect(out.created).toBe(true);
    expect(out.adapter.type).toBe("n8n");

    const cfg = loadNoCodeGovernanceConfig(workspace);
    expect(cfg.noCodeAdapters.adapters).toHaveLength(1);
    expect(cfg.noCodeAdapters.adapters[0]?.webhookUrl).toBe("https://hooks.example.com/n8n/executions");

    const verified = verifyNoCodeGovernanceConfigSignature(workspace);
    expect(verified.valid).toBe(true);
  });

  test("re-adding same adapter is idempotent and does not duplicate entries", () => {
    const workspace = newWorkspace();
    const first = noCodeAdapterAddCli({
      workspace,
      type: "zapier",
      webhookUrl: "https://hooks.example.com/zapier/run/"
    });
    const second = noCodeAdapterAddCli({
      workspace,
      type: "zapier",
      webhookUrl: "https://hooks.example.com/zapier/run/#fragment"
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const cfg = loadNoCodeGovernanceConfig(workspace);
    expect(cfg.noCodeAdapters.adapters).toHaveLength(1);
    expect(cfg.noCodeAdapters.adapters[0]?.id).toBe(first.adapter.id);
  });
});
