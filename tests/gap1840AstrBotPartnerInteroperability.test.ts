import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import {
  appendRuntimeRunEvent,
  completeRuntimeRun,
  createRuntimeRun,
  resumeRuntimeRun
} from "../src/runtime/runManager.js";
import {
  buildRuntimeLifecycleGraph,
  writeRuntimeLifecycleGraph,
  type RuntimeLifecycleGraph,
  type RuntimeLifecycleGraphSourceCitation
} from "../src/runtime/lifecycleGraph.js";
import {
  buildPartnerInteroperabilityFixture,
  renderPartnerInteroperabilityFixtureAuditExport,
  verifyPartnerInteroperabilityFixture,
  writePartnerInteroperabilityFixture,
  type PartnerInteroperabilitySourceCitation
} from "../src/integrations/partnerInteroperability.js";

const DOC = "docs/source-reviews/GAP-1840-astrbot-partner-interoperability-fixtures.md";
const REPO = "https://github.com/AstrBotDevs/AstrBot";
const README = "https://raw.githubusercontent.com/AstrBotDevs/AstrBot/master/README.md";
const HOMEPAGE = "https://astrbot.app";
const TITLE = "AstrBot";
const IDENTIFIER = "astrbot_interoperability_fixture";
const IMPLEMENTATION_FILES = [
  "src/integrations/partnerInteroperability.ts",
  "src/integrations/index.ts",
  "src/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: Array<RuntimeLifecycleGraphSourceCitation & PartnerInteroperabilitySourceCitation> = [
  {
    sourceId: "github-astrbotdevs-astrbot",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T10:08:00.000Z"
  },
  {
    sourceId: "github-astrbotdevs-astrbot-readme",
    title: "AstrBot README",
    url: README,
    retrievedAt: "2026-06-25T10:08:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1840-partner-fixture-"));
  roots.push(dir);
  return dir;
}

function populateRuntimeRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    source: "fleet",
    stage: "plan.created",
    episodeId: "episode-partner-fixture-1",
    lifecycleRunId: "lifecycle-partner-fixture-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    source: "studio",
    type: "stage.changed",
    stage: "plan.created",
    message: "Partner workflow plan created.",
    links: { receiptId: "receipt-plan-created" },
    payload: { planId: "plan-partner-1" }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    source: "sdk",
    type: "trace.received",
    stage: "tool.call",
    message: "Tool execution recorded for partner fixture.",
    links: { receiptId: "receipt-tool-call", traceId: "trace-tool-call" },
    payload: { toolId: "message-router", outputHash: "a".repeat(64) }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    source: "sdk",
    type: "trace.received",
    stage: "memory.read",
    message: "Memory lookup recorded for partner fixture.",
    links: { receiptId: "receipt-memory-read", traceId: "trace-memory-read" },
    payload: { memoryRef: "memory-context-1" }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    source: "fleet",
    type: "stage.changed",
    stage: "handoff.operator",
    message: "Handoff to operator agent for partner review.",
    links: { receiptId: "receipt-handoff-operator", decisionId: "handoff-operator" },
    payload: { toAgentId: "operator-agent" }
  });
  resumeRuntimeRun({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    source: "watch",
    stage: "retry.delivery",
    message: "Retry after transient partner delivery timeout."
  });
  completeRuntimeRun({
    workspace: ws,
    runId: "runtime-partner-fixture-1",
    agentId: "partner-agent",
    reason: "Partner fixture run finalized."
  });
}

