/**
 * P1-38 derivation (ADR-016): pi-ai builds request bytes deterministically at the pinned version, so a pi request is
 * re-derived from the log and reported `reconstructed` only when the pinned library re-derives the signed digest.
 * Without the library it is `unreconstructable`, never `reconstructed`; an edited source byte fails verification.
 */
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";
import { verifyAgentRun } from "../../src/agent/runReport.js";
import { deriveSessionRequests } from "../../src/llm/request/deriveRequest.js";
import { piAiDerivationEncoders } from "../../src/llm/providers/piAi/piAiAdapter.js";
import { providerToolWireName } from "../../src/llm/request/providerToolNames.js";
import type { ToolSchema } from "../../src/llm/request/requestSpec.js";
import { chatSse, drain, piHarness } from "../helpers/fixtureProviderHarness.js";

const readTool: ToolSchema = { name: "fs.read", description: "Read a fixture file",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } };

/** A closed two-step pi session: a tool call, its result, then a text answer. */
async function closedPiSession() {
  const wireName = providerToolWireName("fs.read");
  const h = await piHarness("groq", [chatSse({ tool: { id: "call_derive_1", name: wireName, args: '{"path":"a.txt"}' } }),
    chatSse({ text: "Done." })]);
  const first = h.runtime.prepare(h.spec([readTool]));
  await drain(first.stream());
  h.session.recordToolResult({ toolCallId: "call_derive_1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "file text" });
  h.finishStep(first); h.session.startStep();
  const second = h.runtime.prepare(h.spec([readTool]));
  await drain(second.stream());
  h.finishStep(second);
  const promptId = h.session.readEvents().find((event) => event.event_type === "user/message")!.id;
  h.close();
  return { ...h, calls: [first, second], promptId };
}

describe("pi-ai request derivation (P1-38)", () => {
  test("a pi session verifies and every pi request is reconstructed from the log by the pinned library", async () => {
    const h = await closedPiSession();
    const report = await verifyAgentRun(h.root, h.session.sessionId);
    expect(report.requests.map((request) => request.status)).toEqual(["reconstructed", "reconstructed"]);
    expect(report.integrityOk).toBe(true);
    const encoders = await piAiDerivationEncoders(h.root, h.session.sessionId);
    expect(encoders?.list()).toContain("pi-ai:groq@1");
    const derived = deriveSessionRequests({ workspace: h.root, sessionId: h.session.sessionId, encoders: encoders! });
    derived.forEach((row, index) => {
      expect(row.bytes?.equals(h.received[index]!.body)).toBe(true);
      expect(row.derivedDigest).toBe(h.calls[index]!.requestDigest);
    });
  });

  test("without the pinned library a pi request is unreconstructable, never reconstructed", async () => {
    const h = await closedPiSession();
    const derived = deriveSessionRequests({ workspace: h.root, sessionId: h.session.sessionId });
    expect(derived.map((row) => row.status)).toEqual(["unreconstructable", "unreconstructable"]);
    expect(derived[0]!.detail).toContain("no encoder pi-ai:groq@1 is available");
    const absent = await piAiDerivationEncoders(h.root, h.session.sessionId, { installedVersion: () => null });
    expect(absent).toBeNull();
  });

  test("a session without pi requests never loads pi-ai for verification", async () => {
    const h = await piHarness("groq", []);
    h.close();
    const installedVersion = () => { throw new Error("pi-ai must not be resolved for this session"); };
    expect(await piAiDerivationEncoders(h.root, h.session.sessionId, { installedVersion })).toBeNull();
    expect((await verifyAgentRun(h.root, h.session.sessionId)).requests).toEqual([]);
  });

  test("editing one recorded source byte makes verification fail", async () => {
    const h = await closedPiSession();
    const db = new Database(join(h.root, ".amc", "evidence.sqlite"));
    try {
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as { name: string }[]) db.exec(`DROP TRIGGER "${name}"`);
      db.prepare("UPDATE evidence_events SET payload_inline=? WHERE id=?").run("Say hellp.", h.promptId);
    } finally {
      db.close();
    }
    const report = await verifyAgentRun(h.root, h.session.sessionId);
    expect(report.ok).toBe(false);
    expect(report.requests.map((request) => request.status)).toEqual(["digest-mismatch", "digest-mismatch"]);
  });
});
