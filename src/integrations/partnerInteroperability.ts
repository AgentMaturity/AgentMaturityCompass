import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { artifactSigPath, trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import {
  verifyRuntimeLifecycleGraph,
  type RuntimeLifecycleGraph,
  type RuntimeLifecycleGraphEdge,
  type RuntimeLifecycleGraphNode
} from "../runtime/lifecycleGraph.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface PartnerInteroperabilitySourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface PartnerInteroperabilityOwner {
  ownerId: string;
  team: string;
  evidenceRefs: string[];
}

export interface PartnerFieldReviewDecision {
  field: string;
  supported: boolean;
  decision: string;
  ownerId?: string | null;
}

export interface PartnerUnsupportedField {
  field: string;
  decision: string;
  ownerId: string | null;
}

export interface PartnerLifecycleGraphNodeExport {
  nodeId: string;
  kind: RuntimeLifecycleGraphNode["kind"];
  timestamp: string;
  receiptId: string | null;
  nodeHash: string;
  eventSignaturePath: string | null;
}

export interface PartnerLifecycleGraphEdgeExport {
  edgeId: string;
  kind: RuntimeLifecycleGraphEdge["kind"];
  from: string;
  to: string;
  timestamp: string;
  receiptId: string | null;
  edgeHash: string;
}

export interface PartnerLifecycleGraphExport {
  schemaVersion: "2026-06-25";
  partnerId: string;
  partnerName: string;
  amcGraphHash: string;
  runId: string;
  agentId: string;
  lifecycleRunId: string | null;
  replayHash: string;
  replayable: boolean;
  surfaceBinding: ["Fleet", "Watch", "Studio"];
  nodes: PartnerLifecycleGraphNodeExport[];
  edges: PartnerLifecycleGraphEdgeExport[];
  evidenceRefs: string[];
  exportHash: string;
}

export interface PartnerInteroperabilityRoundTrip {
  exportedHash: string;
  importedHash: string;
  equivalent: boolean;
  mismatchPaths: string[];
}

export interface PartnerInteroperabilityFixture {
  schemaVersion: "2026-06-25";
  fixtureId: string;
  partnerId: string;
  partnerName: string;
  createdAt: string;
  surfaceBinding: ["Fleet", "Watch", "Studio"];
  owner: PartnerInteroperabilityOwner;
  sourceCitations: PartnerInteroperabilitySourceCitation[];
  lifecycleGraph: {
    graphId: string;
    graphHash: string;
    graphPath: string | null;
    signaturePath: string | null;
    runId: string;
    agentId: string;
    replayHash: string;
    replayable: boolean;
  };
  partnerExport: PartnerLifecycleGraphExport;
  roundTrip: PartnerInteroperabilityRoundTrip;
  fieldReview: PartnerFieldReviewDecision[];
  unsupportedFields: PartnerUnsupportedField[];
  failClosed: boolean;
  failClosedReasons: string[];
  fixtureHash: string;
  fixturePath: string | null;
  signaturePath: string | null;
}

export interface PartnerInteroperabilityVerification {
  valid: boolean;
  failClosedReasons: string[];
}

export interface PartnerInteroperabilityWriteResult {
  fixture: PartnerInteroperabilityFixture;
  fixturePath: string;
  signaturePath: string | null;
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "partner";
}

function normalizeFieldReview(fieldReview: PartnerFieldReviewDecision[]): PartnerFieldReviewDecision[] {
  return fieldReview.map((field) => ({
    field: field.field,
    supported: field.supported,
    decision: field.decision,
    ownerId: field.ownerId ?? null
  }));
}

function unsupportedFields(fieldReview: PartnerFieldReviewDecision[]): PartnerUnsupportedField[] {
  return fieldReview
    .filter((field) => !field.supported)
    .map((field) => ({
      field: field.field,
      decision: field.decision,
      ownerId: field.ownerId ?? null
    }));
}

function evidenceRefsFor(graph: RuntimeLifecycleGraph): string[] {
  return [
    graph.graphPath,
    graph.signaturePath,
    ...graph.nodes.flatMap((node) => [node.eventPath, node.eventSignaturePath, node.receiptId]),
    ...graph.edges.flatMap((edge) => [edge.receiptId, ...edge.evidenceRefs])
  ].filter((ref): ref is string => Boolean(ref));
}

function exportDigest(partnerExport: Omit<PartnerLifecycleGraphExport, "exportHash">): string {
  return sha256Hex(canonicalize(partnerExport));
}

