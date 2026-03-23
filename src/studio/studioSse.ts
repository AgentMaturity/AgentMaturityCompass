/**
 * Studio SSE Endpoints — Gap 6
 *
 * Server-Sent Events for real-time dashboard updates.
 * Streams monitoring events, score updates, alerts, trace summaries,
 * and cost data to the Studio frontend over persistent HTTP connections.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { MonitoringEvent } from "../watch/continuousMonitor.js";
import type { NormalizedTrace } from "../watch/observabilityBridge.js";
import type { RealtimeAssuranceResult, RealtimeAssuranceViolation } from "../watch/realtimeAssurance.js";
import type { CostRecord } from "../observability/costTracker.js";
import type { QualityRating } from "../outcomes/qualitySignals.js";
import { randomUUID } from "node:crypto";

/* ── Types ───────────────────────────────────────────────────────── */

export type SSEEventType =
  | "trace"
  | "score"
  | "alert"
  | "violation"
  | "cost"
  | "quality"
  | "drift"
  | "anomaly"
  | "heartbeat"
  | "connected";

export interface SSEEvent {
  id: string;
  type: SSEEventType;
  data: unknown;
  ts: number;
}

export interface SSEClient {
  id: string;
  res: ServerResponse;
  agentFilter?: string;
  connectedAt: number;
  lastEventId?: string;
}

/* ── SSE Hub ─────────────────────────────────────────────────────── */

export class StudioSSEHub {
  private clients: Map<string, SSEClient> = new Map();
  private eventBuffer: SSEEvent[] = [];
  private maxBuffer = 1000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs = 15_000;

  constructor() {
    this.startHeartbeat();
  }

