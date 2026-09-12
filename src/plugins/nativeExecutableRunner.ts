import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { NativeExtensionError } from "../extensions/nativeExtensionManifest.js";
import { readNativeExtension, type NativeExtensionSnapshot } from "../extensions/nativeExtensionStore.js";
import { bwrapBackend } from "../sandbox/bwrapBackend.js";
import { SandboxRunner } from "../sandbox/sandboxRunner.js";
import { NATIVE_EXECUTABLE_BOOTSTRAP } from "./nativeExecutableBootstrap.js";
import { assertNativeExecutableInstalled, type NativeExecutableModuleSnapshot } from "./nativeExecutablePackage.js";
import { assertNativeExecutableApproval } from "./nativeExecutablePolicy.js";
import { loadInstalledPluginExecutable } from "./pluginLoader.js";
import { NATIVE_EXECUTABLE_LIMITS, NativeExecutableError, type NativeExecutableDeclaration } from "./nativeExecutableSchema.js";

const contextInput = z.object({ sessionId: z.string().min(1).max(256).optional(),
  turn: z.number().int().positive().safe(), step: z.number().int().positive().safe() }).strict();
const commandInput = z.object({ arguments: z.string().refine(value => !value.includes("\0") && Buffer.byteLength(value) <= 16_384) }).strict();
const responseSchema = z.discriminatedUnion("ok", [
  z.object({ protocol: z.literal("amc-executable/1"), invocationId: z.string(), ok: z.literal(true), output: z.string() }).strict(),
  z.object({ protocol: z.literal("amc-executable/1"), invocationId: z.string(), ok: z.literal(false), code: z.literal("EXECUTABLE_HANDLER_FAILED") }).strict()
]);

function failure(error: unknown): NativeExecutableError {
  if (error instanceof NativeExecutableError) return error;
  if (error instanceof NativeExtensionError) return new NativeExecutableError(error.code, error.message);
  return new NativeExecutableError("EXECUTABLE_RUNTIME_FAILED", "The isolated executable extension failed. Source, inputs, stderr and filesystem diagnostics are withheld; no unconfined fallback or retry was attempted.");
}

/**
 * A process-local, pinned load. Construction validates but imports no code.
 * Every call gets a fresh confined Node process and bounded onLoad/handler/
 * onUnload lifecycle. No persistent module process survives a call. Revocation
 * or any runtime fault is terminal for this handle; reload is explicit.
 */
export class NativeExecutableRunner {
  private readonly snapshot: NativeExtensionSnapshot;
  private readonly declaration: NativeExecutableDeclaration;
  private readonly module: NativeExecutableModuleSnapshot;
  private readonly loadedAt = performance.now();
  private readonly approvalExpiresAt: number;
  private fault: NativeExecutableError | null = null;
  private active: AbortController | null = null;
  private usedCalls = 0;

  constructor(workspace: string, manifestPath: string, expectedDigest: string) {
    this.snapshot = readNativeExtension({ workspace, manifestPath, expectedDigest });
    if (this.snapshot.manifest.schemaVersion !== 2) throw new NativeExecutableError("EXECUTABLE_DECLARATION_REQUIRED", "Select a signed v2 executable extension declaration.");
    this.declaration = this.snapshot.manifest.executable;
    this.approvalExpiresAt = assertNativeExecutableApproval(this.snapshot.workspace, this.snapshot.manifestDigest, this.declaration.capabilities).expiresAt;
    this.module = loadInstalledPluginExecutable(this.snapshot.workspace, this.declaration);
  }

  get id(): string { return this.snapshot.manifest.id; }
  get manifestDigest(): string { return this.snapshot.manifestDigest; }
  contextNames(): readonly string[] { return this.declaration.contexts.map(entry => entry.name); }
  commandNames(): readonly string[] { return Object.keys(this.declaration.commands); }
  inspect() {
    return { id: this.id, manifestDigest: this.manifestDigest,
      state: this.fault ? "refused" : this.active ? "running" : "loaded-not-running",
      failureCode: this.fault?.code ?? null, callsUsed: this.usedCalls,
      limits: { ...this.declaration.limits }, approvalExpiresAt: this.approvalExpiresAt,
      capabilities: [...this.declaration.capabilities],
      isolation: "Linux Bubblewrap only; private invocation files and read-only system runtime, no workspace/home mount or host environment; socket networking denied. The Node V8 heap cap is not a total-process memory/RSS limit." };
  }

  private invalidate(error: NativeExecutableError): NativeExecutableError {
    this.fault ??= error;
    this.active?.abort(this.fault);
    return this.fault;
  }

