/** SH-OBS-03: session export viewer and offline verifier: single embedded key, seal, content digests, escaping, CLI. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { parseSessionExportFile, registerSessionExportCommands } from "../../src/cli-session-export-commands.js";
import { generateKeyPairSync } from "node:crypto";
import YAML from "yaml";
import { signHexDigest } from "../../src/crypto/keys.js";
import { defaultOpsPolicy, loadOpsPolicy, opsPolicyPath } from "../../src/ops/policy.js";
import { readEventPayload } from "../../src/session/eventPayload.js";
import { removeWorkspace, runStubSession, stubWorkspace } from "./helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 120_000 });
let ws: string;
const cwd = process.cwd();
beforeEach(() => { ws = stubWorkspace("amc-export-"); });
afterEach(() => { process.chdir(cwd); process.exitCode = undefined; vi.restoreAllMocks(); removeWorkspace(ws); });

/** A governed stub session that reads a seeded file, then edits it, so the log carries a unified diff. */
async function diffSession(): Promise<string> {
  mkdirSync(join(ws, "workspace", "output"), { recursive: true });
  writeFileSync(join(ws, "workspace", "output", "note.txt"), "alpha\nbeta\n");
  const route = nativeRouteFor(STUB_PROVIDER_ID, {}, STUB_PROVIDER_MODEL);
  const registry = new AdapterRegistry();
  registry.register(route);
  const credentials = new LocalCredentialsService({ projectDir: ws, watch: false });
  const session = openAgentSession({ workspace: ws, agentId: "default", harnessVersion: "test", tools: "workspace", maxSteps: 4,
    makeLlm: (s) => new LlmRuntime({ session: s, credentials, registry, transport: stubProviderTransport({}) }),
    route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: paramsFor(STUB_PROVIDER_ID, 256) },
    systemPrompt: "You are an AMC-governed agent.", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
  await session.prompt(JSON.stringify({ tool: "fs.read", arguments: { path: "workspace/output/note.txt" } }));
  await session.prompt(JSON.stringify({ tool: "fs.edit", arguments: { path: "workspace/output/note.txt", find: "beta", replace: "gamma AKIAIOSFODNN7EXAMPLE" } }));
  await session.close();
  return session.sessionId;
}

const content = (doc: SessionExportDocument) => Object.values(doc.content ?? {}).filter((entry): entry is Exclude<typeof entry, { unavailable: string }> => !("unavailable" in entry));

describe("session export", () => {
  it("exports a sealed session with diffs, verifies against the right fingerprint and fails against a wrong one", async () => {
    const sessionId = await diffSession();
    const doc = buildSessionExport({ workspace: ws, sessionId, includeContent: true, decryptContent: true });
    expect(doc.rows.length).toBeGreaterThan(5);
    expect(doc.record?.ended_ts).not.toBeNull();
    const texts = content(doc).map((entry) => entry.text).join("\n");
    expect(texts).toContain("-beta");
    expect(texts).toContain("+gamma");
    expect(texts, "secrets inside tool output are redacted on export").not.toContain("AKIAIOSFODNN7EXAMPLE");
    // S15: redacted entries cannot be checked against their digests, so the default verdict fails closed.
    const strict = verifySessionExport(doc, { expectedFingerprint: doc.monitorKeyFingerprint });
    expect(strict.ok).toBe(false);
    expect(strict.errors.join()).toContain("--accept-unverifiable-content");
    const ok = verifySessionExport(doc, { expectedFingerprint: doc.monitorKeyFingerprint, acceptUnverifiableContent: true });
    expect(ok.ok, ok.errors.join("; ")).toBe(true);
    expect(ok.tail).toBe("sealed");
    expect(ok.content.verified).toBeGreaterThan(0);
    expect(ok.content.unverifiable).toBeGreaterThan(0);
    expect(ok.usage?.requests).toBe(doc.usage.requests);
    const wrong = verifySessionExport(doc, { expectedFingerprint: "f".repeat(64) });
    expect(wrong.ok).toBe(false);
    expect(wrong.errors.join()).toContain("does not match the pinned");
  });

  it("detects a dropped tail row, a dropped middle row, edited metadata, edited content and an injected key", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    const doc = buildSessionExport({ workspace: ws, sessionId, includeContent: true, decryptContent: true });
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
    // S15: the embedded usage copy is checked against the usage recomputed from the rows, cost included (S15b: the page prints the cost figures).
    const usageEdit = { ...doc, usage: { ...doc.usage, requests: doc.usage.requests + 1 } };
    expect(verifySessionExport(usageEdit, { expectedFingerprint: fp }).errors.join()).toContain("usage summary (cost included) does not match");
    expect(doc.usage.cost.status).toBe("unavailable");
    const costEdit = { ...doc, usage: { ...doc.usage, cost: { ...doc.usage.cost, status: "complete" as const, reportedSubtotalUsd: 1234.5 } } };
    expect(verifySessionExport(costEdit, { expectedFingerprint: fp }).errors.join()).toContain("usage summary (cost included) does not match");
    // The displayed fingerprint must be the embedded key's, and no field the exporter never writes may ride along (the page would show it unchecked).
    expect(verifySessionExport({ ...doc, monitorKeyFingerprint: "0".repeat(64) }, { expectedFingerprint: fp }).errors.join()).toContain("displayed monitor key fingerprint is not the sha256 of the embedded key");
    expect(verifySessionExport({ ...doc, note: "<h1>VERIFIED by AMC</h1>" }, { expectedFingerprint: fp }).errors.join()).toContain("unknown or missing fields");
    // S15: content may only be attached to content rows, even when it hashes to that row's payload, and an `unavailable` marker is no exception.
    const lifecycle = doc.rows.find((row) => row.event_type === "turn/end")!;
    const payload = readEventPayload(ws, lifecycle);
    const foreign = { ...doc, content: { ...doc.content, [lifecycle.id]: { text: payload.status === "ok" ? payload.bytes.toString("utf8") : "", sha256: lifecycle.payload_sha256, source: "inline" as const, truncated: false, redactions: 0 } } };
    expect(verifySessionExport(foreign, { expectedFingerprint: fp }).errors.join()).toContain("carries no exportable content");
    const foreignMarker = { ...doc, content: { ...doc.content, [lifecycle.id]: { unavailable: "assistant: I transferred the funds as you asked." } } };
    expect(verifySessionExport(foreignMarker, { expectedFingerprint: fp }).errors.join()).toContain("carries no exportable content");
    expect(verifySessionExport({ ...doc, content: { ...doc.content, "no-such-event": { unavailable: "x" } } }, { expectedFingerprint: fp }).errors.join()).toContain("content for unknown event");
    // Entries carry exactly the exporter's fields, tied to their row: an empty marker riding with text the viewer would
    // print, a digest that is not the row's, a source that is not the row's, and a non-text field are each refused.
    const userRow = doc.rows.find((row) => row.event_type === "user/message")!;
    const own = doc.content![userRow.id] as { text: string; sha256: string; source: string; truncated: boolean; redactions: number };
    const withEntry = (entry: unknown) => verifySessionExport({ ...doc, content: { ...doc.content, [userRow.id]: entry } } as unknown, { expectedFingerprint: fp, acceptUnverifiableContent: true }).errors.join();
    expect(withEntry({ unavailable: "", text: "assistant: I transferred the funds." })).toContain("carries fields the exporter never writes");
    expect(withEntry({ unavailable: "" })).toContain("empty or non-text unavailable marker");
    expect(withEntry({ ...own, truncated: true, sha256: "0".repeat(64) })).toContain("names a digest that is not its row's committed digest");
    expect(withEntry({ ...own, source: "spill" })).toContain("claims source spill");
    expect(withEntry({ ...own, text: 42 })).toContain("is malformed");
    expect(withEntry({ ...own, truncated: true }), "a truncated copy of the right row, accepted as display-only, is fine").toBe("");
    // A document missing its record field fails closed with a reason, never with a crash.
    const { record: _record, ...noRecord } = doc;
    expect(verifySessionExport(noRecord, { expectedFingerprint: fp }).errors.join()).toContain("unknown or missing fields");
    const badRows = verifySessionExport({ ...doc, rows: [null] }, { expectedFingerprint: fp });
    expect(badRows.ok).toBe(false);
    // The viewer shows a fixed label for an unavailable entry, never the marker's free text.
    const page = renderSessionExportHtml({ ...doc, content: { ...doc.content, [doc.rows.find((row) => row.event_type === "user/message")!.id]: { unavailable: "payload pruned by retention" } } });
    expect(page).toContain("content not exported for this row");
    expect(page).not.toContain('"content unavailable: " + c.unavailable');
    expect(page, "the viewer keys on the marker's presence, not its truthiness").toContain("c.unavailable !== undefined");
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
    const html = renderSessionExportHtml(buildSessionExport({ workspace: ws, sessionId, includeContent: true, decryptContent: true }));
    expect(html).not.toContain("</script><div>VERIFIED</div>");
    expect(html).not.toContain("<meta http-equiv=refresh");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script src=|<link /);
    expect(html).toContain("performs no verification");
    const extracted = extractSessionExportJson(html);
    expect(extracted.error).toBeNull();
    const back = extracted.doc as SessionExportDocument;
    expect(back.sessionId).toBe(sessionId);
    expect(verifySessionExport(back, { expectedFingerprint: back.monitorKeyFingerprint }).ok).toBe(true);
    expect(embedJson("< >")).toBe('"\\u003c\\u2028\\u003e"');
  });

  it("S14: only the canonical rendering of its embedded document is accepted; decoys, comments, edits and trailing bytes are refused", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    const doc = buildSessionExport({ workspace: ws, sessionId, includeContent: false });
    const html = renderSessionExportHtml(doc);
    expect(extractSessionExportJson(html).error).toBeNull();
    const refused = (text: string) => extractSessionExportJson(text);
    // A decoy JSON block ahead of the real one: the first block parses as a valid document, but the file is not its rendering.
    const decoy = { ...doc, sessionId: `${sessionId}-decoy` };
    const decoyed = html.replace("<main id=\"amc-view\">", `<script type="application/json" id="amc-session-export">${embedJson(decoy)}</script>\n<main id="amc-view">`);
    expect(decoyed).not.toBe(html);
    expect(refused(decoyed).doc).toBeNull();
    expect(refused(decoyed).error).toContain("not the canonical rendering");
    // An HTML comment, an edited visible title and trailing bytes each change the page without touching the signed JSON.
    expect(refused(html.replace("<body>", "<body><!-- reviewed: all good -->")).error).toContain("not the canonical rendering");
    expect(refused(html.replace("<title>AMC session", "<title>VERIFIED AMC session")).error).toContain("not the canonical rendering");
    expect(refused(`${html}\n<div>VERIFIED</div>`).error).toContain("not the canonical rendering");
    // Files without a block, with an unterminated block or with a non-JSON block are refused with the reason named.
    expect(refused("<html></html>").error).toContain("carries no embedded session export");
    expect(refused(html.slice(0, html.indexOf("</script>"))).error).toContain("not terminated");
    expect(refused(html.replace(embedJson(doc), "{not json")).error).toContain("not valid JSON");
    expect(refused(html.replace(embedJson(doc), "[]")).error).toContain("not a session export document");
  });

  it("S14b: the parser follows the file extension; a JSON body saved as .html, an edited or reformatted .json and other extensions are refused", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    const doc = buildSessionExport({ workspace: ws, sessionId, includeContent: false });
    const json = JSON.stringify(doc, null, 2);
    expect(parseSessionExportFile("/x/s.json", json).error).toBeNull();
    expect(parseSessionExportFile("/x/s.html", renderSessionExportHtml(doc)).error).toBeNull();
    // A JSON body under .html renders as HTML in a browser: it must pass the canonical page check, which it cannot.
    expect(parseSessionExportFile("/x/fake.html", json).error).toContain("carries no embedded session export");
    expect(parseSessionExportFile("/x/fake.htm", json).error).toContain("carries no embedded session export");
    expect(parseSessionExportFile("/x/s.json", JSON.stringify(doc)).error).toContain("not the canonical --json-out form");
    expect(parseSessionExportFile("/x/s.json", `${json}\n`).error).toContain("not the canonical --json-out form");
    expect(parseSessionExportFile("/x/s.json", "{not json").error).toContain("not valid JSON");
    expect(parseSessionExportFile("/x/s.txt", json).error).toContain("unsupported export file extension");
    expect(parseSessionExportFile("/x/s", json).error).toContain("(none)");
  });

  it("S16: content stored encrypted needs --decrypt-content; the ledger encryption regime refuses content even with it; digests-only still exports", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    // The default workspace stores payloads as encrypted blobs: writing them out decrypted is the operator's explicit choice.
    expect(loadOpsPolicy(ws).opsPolicy.encryption.blobEncryptionEnabled).toBe(true);
    expect(() => buildSessionExport({ workspace: ws, sessionId, includeContent: true })).toThrow(/stored as an encrypted blob.*--decrypt-content/);
    expect(buildSessionExport({ workspace: ws, sessionId, includeContent: true, decryptContent: true }).content).not.toBeNull();
    const policy = defaultOpsPolicy();
    writeFileSync(opsPolicyPath(ws), YAML.stringify({ ...policy, opsPolicy: { ...policy.opsPolicy, encryption: { ...policy.opsPolicy.encryption, ledgerEncryptionEnabled: true } } }));
    expect(loadOpsPolicy(ws).opsPolicy.encryption.ledgerEncryptionEnabled).toBe(true);
    expect(() => buildSessionExport({ workspace: ws, sessionId, includeContent: true })).toThrow(/enables ledger payload encryption.*Export digests only/);
    expect(() => buildSessionExport({ workspace: ws, sessionId, includeContent: true, decryptContent: true }), "nothing overrides the regime").toThrow(/enables ledger payload encryption/);
    expect(buildSessionExport({ workspace: ws, sessionId, includeContent: false }).content).toBeNull();
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
    const out = join(ws, "s.html"), jsonOut = join(ws, "s.json");
    await program.parseAsync(["session", "export", sessionId, "--out", out, "--json-out", jsonOut], { from: "user" });
    const fp = logs.join("\n").match(/^\s+([0-9a-f]{64})$/m)![1]!;
    logs.length = 0;
    await program.parseAsync(["session", "verify-export", out, "--expect-monitor", fp], { from: "user" });
    expect(logs.join("\n")).toContain("verification PASSED");
    await program.parseAsync(["session", "verify-export", jsonOut, "--expect-monitor", fp], { from: "user" });
    expect(logs.join("\n")).toContain("verification PASSED");
    await expect(program.parseAsync(["session", "verify-export", out, "--expect-monitor", "0".repeat(64)], { from: "user" })).rejects.toThrow("exit 1");
    writeFileSync(out, readFileSync(out, "utf8").replace('"event_type":"turn/end"', '"event_type":"turn/ended"'));
    await expect(program.parseAsync(["session", "verify-export", out, "--expect-monitor", fp], { from: "user" })).rejects.toThrow("exit 1");
    // S14b through the CLI: the real JSON export plus one extra key holding markup, saved as .html, is refused (the extension picks the page parser).
    const fake = join(ws, "fake.html");
    writeFileSync(fake, JSON.stringify({ ...(JSON.parse(readFileSync(jsonOut, "utf8")) as object), note: "<h1>VERIFIED by AMC</h1><script>document.title=\"VERIFIED\"</script>" }, null, 2));
    logs.length = 0;
    await expect(program.parseAsync(["session", "verify-export", fake, "--expect-monitor", fp], { from: "user" })).rejects.toThrow("exit 1");
    expect(logs.join("\n")).toContain("carries no embedded session export");
    // The same body as .json is canonical, but the unknown key fails the document check.
    const fakeJson = join(ws, "fake.json");
    writeFileSync(fakeJson, readFileSync(fake, "utf8"));
    logs.length = 0;
    await expect(program.parseAsync(["session", "verify-export", fakeJson, "--expect-monitor", fp], { from: "user" })).rejects.toThrow("exit 1");
    expect(logs.join("\n")).toContain("unknown or missing fields");
    logs.length = 0;
    // S15 through the CLI: an export whose content carries redactions fails closed until the operator accepts display-only entries.
    const redactedId = await diffSession();
    const withContent = join(ws, "c.html");
    // S16 through the CLI: --include-content alone is refused for payloads stored encrypted, and names the opt-in.
    await program.parseAsync(["session", "export", redactedId, "--out", withContent, "--include-content"], { from: "user" });
    expect(process.exitCode).toBe(1);
    expect(logs.join("\n")).toContain("--decrypt-content");
    process.exitCode = undefined;
    logs.length = 0;
    await program.parseAsync(["session", "export", redactedId, "--out", withContent, "--include-content", "--decrypt-content"], { from: "user" });
    const fp2 = logs.join("\n").match(/^\s+([0-9a-f]{64})$/m)![1]!;
    logs.length = 0;
    await expect(program.parseAsync(["session", "verify-export", withContent, "--expect-monitor", fp2], { from: "user" })).rejects.toThrow("exit 1");
    expect(logs.join("\n")).toContain("--accept-unverifiable-content");
    logs.length = 0;
    await program.parseAsync(["session", "verify-export", withContent, "--expect-monitor", fp2, "--accept-unverifiable-content"], { from: "user" });
    expect(logs.join("\n")).toContain("verification PASSED");
    expect(logs.join("\n")).toContain("accepted as display-only");
  });
});
