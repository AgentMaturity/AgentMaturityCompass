import type { ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { canonicalize } from "../utils/json.js";

export interface OrgSseEvent {
  type:
    | "ORG_SCORECARD_UPDATED"
    | "ORG_RUN_CREATED"
    | "AGENT_RUN_COMPLETED"
    | "ASSURANCE_RUN_COMPLETED"
    | "OUTCOMES_UPDATED"
    | "INCIDENT_CREATED"
    | "FREEZE_APPLIED"
    | "FREEZE_LIFTED"
    | "POLICY_PACK_APPLIED"
    | "BENCHMARK_INGESTED"
    | "FEDERATION_IMPORTED"
    | "TRANSFORM_PLAN_CREATED"
    | "TRANSFORM_PLAN_UPDATED"
    | "TRANSFORM_TASK_ATTESTED"
    | "PLUGIN_INSTALL_REQUESTED"
    | "PLUGIN_INSTALLED"
    | "PLUGIN_UPGRADED"
    | "PLUGIN_REMOVED"
    | "PLUGIN_INTEGRITY_BROKEN"
    | "BENCH_CREATED"
    | "BENCH_PUBLISHED"
    | "BENCH_IMPORTED"
    | "BENCH_COMPARISON_UPDATED"
    | "BENCH_REGISTRY_UPDATED"
    | "FORECAST_UPDATED"
    | "ADVISORY_CREATED"
    | "ADVISORY_ACKNOWLEDGED"
    | "DRIFT_DETECTED"
    | "ANOMALY_DETECTED"
    | "PROMPT_PACK_UPDATED"
    | "PROMPT_POLICY_UPDATED"
    | "CGX_GRAPH_UPDATED"
    | "CGX_PACK_UPDATED"
    | "MECHANIC_TARGETS_UPDATED"
    | "MECHANIC_PLAN_UPDATED"
    | "MECHANIC_SIMULATION_UPDATED"
    | "MECHANIC_EXECUTION_STARTED"
    | "MECHANIC_EXECUTION_COMPLETED"
    | "MECHANIC_EXECUTION_FAILED"
    | "ASSURANCE_RUN_UPDATED"
    | "ASSURANCE_CERT_UPDATED"
    | "ASSURANCE_THRESHOLD_BREACH"
    | "VALUE_UPDATED"
    | "VALUE_REGRESSION_DETECTED"
    | "VALUE_EVIDENCE_INSUFFICIENT"
    | "AUDIT_BINDER_UPDATED"
    | "AUDIT_EVIDENCE_REQUEST_UPDATED"
    | "PASSPORT_UPDATED"
    | "STANDARD_UPDATED";
  nodeIds: string[];
  ts: number;
  summaryHash: string;
  version: number;
}

function toEventPayload(input: Omit<OrgSseEvent, "summaryHash">): OrgSseEvent {
  const summaryHash = createHash("sha256").update(canonicalize(input)).digest("hex");
  return {
    ...input,
    summaryHash
  };
}

function writeEvent(res: ServerResponse, event: OrgSseEvent): void {
  res.write(`id: ${event.summaryHash}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export class OrgSseHub {
  private clients = new Set<ServerResponse>();

  addClient(res: ServerResponse): void {
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders?.();
    res.write("retry: 15000\n");
    res.write(": connected\n\n");
    this.clients.add(res);

    const cleanup = (): void => {
      this.clients.delete(res);
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
  }

  emit(event: Omit<OrgSseEvent, "summaryHash">): OrgSseEvent {
    const payload = toEventPayload(event);
    for (const client of this.clients) {
      try {
        writeEvent(client, payload);
      } catch {
        this.clients.delete(client);
      }
    }
    return payload;
  }

  close(): void {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // noop
      }
    }
    this.clients.clear();
  }

  size(): number {
    return this.clients.size;
  }
}