  revoke(reason: "unloaded" | "revoked" = "revoked"): void {
    this.invalidate(new NativeExecutableError(reason === "unloaded" ? "EXECUTABLE_UNLOADED" : "EXECUTABLE_REVOKED",
      "The executable extension load was stopped. Active execution is cancelled and stale prepared contributions cannot resume it."));
  }

  private remainingLifetime(): number {
    return Math.min(this.declaration.limits.maxLifetimeMs - (performance.now() - this.loadedAt), this.approvalExpiresAt - Date.now());
  }

  assertCurrent(): { policyDigest: string; expiresAt: number } {
    if (this.fault) throw this.fault;
    try {
      if (this.remainingLifetime() <= 0) throw new NativeExecutableError("EXECUTABLE_LIFETIME_EXPIRED", "The bounded executable load lifetime has expired. Review current approval and reload explicitly.");
      readNativeExtension({ workspace: this.snapshot.workspace, manifestPath: this.snapshot.manifestPath, expectedDigest: this.manifestDigest });
      const approval = assertNativeExecutableApproval(this.snapshot.workspace, this.manifestDigest, this.declaration.capabilities);
      assertNativeExecutableInstalled(this.snapshot.workspace, this.module.reference);
      return approval;
    } catch (error) { throw this.invalidate(failure(error)); }
  }

