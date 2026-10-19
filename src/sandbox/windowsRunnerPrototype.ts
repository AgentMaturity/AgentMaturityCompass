import { randomUUID } from "node:crypto";
import { z } from "zod";

/** P2-14 cut-first prototype. No Windows boundary or native shell is enabled. */
export interface WindowsPrototypeRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  /** Opaque synthetic equality binding; not a verified signed policy. */
  readonly policySha256: string;
}

export interface FakeTokenApi {
  /** A pure prerequisite check; no resource allocation. */
  available(): { readonly ok: true } | { readonly ok: false };
  run(request: WindowsPrototypeRequest & { readonly callNonce: string }): Promise<unknown>;
  /** Owns partial fake resources even when run rejects. */
  cleanup(): Promise<void>;
}

type WindowsPrototypeReason =
  | "unsupported-platform" | "prototype-not-qualified"
  | "invalid-request" | "api-unavailable" | "api-failure"
  | "status-missing" | "status-invalid" | "status-mismatch" | "cleanup-failed"
  | "simulation-complete";

export interface WindowsPrototypeResult {
  readonly kind: "refused" | "simulation-complete";
  readonly reason: WindowsPrototypeReason;
  readonly claimKind: "none" | "synthetic_example";
  readonly confined: false;
  readonly treeExitProven: false;
  readonly exitCode: null;
  readonly simulatedExitCode: number | null;
  readonly measurement: "not-measured";
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const argument = z.string().max(32_768).refine(value => !value.includes("\0"));
const requestSchema = z.object({
  argv: z.array(argument).min(1).max(256).refine(argv => argv[0]!.length > 0
    && argv.reduce((size, value) => size + Buffer.byteLength(value, "utf8"), 0) <= 64_000),
  cwd: z.string().min(1).max(4096).refine(value => !value.includes("\0")),
  policySha256: digest
}).strict();
const childId = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const exitCode = z.number().int().min(0).max(0xffff_ffff);
const statusSchema = z.object({
  version: z.literal(1), callNonce: z.string().uuid(), childId,
  policySha256: digest, exitCode
}).strict();
// Extra transport fields (including claimed enforcement or stdout) are discarded.
const transportSchema = z.object({
  childId, launcherExitCode: exitCode, statusBytes: z.instanceof(Uint8Array).nullable().optional()
});

function result(reason: WindowsPrototypeReason, claimKind: "none" | "synthetic_example",
  simulatedExitCode: number | null = null): WindowsPrototypeResult {
  return { kind: reason === "simulation-complete" ? "simulation-complete" : "refused",
    reason, claimKind, confined: false, treeExitProven: false, exitCode: null,
    simulatedExitCode, measurement: "not-measured" };
}

/** The real host entry has no injected platform, token API, native launcher or fallback. */
export async function runWindowsTokenPrototype(_request: WindowsPrototypeRequest): Promise<WindowsPrototypeResult> {
  return result(process.platform === "win32" ? "prototype-not-qualified" : "unsupported-platform", "none");
}

function validateReply(reply: unknown, invocation: WindowsPrototypeRequest & { readonly callNonce: string }): WindowsPrototypeResult {
  const transport = transportSchema.safeParse(reply);
  if (!transport.success) return result("status-invalid", "synthetic_example");
  const received = transport.data.statusBytes;
  if (received === null || received === undefined) return result("status-missing", "synthetic_example");
  const size = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!.call(received) as number;
  if (size === 0) return result("status-missing", "synthetic_example");
  if (size > 64_000) return result("status-invalid", "synthetic_example");
  // Copy the status channel once before decoding; never trust later mutations of the fake reply.
  const captured = Buffer.alloc(size);
  Uint8Array.prototype.set.call(captured, received);
  if (captured.length > 64_000) return result("status-invalid", "synthetic_example");
  const text = captured.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(captured)) return result("status-invalid", "synthetic_example");
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { return result("status-invalid", "synthetic_example"); }
  const status = statusSchema.safeParse(value);
  if (!status.success) return result("status-invalid", "synthetic_example");
  if (status.data.callNonce !== invocation.callNonce || status.data.policySha256 !== invocation.policySha256
    || status.data.childId !== transport.data.childId || status.data.exitCode !== transport.data.launcherExitCode) {
    return result("status-mismatch", "synthetic_example");
  }
  return result("simulation-complete", "synthetic_example", status.data.exitCode);
}

/** Explicitly synthetic protocol exercise; never a SandboxBackend or native receipt. */
export async function exerciseWindowsTokenProtocol(request: WindowsPrototypeRequest, api: FakeTokenApi): Promise<WindowsPrototypeResult> {
  let invocation: WindowsPrototypeRequest & { readonly callNonce: string };
  try {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) return result("invalid-request", "synthetic_example");
    invocation = Object.freeze({ ...parsed.data, argv: Object.freeze([...parsed.data.argv]), callNonce: randomUUID() });
  } catch { return result("invalid-request", "synthetic_example"); }

  let run: FakeTokenApi["run"], cleanup: FakeTokenApi["cleanup"];
  try {
    if (!api || typeof api !== "object") return result("api-unavailable", "synthetic_example");
    const available = api.available;
    run = api.run; cleanup = api.cleanup;
    if (typeof available !== "function" || typeof run !== "function" || typeof cleanup !== "function") {
      return result("api-unavailable", "synthetic_example");
    }
    const prerequisite = z.object({ ok: z.literal(true) }).strict().safeParse(available.call(api));
    if (!prerequisite.success) return result("api-unavailable", "synthetic_example");
  } catch { return result("api-failure", "synthetic_example"); }

  let outcome: WindowsPrototypeResult;
  try {
    outcome = validateReply(await run.call(api, invocation), invocation);
  } catch { outcome = result("api-failure", "synthetic_example"); }
  finally {
    // A rejected run may own partial fake resources. Cleanup is attempted once, never an OS-kill proof.
    try { await cleanup.call(api); }
    catch { outcome = result("cleanup-failed", "synthetic_example"); }
  }
  return outcome;
}