  /** Handle a new SSE connection */
  handleConnection(req: IncomingMessage, res: ServerResponse, agentFilter?: string): void {
    const clientId = randomUUID();
    const lastEventId = req.headers["last-event-id"] as string | undefined;

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    const client: SSEClient = { id: clientId, res, agentFilter, connectedAt: Date.now(), lastEventId };
    this.clients.set(clientId, client);

    // Send connected event
    this.sendToClient(client, {
      id: randomUUID(),
      type: "connected",
      data: { clientId, agentFilter, ts: Date.now() },
      ts: Date.now(),
    });

    // Replay missed events if Last-Event-ID provided
    if (lastEventId) {
      const missedIdx = this.eventBuffer.findIndex((e) => e.id === lastEventId);
      if (missedIdx >= 0) {
        for (const event of this.eventBuffer.slice(missedIdx + 1)) {
          if (!agentFilter || this.matchesFilter(event, agentFilter)) {
            this.sendToClient(client, event);
          }
        }
      }
    }

    // Clean up on disconnect
    req.on("close", () => {
      this.clients.delete(clientId);
    });

    res.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  /** Broadcast a trace event */
  pushTrace(trace: NormalizedTrace): void {
    this.broadcast({
      id: randomUUID(),
      type: "trace",
      data: {
        traceId: trace.traceId,
        name: trace.name,
        sessionId: trace.sessionId,
        agentId: (trace.metadata as Record<string, unknown> | undefined)?.agentId,
        status: trace.status,
        durationMs: trace.durationMs,
        totalTokens: trace.totalTokens,
        totalCostUsd: trace.totalCostUsd,
        llmCallCount: trace.llmCallCount,
        toolCallCount: trace.toolCallCount,
        errorCount: trace.errorCount,
        modelBreakdown: trace.modelBreakdown,
        startTimeMs: trace.startTimeMs,
        endTimeMs: trace.endTimeMs,
      },
      ts: Date.now(),
    });
  }

  /** Broadcast a monitoring event */
  pushMonitoringEvent(event: MonitoringEvent): void {
    this.broadcast({
      id: randomUUID(),
      type: event.type as SSEEventType,
      data: { agentId: event.agentId, ...event.data as object },
      ts: event.ts,
    });
  }

  /** Broadcast an assurance result */
  pushAssuranceResult(result: RealtimeAssuranceResult): void {
    this.broadcast({
      id: randomUUID(),
      type: "score",
      data: {
        traceId: result.traceId,
        checksRun: result.checksRun,
        violationCount: result.violations.length,
        passedCount: result.passedChecks.length,
        score: result.score,
        durationMs: result.durationMs,
      },
      ts: Date.now(),
    });

    for (const v of result.violations) {
      this.pushViolation(v);
    }
  }

  /** Broadcast a violation */
  pushViolation(violation: RealtimeAssuranceViolation): void {
    this.broadcast({
      id: randomUUID(),
      type: "violation",
      data: violation,
      ts: violation.ts,
    });
  }

  /** Broadcast a cost record */
  pushCostRecord(record: CostRecord): void {
    this.broadcast({
      id: randomUUID(),
      type: "cost",
      data: {
        traceId: record.traceId,
        agentId: record.agentId,
        model: record.model,
        costUsd: record.costUsd,
        tokens: record.totalTokens,
        durationMs: record.durationMs,
      },
      ts: record.ts,
    });
  }

  /** Broadcast a quality rating */
  pushQualityRating(rating: QualityRating): void {
    this.broadcast({
      id: randomUUID(),
      type: "quality",
      data: rating,
      ts: rating.ts,
    });
  }

  /** Get connected client count */
  getClientCount(): number {
    return this.clients.size;
  }

  /** Shutdown all connections */
  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients.values()) {
      try { client.res.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
  }

  /* ── Internal ──────────────────────────────────────────────────── */

  private broadcast(event: SSEEvent): void {
    // Buffer event
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBuffer) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBuffer);
    }

    // Send to all matching clients
    for (const client of this.clients.values()) {
      if (!client.agentFilter || this.matchesFilter(event, client.agentFilter)) {
        this.sendToClient(client, event);
      }
    }
  }

  private sendToClient(client: SSEClient, event: SSEEvent): void {
    try {
      const data = JSON.stringify(event.data);
      client.res.write(`id: ${event.id}\n`);
      client.res.write(`event: ${event.type}\n`);
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // Client disconnected — will be cleaned up
      this.clients.delete(client.id);
    }
  }

  private matchesFilter(event: SSEEvent, agentFilter: string): boolean {
    const data = event.data as Record<string, unknown> | null;
    if (!data) return true;
    const agentId = data.agentId as string | undefined;
    if (!agentId) return true;
    return agentId === agentFilter;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const heartbeat: SSEEvent = {
        id: randomUUID(),
        type: "heartbeat",
        data: { ts: Date.now(), clients: this.clients.size },
        ts: Date.now(),
      };
      for (const client of this.clients.values()) {
        this.sendToClient(client, heartbeat);
      }
    }, this.heartbeatIntervalMs);
  }
}

/** Singleton hub for the Studio server */
let globalSSEHub: StudioSSEHub | null = null;

export function getStudioSSEHub(): StudioSSEHub {
  if (!globalSSEHub) {
    globalSSEHub = new StudioSSEHub();
  }
  return globalSSEHub;
}

/**
 * Wire SSE routes into an existing HTTP request handler.
 * Call from studioServer.ts route handler.
 */
export function handleSSERoute(
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const hub = getStudioSSEHub();

  // GET /api/v1/stream — global event stream
  if (pathname === "/api/v1/stream" && req.method === "GET") {
    hub.handleConnection(req, res);
    return true;
  }

  // GET /api/v1/stream/agent/:agentId — per-agent stream
  const agentMatch = pathname.match(/^\/api\/v1\/stream\/agent\/([^/]+)$/);
  if (agentMatch && req.method === "GET") {
    hub.handleConnection(req, res, agentMatch[1]);
    return true;
  }

  // GET /api/v1/stream/costs — cost-only stream (filter on type=cost)
  if (pathname === "/api/v1/stream/costs" && req.method === "GET") {
    // Use the same hub but client-side can filter by event type
    hub.handleConnection(req, res);
    return true;
  }

  return false;
}
