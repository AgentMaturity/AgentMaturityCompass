/** P07 authored subprocess regressions — UNEXECUTED during implementation.
 * Scripted ACP peers test public SDK transport/lifecycle only. They do not
 * authenticate history, execute providers, or establish a signed receipt.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  AMCNativeClient, AMCNativeCancelledError, AMCNativeProtocolError, AMCNativeRefusedError,
  NATIVE_ORDERED_INPUT_FORMAT, NATIVE_AUDIO_INPUT_FORMAT,
  type NativeInputPart, type NativeAudioPart, type AMCNativeClientOptions
} from "../src/sdk/nativeAgentClient.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6k8AAAAASUVORK5CYII=";
const peerSource = String.raw`
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const [mode, capture] = process.argv.slice(2);
const record = value => appendFileSync(capture, JSON.stringify(value) + '\n');
if (process.argv.includes('agent-loop')) {
  record({method:'fixture-verifier-invoked'});
  // Deliberately inconsistent: a transport fixture must never claim real verification.
  process.stdout.write(JSON.stringify({ok:true}));
} else {
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const reply = (frame, result) => send({jsonrpc:'2.0',id:frame.id,result});
  const refuse = (frame, code, message, data) => send({jsonrpc:'2.0',id:frame.id,error:{code,message,data}});
  const active = new Map(); let saved = [], releases = 0, sessionCount = 0;
  const capabilities = {loadSession:true, promptCapabilities:{image:mode !== 'no-image',audio:true},
    _meta:{'dev.agentmaturity.amc':{releaseSession:true,orderedImageInput:'amc-image-input@2',
      audioInput:{format:'amc-audio-input@1',encoderId:'gemini-generate-content',
        encoderVersion:mode === 'future-audio' ? 3 : 2,mimeTypes:['audio/wav']}}}};
  if (mode === 'ignore-stop') { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); }
  const lines = createInterface({input:process.stdin});
  lines.on('line', line => {
    const frame = JSON.parse(line); record(frame);
    const id = frame.params?.sessionId;
    switch(frame.method) {
      case 'initialize': reply(frame,{protocolVersion:1,agentInfo:{name:'agent-maturity-compass'},agentCapabilities:capabilities}); break;
      case 'session/new': reply(frame,{sessionId:'p07-session-'+(++sessionCount)}); break;
      case 'session/prompt': {
        saved = frame.params.prompt; active.set(id,frame);
        if (mode === 'crash') { process.exit(23); break; }
        if (mode === 'eof') { process.stdout.end(); setInterval(()=>{},1000); break; }
        if (mode === 'silence' || mode === 'ignore-stop') break;
        send({jsonrpc:'2.0',method:'session/update',params:{sessionId:id,
          update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'ack'}}}});
        reply(frame,{stopReason:'end_turn',_meta:{'dev.agentmaturity.amc':{validation:
          mode === 'bad-validation' ? {status:'passed'} : {status:'not-requested',turn:null,configSha256:null,checks:[]}}}});
        active.delete(id); break;
      }
      case 'session/cancel': {
        if (mode === 'ignore-stop') break;
        const pending = active.get(id);
        if (pending) { reply(pending,{stopReason:'cancelled'}); active.delete(id); } break;
      }
      case '_amc/session/release': {
        if (mode === 'release-once' && releases++ === 0) {
          refuse(frame,-32020,'Writer release refused',{reason:'writer-not-released'}); break;
        }
        reply(frame,{}); break;
      }
      case 'session/load': {
        if (mode === 'load-refusal') { refuse(frame,-32602,'Verified session resume was refused',{reason:'signed-history-mismatch'}); break; }
        const history = mode === 'no-image'
          ? [{type:'image',mimeType:'image/png',data:'${PNG}'}] : saved;
        for (const content of history) send({jsonrpc:'2.0',method:'session/update',params:{sessionId:id,
          update:{sessionUpdate:'user_message_chunk',content}}});
        reply(frame,{}); break;
      }
    }
  });
}
`;

type Captured = { method: string; params?: { sessionId?: string; prompt?: unknown[]; _meta?: unknown } };
const clients: AMCNativeClient[] = [], roots: string[] = [];
function fixture(mode: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-cos-product07-"))); roots.push(root);
  const path = join(root, "peer.mjs"), capture = join(root, "capture.jsonl");
  writeFileSync(path, peerSource); writeFileSync(capture, "");
  const command: [string, ...string[]] = [process.execPath, path, mode, capture];
  return { root, command, requests: (): Captured[] => readFileSync(capture, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as Captured) };
}
async function start(mode = "echo", options: Partial<AMCNativeClientOptions> = {}) {
  const files = fixture(mode);
  const client = await AMCNativeClient.start({ workspace: files.root, provider: "stub", command: files.command, timeoutMs: 10000, ...options });
  clients.push(client); return { client, ...files };
}
async function within<T>(promise: Promise<T>, timeoutMs = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("P07 regression deadline expired")), timeoutMs);
  })]); } finally { if (timer) clearTimeout(timer); }
}
async function observeClosure(client: AMCNativeClient): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!client.processClosed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  expect(client.processClosed).toBe(true);
}
afterEach(async () => {
  try { for (const client of clients.splice(0)) await client.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); }
});

function image() { return { filename: "original.png", mediaType: "image/png" as const, bytes: Buffer.from(PNG, "base64") }; }
function audio() {
  const bytes = Buffer.alloc(46);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(38, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(2, 40);
  bytes.writeInt16LE(17, 44);
  return { filename: "original.wav", mediaType: "audio/wav" as const, bytes };
}

describe("P07 public subprocess lifecycle (scripted peer, no evidence qualification)", () => {
  test("silent iterator return, AbortSignal and repeated cancel settle through one server cancellation", async () => {
    const { client, requests } = await start("silence"), session = await client.newSession(), controller = new AbortController();
    const turn = session.prompt("silent", { signal: controller.signal }), iterator = turn[Symbol.asyncIterator]();
    const waiting = iterator.next();
    await within(iterator.return!()); await expect(waiting).resolves.toEqual({ done: true, value: undefined });
    controller.abort(); turn.cancel();
    expect(await within(turn.result)).toMatchObject({ stopReason: "cancelled", verification: "not-verified" });
    expect(requests().filter(frame => frame.method === "session/cancel")).toHaveLength(1);
    await client.close(); expect(client.processClosed).toBe(true);
  });
  test("a pre-aborted prompt dispatches nothing and abort after completion cannot cancel the next turn", async () => {
    const { client, requests } = await start(), session = await client.newSession(), controller = new AbortController();
    await session.prompt("first", { signal: controller.signal }).result; controller.abort();
    expect(() => session.prompt("pre-aborted", { signal: controller.signal })).toThrow(AMCNativeCancelledError);
    await session.prompt("second").result;
    expect(requests().filter(frame => frame.method === "session/prompt")).toHaveLength(2);
    expect(requests().some(frame => frame.method === "session/cancel")).toBe(false);
  });
  test.each(["crash", "eof"])("%s rejects a pending stream/result and automatically closes its exact child", async mode => {
    const { client } = await start(mode), session = await client.newSession(), turn = session.prompt("pending");
    const reading = turn[Symbol.asyncIterator]().next();
    await expect(within(turn.result)).rejects.toBeInstanceOf(AMCNativeProtocolError);
    await expect(within(reading)).rejects.toBeInstanceOf(AMCNativeProtocolError);
    await observeClosure(client); expect(client.state).toBe("failed"); expect(client.processExit).toBeDefined();
    expect(() => session.prompt("must not respawn")).toThrow(AMCNativeProtocolError);
  });
  test.skipIf(process.platform === "win32")("a POSIX peer ignoring cancel, EOF and SIGTERM is reaped by the close escalation", async () => {
    const { client } = await start("ignore-stop"), session = await client.newSession(), turn = session.prompt("pending");
    const result = turn.result.catch(error => error);
    const closing = client.close(); expect(client.close()).toBe(closing);
    await within(closing, 12000);
    expect(await result).toBeInstanceOf(AMCNativeProtocolError);
    expect(client.processClosed).toBe(true); expect(client.processExit).toEqual({ exitCode: null, signal: "SIGKILL" });
  }, 15000);
  test("resume refusal is surfaced unchanged without a replacement session", async () => {
    const { client, requests } = await start("load-refusal");
    await expect(client.resumeSession("existing-signed-session")).rejects.toMatchObject({
      code: -32602, message: "Verified session resume was refused", data: { reason: "signed-history-mismatch" }
    });
    expect(requests().filter(frame => frame.method === "session/load")).toHaveLength(1);
    expect(requests().some(frame => frame.method === "session/new")).toBe(false); expect(client.state).toBe("open");
  });
  test("a refused release keeps its handle usable; a later successful release invalidates only that handle", async () => {
    const { client } = await start("release-once"), session = await client.newSession();
    await expect(session.release()).rejects.toMatchObject({ code: -32020, data: { reason: "writer-not-released" } });
    expect(session.lifecycle).toBe("accepted"); await session.prompt("after refused release").result;
    await session.release(); const resumed = await client.resumeSession(session.sessionId);
    expect(() => session.prompt("stale")).toThrow(/has been released/);
    expect(resumed.history.map(row => row.update.content)).toEqual([{ type: "text", text: "after refused release" }]);
    expect((await resumed.prompt("continued").result).updates).toHaveLength(1);
  });
  test("ordered image snapshots retain empty/adjacent text and original byte order through release/load", async () => {
    const { client, requests } = await start(), session = await client.newSession(), original = image();
    const parts: NativeInputPart[] = [{ type: "text", text: "" }, { type: "image", image: original },
      { type: "text", text: "suffix" }, { type: "text", text: "" }];
    const expected = [{ type: "text", text: "" }, { type: "image", mimeType: "image/png", data: PNG },
      { type: "text", text: "suffix" }, { type: "text", text: "" }];
    const turn = session.promptParts(parts); original.bytes.fill(0); parts.reverse();
    expect((await turn.result).verification).toBe("not-verified");
    expect(requests().find(frame => frame.method === "session/prompt")?.params).toEqual({
      sessionId: session.sessionId, prompt: expected, _meta: { "dev.agentmaturity.amc": { inputFormat: NATIVE_ORDERED_INPUT_FORMAT } }
    });
    await session.release(); const resumed = await client.resumeSession(session.sessionId);
    expect(resumed.history.map(row => row.update.content)).toEqual(expected);
    expect(Object.isFrozen(resumed.history)).toBe(true); expect(Object.isFrozen(resumed.history[1]!.update.content)).toBe(true);
    const next = await resumed.prompt("next").result; expect(next.text).toBe("ack"); expect(next.updates).toHaveLength(1);
  });
  test("audio-bearing input snapshots original WAV/images and negotiates the exact version without flattening", async () => {
    const { client, requests } = await start(), session = await client.newSession(), wav = audio(), png = image();
    const wavData = wav.bytes.toString("base64");
    const parts: NativeAudioPart[] = [{ type: "text", text: "" }, { type: "image", image: png },
      { type: "audio", audio: wav }, { type: "text", text: "suffix" }];
    const expected = [{ type: "text", text: "" }, { type: "image", mimeType: "image/png", data: PNG },
      { type: "audio", mimeType: "audio/wav", data: wavData }, { type: "text", text: "suffix" }];
    const turn = session.promptAudioParts(parts); wav.bytes.fill(0); png.bytes.fill(0); parts.reverse();
    expect((await turn.result).verification).toBe("not-verified");
    expect(requests().find(frame => frame.method === "session/prompt")?.params).toEqual({ sessionId: session.sessionId,
      prompt: expected, _meta: { "dev.agentmaturity.amc": { inputFormat: NATIVE_AUDIO_INPUT_FORMAT } } });
    await session.release(); const loaded = await client.resumeSession(session.sessionId);
    expect(loaded.history.map(row => row.update.content)).toEqual(expected);
  });
  test("public capability mutation cannot enable images or accept unnegotiated image replay", async () => {
    const { client, requests } = await start("no-image"), session = await client.newSession();
    expect(Object.isFrozen(client.capabilities.promptCapabilities)).toBe(true);
    client.capabilities = { loadSession: true, promptCapabilities: { image: true },
      _meta: { "dev.agentmaturity.amc": { orderedImageInput: NATIVE_ORDERED_INPUT_FORMAT } } };
    expect(() => session.prompt("image", { images: [image()] })).toThrow(AMCNativeRefusedError);
    expect(() => session.promptParts([{ type: "image", image: image() }])).toThrow(AMCNativeRefusedError);
    expect(requests().some(frame => frame.method === "session/prompt")).toBe(false);
    await expect(client.resumeSession("external")).rejects.toBeInstanceOf(AMCNativeProtocolError);
    await observeClosure(client);
  });
  test("a future audio capability is refused, not downgraded to text or images", async () => {
    const { client, requests } = await start("future-audio"), session = await client.newSession();
    expect(() => session.promptAudioParts([{ type: "audio", audio: audio() }])).toThrow(AMCNativeRefusedError);
    expect(requests().some(frame => frame.method === "session/prompt")).toBe(false);
    expect((await session.prompt("explicit text").result).text).toBe("ack");
  });
  test("malformed validation closes the transport without accepting a success-shaped summary", async () => {
    const { client } = await start("bad-validation"), session = await client.newSession();
    await expect(session.prompt("prompt").result).rejects.toThrow(/invalid validation metadata/);
    await observeClosure(client); expect(client.state).toBe("failed");
  });
  test("cold verification uses the snapshotted command and rejects the scripted non-receipt", async () => {
    const { client, command, requests } = await start(), session = await client.newSession();
    command[0] = "/not-an-amc-executable"; command[1] = "/not-the-original-cli";
    await session.prompt("prompt").result; await client.close();
    await expect(client.verifySession(session.sessionId)).rejects.toThrow(/inconsistent receipt/);
    expect(requests().filter(frame => frame.method === "fixture-verifier-invoked")).toHaveLength(1);
  });
});
