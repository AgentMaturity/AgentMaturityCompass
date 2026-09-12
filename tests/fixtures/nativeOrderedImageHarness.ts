/** AUTHORED UNEXECUTED. Real native ACP/runtime and an HTTP edge, not core mocks. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import type { NativeInputPart } from "../../src/attachments/nativeOrderedInput.js";
import { NATIVE_ORDERED_INPUT_FORMAT } from "../../src/attachments/nativeOrderedInput.js";
import { createNativeAcpImageFixture, IMAGE_PNG_BASE64, imageInput } from "./nativeAcpImageRuntime.js";

export const GIF64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
export const PROVIDERS = ["anthropic", "openai-responses", "openai"] as const;
export type Provider = typeof PROVIDERS[number];
export type Frame = { id?: number; method?: string; result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown };
  params?: { sessionId: string; update: { sessionUpdate: string; content?: Record<string, unknown> } } };
const roots: string[] = [], fixtures: ReturnType<typeof createNativeAcpImageFixture>[] = [];
export function orderedWorkspace(backend = "sqlite"): string {
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_VAULT_PASSPHRASE", "ordered-image-fixture-passphrase");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-ordered-image-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" }); return root;
}
export async function orderedCleanup(): Promise<void> {
  try { for (const fixture of fixtures.splice(0).reverse()) await fixture.close(); }
  finally { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); }
}
export function orderedHarness(root: string, provider: string = "openai", options: Parameters<typeof createNativeAcpImageFixture>[2] = {}) {
  const frames: Frame[] = [], waiters = new Map<number, (frame: Frame) => void>(); let serial = 0;
  const fixture = createNativeAcpImageFixture(root, bytes => {
    for (const line of bytes.toString("utf8").trimEnd().split("\n")) {
      const frame = JSON.parse(line) as Frame; frames.push(frame); if (frame.id !== undefined) waiters.get(frame.id)?.(frame);
    }
  }, { provider, ...options }); fixtures.push(fixture);
  const begin = (method: string, params: unknown) => {
    const id = ++serial;
    const result = new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`Ordered ACP fixture did not answer ${method}`)); }, 15_000);
      waiters.set(id, frame => { clearTimeout(timer); waiters.delete(id); resolve(frame); });
    });
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); fixture.agent.connection.ingest(bytes);
    return { id, result, bytes };
  };
  return { ...fixture, frames, begin, call: (method: string, params: unknown) => begin(method, params).result,
    cancel: (sessionId: string) => fixture.agent.connection.ingest(Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } }) + "\n")) };
}
export async function openedOrdered(root = orderedWorkspace(), provider: string = "openai", options: Parameters<typeof createNativeAcpImageFixture>[2] = {}) {
  const h = orderedHarness(root, provider, options);
  const initialized = await h.call("initialize", { protocolVersion: 1, clientCapabilities: {} }); expect(initialized.error).toBeUndefined();
  const created = await h.call("session/new", { cwd: root, mcpServers: [] }); expect(created.error).toBeUndefined();
  return { h, root, initialized, sessionId: created.result!.sessionId as string };
}
export function orderedParts(): NativeInputPart[] {
  return [{ type: "text", text: "  before\n" }, { type: "image", image: imageInput() },
    { type: "text", text: "" }, { type: "text", text: "after first" },
    { type: "image", image: { filename: "pixel.gif", mediaType: "image/gif", bytes: Buffer.from(GIF64, "base64") } },
    { type: "text", text: "after second  " }];
}
export function orderedBlocks(): Record<string, string>[] {
  return [{ type: "text", text: "  before\n" }, { type: "image", mimeType: "image/png", data: IMAGE_PNG_BASE64 },
    { type: "text", text: "" }, { type: "text", text: "after first" },
    { type: "image", mimeType: "image/gif", data: GIF64 }, { type: "text", text: "after second  " }];
}
export const orderedRequest = (sessionId: string, prompt: unknown[] = orderedBlocks()) => ({ sessionId, prompt,
  _meta: { "dev.agentmaturity.amc": { inputFormat: NATIVE_ORDERED_INPUT_FORMAT } } });
/** Independent, explicit protocol expectations; production encoders are not the oracle. */
export function expectedImageWire(provider: Provider, blocks = orderedBlocks()): Record<string, unknown>[] {
  return blocks.map(part => part.type === "text" ? { type: provider === "openai-responses" ? "input_text" : "text", text: part.text }
    : provider === "anthropic" ? { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } }
      : provider === "openai-responses" ? { type: "input_image", image_url: `data:${part.mimeType};base64,${part.data}`, detail: "auto" }
        : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}`, detail: "auto" } });
}
export function firstUserWire(provider: Provider, bytes: Buffer): Record<string, unknown>[] {
  const body = JSON.parse(bytes.toString("utf8"));
  const items = provider === "openai-responses" ? body.input : body.messages;
  const content = items.find((item: { role?: string }) => item.role === "user")?.content;
  if (!Array.isArray(content)) throw new Error("Missing explicit provider user-content array");
  return content.map((part: Record<string, unknown>) => {
    if (provider !== "anthropic") return part;
    const { cache_control, ...rest } = part;
    if (cache_control !== undefined) expect(cache_control).toEqual({ type: "ephemeral" });
    return rest;
  });
}
export function orderedCold(root: string, sessionId: string, env: NodeJS.ProcessEnv = {}) {
  const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./nativeSignedImageCold.ts", import.meta.url)), root, sessionId],
  { encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env } });
  expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as { status: string; bytes: string | null; derivedDigest: string | null }[];
}