export function exportRuntimeLifecycleGraphForPartner(input: {
  partnerId: string;
  partnerName: string;
  lifecycleGraph: RuntimeLifecycleGraph;
}): PartnerLifecycleGraphExport {
  const exportWithoutHash: Omit<PartnerLifecycleGraphExport, "exportHash"> = {
    schemaVersion: "2026-06-25",
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    amcGraphHash: input.lifecycleGraph.graphHash,
    runId: input.lifecycleGraph.runId,
    agentId: input.lifecycleGraph.agentId,
    lifecycleRunId: input.lifecycleGraph.lifecycleRunId,
    replayHash: input.lifecycleGraph.replay.replayHash,
    replayable: input.lifecycleGraph.replay.replayable,
    surfaceBinding: ["Fleet", "Watch", "Studio"],
    nodes: input.lifecycleGraph.nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      timestamp: node.timestamp,
      receiptId: node.receiptId,
      nodeHash: node.nodeHash,
      eventSignaturePath: node.eventSignaturePath
    })),
    edges: input.lifecycleGraph.edges.map((edge) => ({
      edgeId: edge.edgeId,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      timestamp: edge.timestamp,
      receiptId: edge.receiptId,
      edgeHash: edge.edgeHash
    })),
    evidenceRefs: [...new Set(evidenceRefsFor(input.lifecycleGraph))]
  };
  return { ...exportWithoutHash, exportHash: exportDigest(exportWithoutHash) };
}

function importSummary(partnerExport: PartnerLifecycleGraphExport): string {
  return sha256Hex(canonicalize({
    amcGraphHash: partnerExport.amcGraphHash,
    runId: partnerExport.runId,
    agentId: partnerExport.agentId,
    lifecycleRunId: partnerExport.lifecycleRunId,
    replayHash: partnerExport.replayHash,
    replayable: partnerExport.replayable,
    surfaceBinding: partnerExport.surfaceBinding,
    nodes: partnerExport.nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      receiptId: node.receiptId,
      nodeHash: node.nodeHash,
      eventSignaturePath: node.eventSignaturePath
    })),
    edges: partnerExport.edges.map((edge) => ({
      edgeId: edge.edgeId,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      receiptId: edge.receiptId,
      edgeHash: edge.edgeHash
    }))
  }));
}

function graphSummary(graph: RuntimeLifecycleGraph): string {
  return sha256Hex(canonicalize({
    amcGraphHash: graph.graphHash,
    runId: graph.runId,
    agentId: graph.agentId,
    lifecycleRunId: graph.lifecycleRunId,
    replayHash: graph.replay.replayHash,
    replayable: graph.replay.replayable,
    surfaceBinding: ["Fleet", "Watch", "Studio"],
    nodes: graph.nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      receiptId: node.receiptId,
      nodeHash: node.nodeHash,
      eventSignaturePath: node.eventSignaturePath
    })),
    edges: graph.edges.map((edge) => ({
      edgeId: edge.edgeId,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      receiptId: edge.receiptId,
      edgeHash: edge.edgeHash
    }))
  }));
}

function roundTripFor(graph: RuntimeLifecycleGraph, partnerExport: PartnerLifecycleGraphExport): PartnerInteroperabilityRoundTrip {
  const exportedHash = graphSummary(graph);
  const importedHash = importSummary(partnerExport);
  const mismatchPaths: string[] = [];
  if (exportedHash !== importedHash) mismatchPaths.push("lifecycleGraph");
  if (partnerExport.exportHash !== exportDigest({ ...partnerExport, exportHash: undefined } as Omit<PartnerLifecycleGraphExport, "exportHash">)) {
    mismatchPaths.push("partnerExport.exportHash");
  }
  if (!verifyRuntimeLifecycleGraph(graph).valid) {
    mismatchPaths.push("lifecycleGraph.verification");
  }
  return {
    exportedHash,
    importedHash,
    equivalent: mismatchPaths.length === 0,
    mismatchPaths
  };
}

function fixtureDigest(fixture: PartnerInteroperabilityFixture): string {
  return sha256Hex(canonicalize({
    ...fixture,
    fixtureHash: "",
    fixturePath: null,
    signaturePath: null
  }));
}