  async invoke(kind: "context" | "command", name: string, input: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<string> {
    this.assertCurrent();
    if (this.active) throw new NativeExecutableError("EXECUTABLE_BUSY", "This extension already has an active invocation. Calls are not queued or retried automatically.");
    if (signal?.aborted) throw new NativeExecutableError("EXECUTABLE_CANCELLED", "The invocation was cancelled before code was launched.");
    if (this.usedCalls >= this.declaration.limits.maxCalls) throw this.invalidate(new NativeExecutableError("EXECUTABLE_CALL_LIMIT", "The executable load exhausted its declared invocation budget. Reload requires an explicit operator action."));
    const selected = kind === "context" ? this.declaration.contexts.find(entry => entry.name === name)
      : Object.hasOwn(this.declaration.commands, name) ? this.declaration.commands[name] : undefined;
    const capability = kind === "context" ? "context.generate" : "command.invoke";
    if (!selected || !this.declaration.capabilities.includes(capability)) {
      throw new NativeExecutableError("EXECUTABLE_CAPABILITY_DENIED", "The signed declaration does not grant this context or command handler.");
    }
    const parsedInput = (kind === "context" ? contextInput : commandInput).safeParse(input);
    if (!parsedInput.success) throw new NativeExecutableError("EXECUTABLE_INPUT_INVALID", "Executable inputs must match the bounded context metadata or command-argument contract; no host session, environment or tool object is accepted.");
    const invocationId = randomUUID();
    const request = JSON.stringify({ invocationId, extensionId: this.id, exportName: selected.export,
      capabilities: this.declaration.capabilities, input: parsedInput.data, maxOutputBytes: this.declaration.limits.maxOutputBytes });
    if (Buffer.byteLength(request) > NATIVE_EXECUTABLE_LIMITS.inputBytes) throw new NativeExecutableError("EXECUTABLE_INPUT_LIMIT", "Executable invocation input exceeds its byte limit.");

    const controller = new AbortController();
    this.active = controller;
    const cancel = () => { controller.abort(new NativeExecutableError("EXECUTABLE_CANCELLED", "The executable invocation was cancelled.")); };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    let directory: string | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      // Seatbelt's existing write-only backend is not a read/network boundary.
      // Neither backend injection nor allowUnconfined is offered by this API.
      const sandbox = new SandboxRunner({ backends: [bwrapBackend()] });
      if (sandbox.select() === null) throw new NativeExecutableError("EXECUTABLE_ISOLATION_UNAVAILABLE", "Executable extensions require AMC's Linux Bubblewrap backend on x64/arm64. This platform has no admitted executable-extension confinement; no code was launched.");
      directory = mkdtempSync(join(realpathSync(tmpdir()), "amc-executable-run-"));
      // The existing backend masks .amc inside its read-only workspace mount;
      // provide that mountpoint without exposing the real authority directory.
      mkdirSync(join(directory, ".amc"), { mode: 0o700 });
      // Copy AMC's actual interpreter into the read-only invocation mount so a
      // Node installed under nvm/home is not granted access to that host tree.
      const node = join(directory, "node");
      copyFileSync(realpathSync(process.execPath), node);
      chmodSync(node, 0o500);
      writeFileSync(join(directory, "extension.mjs"), this.module.source, { flag: "wx", mode: 0o400 });
      writeFileSync(join(directory, "bootstrap.mjs"), NATIVE_EXECUTABLE_BOOTSTRAP, { flag: "wx", mode: 0o400 });
      writeFileSync(join(directory, "request.json"), request, { flag: "wx", mode: 0o400 });
      const approval = this.assertCurrent();
      if (controller.signal.aborted) throw controller.signal.reason;
      const timeoutMs = Math.floor(Math.min(this.declaration.limits.timeoutMs,
        this.remainingLifetime(), approval.expiresAt - Date.now()));
      if (timeoutMs <= 0) throw new NativeExecutableError("EXECUTABLE_LIFETIME_EXPIRED", "The execution approval or load lifetime expired during admission. No code was launched.");
      poll = setInterval(() => { try { this.assertCurrent(); } catch { /* assertCurrent latches refusal and aborts the child */ } }, NATIVE_EXECUTABLE_LIMITS.revocationPollMs);
      deadline = setTimeout(() => this.invalidate(new NativeExecutableError("EXECUTABLE_TIMEOUT", "The executable invocation reached its wall-clock or load-lifetime deadline and was cancelled.")), timeoutMs);
      this.usedCalls++;
      const outcome = await sandbox.run([node, "--max-old-space-size=64", join(directory, "bootstrap.mjs")], directory,
        { writableRoots: [], network: "deny", timeoutMs, signal: controller.signal, sourcePolicySha256: approval.policyDigest });
      if (this.fault) throw this.fault;
      if (controller.signal.aborted || outcome.cancelled) throw new NativeExecutableError("EXECUTABLE_CANCELLED", "The executable invocation was cancelled; no returned contribution is published.");
      if (outcome.timedOut) throw new NativeExecutableError("EXECUTABLE_TIMEOUT", "The executable invocation exceeded its wall-clock deadline.");
      if (outcome.treeExitProven !== true) throw new NativeExecutableError("EXECUTABLE_CLEANUP_UNCONFIRMED", "The executable process tree did not provide a confirmed exit receipt. The load is stopped; no result or retry is admitted.");
      if (!outcome.confined || outcome.backend !== "bwrap" || outcome.failure
        || outcome.enforcement?.network !== "socket-syscalls-denied"
        || outcome.enforcement.hostWrites !== "declared-roots-only" || outcome.writableRoots.length !== 0
        || outcome.enforcement.sourcePolicySha256 !== approval.policyDigest
        || outcome.enforcement.launcherStatus !== "command-exited" || !outcome.enforcement.readonlyRoots.includes(directory)) {
        throw new NativeExecutableError("EXECUTABLE_CONFINEMENT_UNCONFIRMED", "The launcher did not establish the required confinement. No extension result is admitted and no weaker fallback is attempted.");
      }
      if ((outcome.droppedBytes ?? 0) > 0 || Buffer.byteLength(outcome.stdout) > 64_000) {
        throw new NativeExecutableError("EXECUTABLE_OUTPUT_LIMIT", "Executable output exceeded capture limits; truncated responses are never accepted.");
      }
      let response: z.infer<typeof responseSchema>;
      try { response = responseSchema.parse(JSON.parse(outcome.stdout)); }
      catch { throw new NativeExecutableError("EXECUTABLE_PROTOCOL_INVALID", "The executable bootstrap returned an invalid response. Export a declared text handler and keep stdout reserved for the AMC protocol; source and stderr are withheld."); }
      if (response.invocationId !== invocationId) throw new NativeExecutableError("EXECUTABLE_PROTOCOL_INVALID", "The executable response does not match this invocation.");
      if (!response.ok) throw new NativeExecutableError(response.code, "The declared export or its onLoad/onUnload lifecycle failed. Check the bundled ESM handler contract; plugin exception text is withheld.");
      if (outcome.exitCode !== 0) throw new NativeExecutableError("EXECUTABLE_PROCESS_FAILED", "The executable child did not exit successfully; no contribution is published.");
      if (response.output.includes("\0") || Buffer.byteLength(response.output) > this.declaration.limits.maxOutputBytes) {
        throw new NativeExecutableError("EXECUTABLE_OUTPUT_LIMIT", "The executable response exceeds its approved text limit.");
      }
      // Removal, expiry, invalid signatures and revocation also suppress a
      // result that races with completion; stdout cannot attest authority.
      this.assertCurrent();
      return response.output;
    } catch (error) { throw this.invalidate(failure(error)); }
    finally {
      if (poll !== undefined) clearInterval(poll);
      if (deadline !== undefined) clearTimeout(deadline);
      signal?.removeEventListener("abort", cancel);
      this.active = null;
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  }
}
