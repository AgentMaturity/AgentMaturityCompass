/**
 * Trusted bootstrap copied into an isolated invocation directory. This string
 * is never evaluated in AMC. The selected module is imported only by the
 * confined child; its output remains untrusted extension data, not evidence of
 * confinement or permission. Both lifecycle hooks belong to this invocation.
 */
export const NATIVE_EXECUTABLE_BOOTSTRAP = String.raw`
import { readFileSync } from "node:fs";
const request = JSON.parse(readFileSync(new URL("./request.json", import.meta.url), "utf8"));
const write = process.stdout.write.bind(process.stdout);
const api = Object.freeze({ apiVersion: 1, extensionId: request.extensionId,
  invocationId: request.invocationId, capabilities: Object.freeze([...request.capabilities]) });
const input = Object.freeze(request.input);
try {
  const extension = await import(new URL("./extension.mjs", import.meta.url).href);
  for (const hook of ["onLoad", "onUnload"]) {
    if (extension[hook] !== undefined && typeof extension[hook] !== "function") throw new Error("invalid lifecycle hook");
  }
  if (!Object.hasOwn(extension, request.exportName) || typeof extension[request.exportName] !== "function") throw new Error("missing declared export");
  let state;
  let output;
  try {
    if (extension.onLoad) state = await extension.onLoad(api);
    output = await extension[request.exportName](input, api, state);
    if (typeof output !== "string" || output.includes("\0") || Buffer.byteLength(output) > request.maxOutputBytes) throw new Error("invalid output");
  } finally {
    if (extension.onUnload) await extension.onUnload(api, state);
  }
  write(JSON.stringify({ protocol: "amc-executable/1", invocationId: request.invocationId, ok: true, output }) + "\n");
} catch {
  write(JSON.stringify({ protocol: "amc-executable/1", invocationId: request.invocationId, ok: false, code: "EXECUTABLE_HANDLER_FAILED" }) + "\n");
  process.exitCode = 1;
}
`;
