/** SH-OBS-03: session export viewer and offline verifier: single embedded key, seal, content digests, escaping, CLI. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAgentSession } from "../../src/agent/agentSession.js";
import { stubProviderTransport, STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../../src/agent/stubProvider.js";
import { nativeRouteFor, paramsFor } from "../../src/cli-agent-options.js";
import { LocalCredentialsService } from "../../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import { buildSessionExport, verifySessionExport, type SessionExportDocument } from "../../src/observability/sessionExport.js";
import { embedJson, extractSessionExportJson, renderSessionExportHtml } from "../../src/observability/sessionExportHtml.js";
import { registerSessionExportCommands } from "../../src/cli-session-export-commands.js";
import { generateKeyPairSync } from "node:crypto";
import { signHexDigest } from "../../src/crypto/keys.js";
import { removeWorkspace, runStubSession, stubWorkspace } from "./helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 120_000 });
let ws: string;
const cwd = process.cwd();
beforeEach(() => { ws = stubWorkspace("amc-export-"); });
afterEach(() => { process.chdir(cwd); process.exitCode = undefined; vi.restoreAllMocks(); removeWorkspace(ws); });

/** A governed stub session that reads a seeded file, then edits it, so the log carries a unified diff. */
async function diffSession(): Promise<string> {
  writeFileSync(join(ws, "workspace", "note.txt"), "alpha\nbeta\n");
  const route = nativeRouteFor(STUB_PROVIDER_ID, {}, STUB_PROVIDER_MODEL);
  const registry = new AdapterRegistry();
  registry.register(route);
  const credentials = new LocalCredentialsService({ projectDir: ws, watch: false });
  const session = openAgentSession({ workspace: ws, agentId: "default", harnessVersion: "test", tools: "workspace", maxSteps: 4,
    makeLlm: (s) => new LlmRuntime({ session: s, credentials, registry, transport: stubProviderTransport({}) }),
    route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: paramsFor(STUB_PROVIDER_ID, 256) },
    systemPrompt: "You are an AMC-governed agent.", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
  await session.prompt(JSON.stringify({ tool: "fs.read", arguments: { path: "workspace/note.txt" } }));
  await session.prompt(JSON.stringify({ tool: "fs.edit", arguments: { path: "workspace/note.txt", find: "beta", replace: "gamma AKIAIOSFODNN7EXAMPLE" } }));
  await session.close();
  return session.sessionId;
}

const content = (doc: SessionExportDocument) => Object.values(doc.content ?? {}).filter((entry): entry is Exclude<typeof entry, { unavailable: string }> => !("unavailable" in entry));

describe("session export", () => {
  it("exports a sealed session with diffs, verifies against the right fingerprint and fails against a wrong one", async () => {
    const sessionId = await diffSession();
    const doc = buildSessionExport({ workspace: ws, sessionId, includeContent: true });
    expect(doc.rows.length).toBeGreaterThan(5);
    expect(doc.record?.ended_ts).not.toBeNull();
    const texts = content(doc).map((entry) => entry.text).join("\n");
    expect(texts).toContain("-beta");
    expect(texts).toContain("+gamma");
    expect(texts, "secrets inside tool output are redacted on export").not.toContain("AKIAIOSFODNN7EXAMPLE");
    const ok = verifySessionExport(doc, { expectedFingerprint: doc.monitorKeyFingerprint });
    expect(ok.ok, ok.errors.join("; ")).toBe(true);
    expect(ok.tail).toBe("sealed");
    expect(ok.content.verified).toBeGreaterThan(0);
    const wrong = verifySessionExport(doc, { expectedFingerprint: "f".repeat(64) });
    expect(wrong.ok).toBe(false);
    expect(wrong.errors.join()).toContain("does not match the pinned");
  });

  it("detects a dropped tail row, a dropped middle row, edited metadata, edited content and an injected key", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    const doc = buildSessionExport({ workspace: ws, sessionId, includeContent: true });
    const fp = doc.monitorKeyFingerprint;
    expect(verifySessionExport(doc, { expectedFingerprint: fp }).ok).toBe(true);
    const tailCut = { ...doc, rows: doc.rows.slice(0, -1) };
    expect(verifySessionExport(tailCut, { expectedFingerprint: fp }).errors.join()).toMatch(/seal names|does not end/);
    const middleCut = { ...doc, rows: [...doc.rows.slice(0, 3), ...doc.rows.slice(4)] };
    expect(verifySessionExport(middleCut, { expectedFingerprint: fp }).errors.join()).toContain("sequence mismatch");
    const edited = { ...doc, rows: doc.rows.map((row, i) => i === 2 ? { ...row, meta_json: row.meta_json.replace("{", '{"x":1,') } : row) };
    expect(verifySessionExport(edited, { expectedFingerprint: fp }).errors.join()).toContain("event_hash mismatch");
    const [id, entry] = Object.entries(doc.content!).find(([, value]) => !("unavailable" in value) && value.redactions === 0)!;
    const editedContent = { ...doc, content: { ...doc.content, [id]: { ...(entry as { text: string }), text: "tampered" } } };
    expect(verifySessionExport(editedContent, { expectedFingerprint: fp }).errors.join()).toContain("does not hash to its committed payload digest");
    // An attacker re-signs every row with their own key and ships that key: the pinned fingerprint no longer matches.
    const attacker = generateKeyPairSync("ed25519");
    const pem = attacker.publicKey.export({ type: "spki", format: "pem" }).toString();
    const priv = attacker.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const resigned = { ...doc, monitorPublicKeyPem: pem, rows: doc.rows.map((row) => ({ ...row, writer_sig: signHexDigest(row.event_hash, priv) })) };
    const verdict = verifySessionExport(resigned, { expectedFingerprint: fp });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join()).toContain("does not match the pinned");
    // Mutation check: an open (unsealed) tail is reported as unproven, never as sealed.
    const open = { ...doc, record: { ...doc.record!, ended_ts: null, session_final_event_hash: null, session_seal_sig: null } };
    expect(verifySessionExport(open, { expectedFingerprint: fp }).tail).toBe("unproven");
  });

  it("digests-only export carries no content; the HTML escapes untrusted text and loads nothing", async () => {
    const { sessionId } = await runStubSession(ws, "</script><div>VERIFIED</div><meta http-equiv=refresh content=0>");
    const plain = buildSessionExport({ workspace: ws, sessionId, includeContent: false });
    expect(plain.content).toBeNull();
    const html = renderSessionExportHtml(buildSessionExport({ workspace: ws, sessionId, includeContent: true }));
    expect(html).not.toContain("</script><div>VERIFIED</div>");
    expect(html).not.toContain("<meta http-equiv=refresh");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script src=|<link /);
    expect(html).toContain("performs no verification");
    const back = extractSessionExportJson(html) as SessionExportDocument;
    expect(back.sessionId).toBe(sessionId);
    expect(verifySessionExport(back, { expectedFingerprint: back.monitorKeyFingerprint }).ok).toBe(true);
    expect(embedJson("< >")).toBe('"\\u003c\\u2028\\u003e"');
  });

  it("CLI: export writes the file and prints the fingerprint; verify-export passes with the pin, fails after an edit", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    const program = new Command();
    const session = program.command("session");
    registerSessionExportCommands(session);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    process.chdir(ws);
    const out = join(ws, "s.html");
    await program.parseAsync(["session", "export", sessionId, "--out", out], { from: "user" });
    const fp = logs.join("\n").match(/^\s+([0-9a-f]{64})$/m)![1]!;
    logs.length = 0;
    await program.parseAsync(["session", "verify-export", out, "--expect-monitor", fp], { from: "user" });
    expect(logs.join("\n")).toContain("verification PASSED");
    await expect(program.parseAsync(["session", "verify-export", out, "--expect-monitor", "0".repeat(64)], { from: "user" })).rejects.toThrow("exit 1");
    writeFileSync(out, readFileSync(out, "utf8").replace('"event_type":"turn/end"', '"event_type":"turn/ended"'));
    await expect(program.parseAsync(["session", "verify-export", out, "--expect-monitor", fp], { from: "user" })).rejects.toThrow("exit 1");
  });
});