function metadataOnlyGraph(): RuntimeLifecycleGraph {
  return buildRuntimeLifecycleGraph({
    run: {
      schemaVersion: "2026-05-22",
      runId: "metadata-only-partner-fixture",
      agentId: "metadata-only-agent",
      episodeId: null,
      lifecycleRunId: null,
      source: "fleet",
      status: "completed",
      currentStage: "repo.metadata",
      severity: "info",
      createdAt: "2026-06-25T10:08:00.000Z",
      updatedAt: "2026-06-25T10:08:00.000Z",
      startedAt: "2026-06-25T10:08:00.000Z",
      resumedAt: null,
      completedAt: "2026-06-25T10:08:00.000Z",
      canceledAt: null,
      degradedAt: null,
      cancelReason: null,
      degradedReason: null,
      completionReason: null,
      eventCount: 0,
      alertCount: 0,
      policyDecisionCount: 0,
      receiptCount: 0,
      candidateCount: 0,
      redactedEventCount: 0,
      lastEventId: null,
      lastEventAt: null,
      resumeToken: "resume_metadata_only",
      statePath: null,
      signaturePath: null,
      eventsDir: null
    },
    events: [],
    sourceCitations
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1840 AstrBot partner interoperability fixture boundary", () => {
  it("documents the live AstrBot source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1840");
    expect(doc).toContain("Partner interoperability fixtures");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain("AGPL-3.0");
    expect(doc).toContain("AI Agent Assistant");
    expect(doc).toContain("mainstream instant messaging apps");
    expect(doc).toContain("MCP");
    expect(doc).toContain("Plugin Extensions");
    expect(doc).toContain("fixture, round-trip result, unsupported field list, and owner");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No AstrBot adapter");
  });

  it("writes a signed partner fixture with round-trip result, unsupported fields, and owner evidence", () => {
    const ws = workspace();
    populateRuntimeRun(ws);

    const graph = writeRuntimeLifecycleGraph({
      workspace: ws,
      runId: "runtime-partner-fixture-1",
      agentId: "partner-agent",
      sourceCitations
    }).graph;

    const written = writePartnerInteroperabilityFixture({
      workspace: ws,
      partnerId: "astrbot-review-signal",
      partnerName: TITLE,
      lifecycleGraph: graph,
      sourceCitations,
      owner: {
        ownerId: "rev-tech-lead",
        team: "REV_TECH_LEAD",
        evidenceRefs: ["linear-amc-gap-1840", "source-review-gap-1840"]
      },
      partnerFieldReview: [
        { field: "runId", supported: true, decision: "Mapped to AMC runtime run id." },
        { field: "agentId", supported: true, decision: "Mapped to AMC fleet agent id." },
        { field: "chat_platform_session_state", supported: false, decision: "Partner session state has no AMC-owned portable lifecycle field.", ownerId: "rev-tech-lead" },
        { field: "plugin_marketplace_manifest", supported: false, decision: "Plugin marketplace manifest is source-specific and remains outside the fixture.", ownerId: "rev-tech-lead" },
        { field: "im_platform_delivery_receipt", supported: false, decision: "Messaging delivery receipts require partner-owned proof before AMC imports them.", ownerId: "rev-tech-lead" }
      ]
    });

    expect(existsSync(written.fixturePath)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.fixture.surfaceBinding).toEqual(["Fleet", "Watch", "Studio"]);
    expect(written.fixture.lifecycleGraph.graphHash).toBe(graph.graphHash);
    expect(written.fixture.partnerExport.amcGraphHash).toBe(graph.graphHash);
    expect(written.fixture.partnerExport.replayHash).toBe(graph.replay.replayHash);
    expect(written.fixture.partnerExport.nodes.length).toBe(graph.nodes.length);
    expect(written.fixture.partnerExport.edges.length).toBe(graph.edges.length);
    expect(written.fixture.roundTrip.equivalent).toBe(true);
    expect(written.fixture.roundTrip.mismatchPaths).toHaveLength(0);
    expect(written.fixture.unsupportedFields.map((field) => field.field)).toEqual([
      "chat_platform_session_state",
      "plugin_marketplace_manifest",
      "im_platform_delivery_receipt"
    ]);
    expect(written.fixture.owner.team).toBe("REV_TECH_LEAD");
    expect(written.fixture.owner.evidenceRefs).toContain("source-review-gap-1840");

    const verification = verifyPartnerInteroperabilityFixture(written.fixture);
    expect(verification).toEqual({ valid: true, failClosedReasons: [] });
    expect(verifyArtifactFileSignature({ workspace: ws, path: written.fixturePath }).valid).toBe(true);

    const auditExport = renderPartnerInteroperabilityFixtureAuditExport(written.fixture);
    expect(auditExport).toContain("AMC Partner Interoperability Fixture");
    expect(auditExport).toContain("ROUND_TRIP_PASS");
    expect(auditExport).toContain("REV_TECH_LEAD");
    expect(auditExport).toContain("chat_platform_session_state");
  });

  it("fails closed when repository metadata replaces signed round-trip fixture evidence", () => {
    const fixture = buildPartnerInteroperabilityFixture({
      partnerId: "metadata-only-review-signal",
      partnerName: TITLE,
      lifecycleGraph: metadataOnlyGraph(),
      sourceCitations,
      owner: {
        ownerId: "rev-tech-lead",
        team: "REV_TECH_LEAD",
        evidenceRefs: []
      },
      partnerFieldReview: []
    });

    expect(fixture.failClosed).toBe(true);
    expect(fixture.roundTrip.equivalent).toBe(false);
    expect(fixture.unsupportedFields).toHaveLength(0);
    expect(verifyPartnerInteroperabilityFixture(fixture).valid).toBe(false);
    expect(fixture.failClosedReasons).toEqual(expect.arrayContaining([
      "partner-interoperability:lifecycle-graph:invalid",
      "partner-interoperability:lifecycle-graph-path:missing",
      "partner-interoperability:lifecycle-graph-signature:missing",
      "partner-interoperability:owner-evidence:missing",
      "partner-interoperability:field-review:missing",
      "partner-interoperability:round-trip:failed"
    ]));
  });

  it("does not add AstrBot-specific identifiers to generic integration or signing implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("AstrBotDevs");
    expect(combined).not.toContain("AstrBot");
    expect(combined).not.toContain("QQ");
    expect(combined).not.toContain("Telegram");
    expect(combined).not.toContain("Discord");
    expect(combined).not.toContain("1000+ plugins");
    expect(combined).not.toContain("AGPL-3.0");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
