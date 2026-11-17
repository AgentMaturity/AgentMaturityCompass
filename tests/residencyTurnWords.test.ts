/**
 * 2026-11-17: with an active plan and a registry that declares storage but no model provider destination, a session opened
 * and its first turn failed; Studio said only "The native turn did not complete cleanly". The refusal's fixed codes now
 * travel from the recorded failure to Studio, which says which kind of destination was refused, why and the next step.
 */
import { describe, expect, test } from "vitest";
import { nativeFailureGuidance, projectNativeRunDiagnostics, renderNativeRunDiagnostics } from "../src/agent/nativeFailureGuidance.js";
import { residencyRefusalWords, residencyRouteWords } from "../src/residency/admissionWords.js";
import { AMCNativeRefusedError } from "../src/sdk/nativeAgentErrors.js";
import { isResidencyTurnWords, nativeTurnFailureWords } from "../src/studio/nativeResidency.js";
import type { EvidenceEvent } from "../src/types.js";

const sid = "residency-turn-session";
const row = (id: string, type: EvidenceEvent["event_type"], meta: Record<string, unknown>): EvidenceEvent =>
  ({ id, session_id: sid, event_type: type, meta_json: JSON.stringify(meta) }) as EvidenceEvent;
const header = row("h1", "request/header", { providerId: "stub", model: "m", params: {}, encoderId: "e", encoderVersion: 1, systemPromptEventId: "p",
  toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: "m1", projectionDigest: "d", sourceEventIds: ["p"], requestDigest: "digest-h1" });
const failed = (residency: unknown) => row("f1", "request/failure", { headerEventId: "h1", requestDigest: "digest-h1", providerId: "stub", outcome: "failed",
  turn: 1, step: 1, finishReason: "error", residency,
  failure: { code: "AMC_RESIDENCY_EGRESS_BLOCKED", message: "Residency egress blocked: destination_unregistered; destination=private-host; rules=private-rule" } });

describe("a residency refusal of a model request, from the record to Studio's words", () => {
  test("the run diagnostics carry the recorded codes and the provider channel, with guidance, never the message", () => {
    const [diagnostic] = projectNativeRunDiagnostics([header, failed({ reason: "destination_unregistered", detail: "destination_unregistered" })], sid);
    expect(diagnostic).toMatchObject({ guidance: { code: "AMC_RESIDENCY_EGRESS_BLOCKED" },
      residency: { reason: "destination_unregistered", detail: "destination_unregistered", channel: "provider" } });
    expect(nativeFailureGuidance("AMC_RESIDENCY_EGRESS_BLOCKED").nextAction).toContain("amc residency status");
    const report = renderNativeRunDiagnostics([diagnostic]);
    expect(report).toContain("residency: destination_unregistered; destination_unregistered; channel provider");
    expect(report).not.toMatch(/private/);
    // A code that is not fixed-code shaped is never carried.
    expect(projectNativeRunDiagnostics([header, failed({ reason: "x/../etc", detail: "destination_unregistered" })], sid)[0]!.residency).toBeUndefined();
  });

  test("the words name the kind of destination, why and the next step; storage admission's words are unchanged", () => {
    expect(residencyRouteWords("provider", "destination_unregistered", "destination_unregistered")).toBe("AMC's residency check refused a model provider "
      + "request before it was sent: the destination registry declares no model provider destination for that address. An owner declares that model "
      + "provider destination, with its host and region, in the destination registry and signs it with: amc residency init --file <registry.yaml>. "
      + "Run amc residency status in the workspace folder to see what the registry declares (docs/OPS_HARDENING.md, Residency routing).");
    expect(residencyRouteWords("network-tool", "region_unknown", "region_unknown")).toContain("a tool network request before it was sent: the tool network destination in the registry has no declared region");
    expect(residencyRouteWords("mcp-http", "region_not_allowed", "region_not_allowed")).toContain("an MCP server request");
    expect(residencyRouteWords("storage", "registry_unverifiable", "rules_missing")).toContain("the destination registry lists no rules");
    expect(residencyRouteWords("provider", "registry_unverifiable", "something_new")).toContain("(registry_unverifiable, something_new)");
    expect(residencyRefusalWords("destination_unregistered", "destination_unregistered")).toContain("declares no destination for the storage URL");
  });

  test("Studio turns the ACP error data into words, and keeps the generic sentence for anything else", () => {
    const refusal = (data: unknown) => new AMCNativeRefusedError(-32603, "the turn did not complete", data);
    const words = nativeTurnFailureWords(refusal({ failureCodes: ["AMC_RESIDENCY_EGRESS_BLOCKED"],
      residency: { code: "AMC_RESIDENCY_EGRESS_BLOCKED", reason: "destination_unregistered", detail: "destination_unregistered", channel: "provider" } }));
    expect(words).toMatch(/^AMC's residency check refused a model provider request before it was sent: .+ amc residency init --file .+ No automatic retry was sent\.$/);
    expect(isResidencyTurnWords(words)).toBe(true);
    expect(isResidencyTurnWords("The native turn did not complete cleanly.")).toBe(false);
    const unclean = "The native turn did not complete cleanly. Inspect committed evidence; no automatic retry was sent.";
    expect(nativeTurnFailureWords(refusal({ failureCodes: ["AMC_NATIVE_BUDGET_REFUSED"] }))).toBe(unclean);
    expect(nativeTurnFailureWords(refusal({ residency: { code: "AMC_RESIDENCY_EGRESS_BLOCKED", reason: "a", detail: "b", channel: "elsewhere" } }))).toBe(unclean);
    expect(nativeTurnFailureWords(new Error("Residency egress blocked"))).toBe(unclean);
  });
});