function collectFailClosedReasons(fixture: PartnerInteroperabilityFixture): string[] {
  const reasons: string[] = [];
  const requiredKinds = ["plan", "tool", "memory", "handoff", "retry", "finalization"];
  const presentKinds = new Set(fixture.partnerExport.nodes.map((node) => node.kind));
  if (!fixture.lifecycleGraph.replayable || !fixture.partnerExport.replayable) {
    reasons.push("partner-interoperability:lifecycle-graph:invalid");
  }
  for (const kind of requiredKinds) {
    if (!presentKinds.has(kind as RuntimeLifecycleGraphNode["kind"])) {
      reasons.push(`partner-interoperability:lifecycle-graph:${kind}:missing`);
    }
  }
  if (!fixture.lifecycleGraph.graphPath) reasons.push("partner-interoperability:lifecycle-graph-path:missing");
  if (!fixture.lifecycleGraph.signaturePath) reasons.push("partner-interoperability:lifecycle-graph-signature:missing");
  if (fixture.partnerExport.amcGraphHash !== fixture.lifecycleGraph.graphHash) {
    reasons.push("partner-interoperability:lifecycle-graph-hash:mismatch");
  }
  if (fixture.partnerExport.replayHash !== fixture.lifecycleGraph.replayHash) {
    reasons.push("partner-interoperability:replay-hash:mismatch");
  }
  if (fixture.partnerExport.exportHash !== exportDigest({ ...fixture.partnerExport, exportHash: undefined } as Omit<PartnerLifecycleGraphExport, "exportHash">)) {
    reasons.push("partner-interoperability:partner-export-hash:mismatch");
  }
  if (fixture.roundTrip.importedHash !== importSummary(fixture.partnerExport)) {
    reasons.push("partner-interoperability:round-trip-import-hash:mismatch");
  }
  if (fixture.partnerExport.nodes.some((node) => !node.eventSignaturePath)) {
    reasons.push("partner-interoperability:node-signature:missing");
  }
  if (fixture.partnerExport.edges.some((edge) => !edge.timestamp)) {
    reasons.push("partner-interoperability:edge-timestamp:missing");
  }
  if (fixture.partnerExport.edges.some((edge) => (edge.kind === "tool_execution" || edge.kind === "handoff") && !edge.receiptId)) {
    reasons.push("partner-interoperability:tool-or-handoff-receipt:missing");
  }
  if (!fixture.fixturePath) reasons.push("partner-interoperability:fixture-path:missing");
  if (!fixture.signaturePath) reasons.push("partner-interoperability:fixture-signature:missing");
  if (fixture.sourceCitations.length === 0) reasons.push("partner-interoperability:source-citation:missing");
  if (!fixture.owner.ownerId || !fixture.owner.team || fixture.owner.evidenceRefs.length === 0) {
    reasons.push("partner-interoperability:owner-evidence:missing");
  }
  if (fixture.fieldReview.length === 0) reasons.push("partner-interoperability:field-review:missing");
  for (const field of fixture.unsupportedFields) {
    if (!field.decision || !field.ownerId) {
      reasons.push(`partner-interoperability:unsupported-field:${field.field}:owner-or-decision:missing`);
    }
  }
  if (!fixture.roundTrip.equivalent || fixture.roundTrip.mismatchPaths.length > 0) {
    reasons.push("partner-interoperability:round-trip:failed");
  }
  const expectedFixtureHash = fixtureDigest(fixture);
  if (fixture.fixtureHash !== expectedFixtureHash) {
    reasons.push("partner-interoperability:fixture-hash:mismatch");
  }
  if (fixture.failClosed && reasons.length === 0) {
    reasons.push("partner-interoperability:fail-closed:mismatch");
  }
  if (!fixture.failClosed && reasons.length > 0) {
    reasons.push("partner-interoperability:fail-open:invalid");
  }
  return [...new Set(reasons)];
}

export function buildPartnerInteroperabilityFixture(input: {
  partnerId: string;
  partnerName: string;
  lifecycleGraph: RuntimeLifecycleGraph;
  owner: PartnerInteroperabilityOwner;
  partnerFieldReview: PartnerFieldReviewDecision[];
  sourceCitations?: PartnerInteroperabilitySourceCitation[];
  createdAt?: string;
}): PartnerInteroperabilityFixture {
  const partnerExport = exportRuntimeLifecycleGraphForPartner({
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    lifecycleGraph: input.lifecycleGraph
  });
  const fieldReview = normalizeFieldReview(input.partnerFieldReview);
  const baseFixture: PartnerInteroperabilityFixture = {
    schemaVersion: "2026-06-25",
    fixtureId: `pif_${randomUUID().replace(/-/g, "")}`,
    partnerId: input.partnerId,
    partnerName: input.partnerName,
    createdAt: input.createdAt ?? new Date().toISOString(),
    surfaceBinding: ["Fleet", "Watch", "Studio"],
    owner: input.owner,
    sourceCitations: input.sourceCitations ?? [],
    lifecycleGraph: {
      graphId: input.lifecycleGraph.graphId,
      graphHash: input.lifecycleGraph.graphHash,
      graphPath: input.lifecycleGraph.graphPath,
      signaturePath: input.lifecycleGraph.signaturePath,
      runId: input.lifecycleGraph.runId,
      agentId: input.lifecycleGraph.agentId,
      replayHash: input.lifecycleGraph.replay.replayHash,
      replayable: input.lifecycleGraph.replay.replayable
    },
    partnerExport,
    roundTrip: roundTripFor(input.lifecycleGraph, partnerExport),
    fieldReview,
    unsupportedFields: unsupportedFields(fieldReview),
    failClosed: false,
    failClosedReasons: [],
    fixtureHash: "",
    fixturePath: null,
    signaturePath: null
  };
  const withHash = { ...baseFixture, fixtureHash: fixtureDigest(baseFixture) };
  const reasons = collectFailClosedReasons(withHash);
  const failClosed = reasons.length > 0;
  const withStatus = {
    ...withHash,
    failClosed,
    failClosedReasons: reasons.filter((reason) => reason !== "partner-interoperability:fail-open:invalid")
  };
  return { ...withStatus, fixtureHash: fixtureDigest(withStatus) };
}

export function partnerInteroperabilityFixturePath(workspace: string, partnerId: string, runId: string): string {
  return join(resolve(workspace), ".amc", "integrations", "partner-fixtures", `${safeIdPart(partnerId)}-${safeIdPart(runId)}.json`);
}

export function writePartnerInteroperabilityFixture(input: {
  workspace: string;
  partnerId: string;
  partnerName: string;
  lifecycleGraph: RuntimeLifecycleGraph;
  owner: PartnerInteroperabilityOwner;
  partnerFieldReview: PartnerFieldReviewDecision[];
  sourceCitations?: PartnerInteroperabilitySourceCitation[];
  createdAt?: string;
}): PartnerInteroperabilityWriteResult {
  const fixture = buildPartnerInteroperabilityFixture(input);
  const fixturePath = partnerInteroperabilityFixturePath(input.workspace, fixture.partnerId, fixture.lifecycleGraph.runId);
  const signaturePath = artifactSigPath(fixturePath);
  const writableFixtureWithoutHash: PartnerInteroperabilityFixture = {
    ...fixture,
    failClosed: false,
    failClosedReasons: [],
    fixtureHash: "",
    fixturePath,
    signaturePath
  };
  const writableFixture = {
    ...writableFixtureWithoutHash,
    fixtureHash: fixtureDigest(writableFixtureWithoutHash)
  };
  const reasons = collectFailClosedReasons(writableFixture);
  const finalFixtureWithoutHash: PartnerInteroperabilityFixture = {
    ...writableFixtureWithoutHash,
    failClosed: reasons.length > 0,
    failClosedReasons: reasons.filter((reason) => reason !== "partner-interoperability:fail-open:invalid"),
    fixtureHash: ""
  };
  const finalFixture: PartnerInteroperabilityFixture = {
    ...finalFixtureWithoutHash,
    fixtureHash: fixtureDigest(finalFixtureWithoutHash)
  };
  writeFileAtomic(fixturePath, `${JSON.stringify(finalFixture, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path: fixturePath, artifactKind: "partner-interoperability-fixture" });
  return {
    fixture: finalFixture,
    fixturePath,
    signaturePath: signed?.sigPath ?? null
  };
}

export function verifyPartnerInteroperabilityFixture(fixture: PartnerInteroperabilityFixture): PartnerInteroperabilityVerification {
  const reasons = collectFailClosedReasons(fixture);
  const unique = [...new Set(reasons)];
  return {
    valid: unique.length === 0 && !fixture.failClosed,
    failClosedReasons: unique
  };
}

export function renderPartnerInteroperabilityFixtureAuditExport(fixture: PartnerInteroperabilityFixture): string {
  const verification = verifyPartnerInteroperabilityFixture(fixture);
  const status = verification.valid ? "ROUND_TRIP_PASS" : "FAIL_CLOSED";
  const lines = [
    "# AMC Partner Interoperability Fixture",
    "",
    `- Fixture: ${fixture.fixtureId}`,
    `- Partner: ${fixture.partnerName} (${fixture.partnerId})`,
    `- Status: ${status}`,
    `- Surfaces: ${fixture.surfaceBinding.join(", ")}`,
    `- Owner: ${fixture.owner.team} / ${fixture.owner.ownerId}`,
    `- Run: ${fixture.lifecycleGraph.runId}`,
    `- Agent: ${fixture.lifecycleGraph.agentId}`,
    `- Graph hash: ${fixture.lifecycleGraph.graphHash}`,
    `- Replay hash: ${fixture.lifecycleGraph.replayHash}`,
    `- Export hash: ${fixture.partnerExport.exportHash}`,
    `- Round-trip exported hash: ${fixture.roundTrip.exportedHash}`,
    `- Round-trip imported hash: ${fixture.roundTrip.importedHash}`,
    "",
    "## Unsupported Fields",
    ...(fixture.unsupportedFields.length
      ? fixture.unsupportedFields.map((field) => `- ${field.field}: ${field.decision} owner=${field.ownerId ?? "unassigned"}`)
      : ["- None recorded"]),
    "",
    "## Verification",
    verification.valid ? "- VALID" : `- FAIL_CLOSED: ${verification.failClosedReasons.join("; ")}`
  ];
  return `${lines.join("\n")}\n`;
}
