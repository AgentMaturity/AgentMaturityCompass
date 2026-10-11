/**
 * Install-file plumbing shared by the provider hook installers (src/adapters/hookIntegration.ts for the JSON-config
 * providers, src/adapters/hookProviders/pi.ts for Pi): input validation, path safety, the install lock, snapshot and
 * rollback, the managed .gitignore block and lease decoding. Moved verbatim from hookIntegration.ts (P1-22).
 */
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { writeFileAtomic } from "../../utils/fs.js";

export const HOOK_INTEGRATION_ID = "amc-observe-v1";
export const HOOK_CONTROL_INTEGRATION_ID = "amc-control-v1";
export const HOOK_TOKEN_MODE = 0o600;
export const DEFAULT_BRIDGE_BASE = "http://127.0.0.1:3212";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const STALE_INSTALL_LOCK_MS = 5 * 60_000;
const GITIGNORE_MARKER = "# AMC managed hook credentials";
const GITIGNORE_ENTRY = ".amc/hooks/";

export const hookModeSchema = z.enum(["observe", "control"]);
export type HookMode = "observe" | "control";

export type HookIntegrationErrorCode =
  | "HOOK_PROVIDER_UNSUPPORTED"
  | "HOOK_AGENT_INVALID"
  | "HOOK_BRIDGE_INVALID"
  | "HOOK_BRIDGE_INSECURE"
  | "HOOK_CONTROL_REMOTE_UNSUPPORTED"
  | "HOOK_CONTROL_POLICY_INVALID"
  | "HOOK_CONFIG_INVALID"
  | "HOOK_CONFIG_AMBIGUOUS"
  | "HOOK_PATH_UNSAFE"
  | "HOOK_INSTALL_BUSY"
  | "HOOK_MANIFEST_INVALID"
  | "HOOK_OWNERSHIP_CONFLICT"
  | "HOOK_TOKEN_INVALID"
  | "HOOK_INPUT_TOO_LARGE"
  | "HOOK_INPUT_INVALID"
  | "HOOK_INPUT_AMBIGUOUS"
  | "HOOK_INPUT_UNSUPPORTED"
  | "HOOK_CORRELATION_REQUIRED"
  | "HOOK_DELIVERY_FAILED";

export class HookIntegrationError extends Error {
  readonly code: HookIntegrationErrorCode;

  constructor(code: HookIntegrationErrorCode, message: string) {
    super(message);
    this.name = "HookIntegrationError";
    this.code = code;
  }
}

export interface HookFileChange {
  path: string;
  action: "create" | "update" | "delete" | "unchanged" | "would-create" | "would-update" | "would-delete";
  sensitive: boolean;
}

interface FileSnapshot {
  existed: boolean;
  bytes: Buffer | null;
  mode: number;
}

export function parseMode(mode: unknown): HookMode {
  const parsed = hookModeSchema.safeParse(mode ?? "observe");
  if (!parsed.success) {
    throw new HookIntegrationError("HOOK_INPUT_UNSUPPORTED", "hook mode must be observe or control");
  }
  return parsed.data;
}

export function integrationId(mode: HookMode): typeof HOOK_INTEGRATION_ID | typeof HOOK_CONTROL_INTEGRATION_ID {
  return mode === "control" ? HOOK_CONTROL_INTEGRATION_ID : HOOK_INTEGRATION_ID;
}

export function leaseScopes(mode: HookMode): Array<"hook:observe" | "hook:control"> {
  return mode === "control" ? ["hook:observe", "hook:control"] : ["hook:observe"];
}

export function assertControlBridgeLocal(mode: HookMode, bridgeBase: string): void {
  if (mode !== "control") return;
  const host = new URL(bridgeBase).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new HookIntegrationError(
      "HOOK_CONTROL_REMOTE_UNSUPPORTED",
      "control mode keeps raw provider input local and requires a loopback Bridge origin",
    );
  }
}

export function validateAgentId(agentId: string): string {
  if (agentId.length < 1 || agentId.length > 160 || !SAFE_ID.test(agentId)) {
    throw new HookIntegrationError("HOOK_AGENT_INVALID", "agent ID must be a stable 1-160 character identifier");
  }
  return agentId;
}

export function normalizeBridgeBase(raw: string | undefined): string {
  let url: URL;
  try {
    url = new URL((raw ?? DEFAULT_BRIDGE_BASE).trim());
  } catch {
    throw new HookIntegrationError("HOOK_BRIDGE_INVALID", "bridge URL must be an absolute HTTP or HTTPS URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new HookIntegrationError("HOOK_BRIDGE_INVALID", "bridge URL must be an HTTP(S) origin without credentials, query, or fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new HookIntegrationError("HOOK_BRIDGE_INVALID", "bridge URL must not include a path");
  }
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
    throw new HookIntegrationError("HOOK_BRIDGE_INSECURE", "remote hook delivery requires HTTPS");
  }
  return url.origin;
}

export function assertManagedPathSafe(workspaceInput: string, path: string): void {
  const workspace = resolve(workspaceInput);
  const target = resolve(path);
  const rel = relative(workspace, target);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new HookIntegrationError("HOOK_PATH_UNSAFE", "managed hook path escapes the workspace");
  }
  let cursor = workspace;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) continue;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new HookIntegrationError("HOOK_PATH_UNSAFE", `managed hook path contains a symlink: ${cursor}`);
    }
  }
}

export function assertAllPathsSafe(workspace: string, paths: readonly string[]): void {
  for (const path of paths) {
    assertManagedPathSafe(workspace, path);
  }
}

export function snapshot(path: string): FileSnapshot {
  if (!existsSync(path)) return { existed: false, bytes: null, mode: 0o644 };
  return {
    existed: true,
    bytes: readFileSync(path),
    mode: statSync(path).mode & 0o777
  };
}

export function restore(path: string, before: FileSnapshot): void {
  if (!before.existed) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  writeFileAtomic(path, before.bytes ?? Buffer.alloc(0), before.mode);
}

export function withInstallLock<T>(workspace: string, lockPath: string, run: () => T): T {
  assertManagedPathSafe(workspace, lockPath);
  mkdirSync(dirname(lockPath), { recursive: true });
  let fd: number;
  try {
    fd = openSync(lockPath, "wx", 0o600);
  } catch {
    try {
      if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > STALE_INSTALL_LOCK_MS) {
        unlinkSync(lockPath);
        fd = openSync(lockPath, "wx", 0o600);
      } else {
        throw new Error("active lock");
      }
    } catch {
      throw new HookIntegrationError("HOOK_INSTALL_BUSY", `hook integration is already being changed: ${lockPath}`);
    }
  }
  try {
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, createdTs: Date.now() })}\n`, "utf8");
    return run();
  } finally {
    closeSync(fd);
    try { unlinkSync(lockPath); } catch { /* best-effort lock cleanup */ }
  }
}

export function relativePortable(workspace: string, path: string): string {
  return relative(resolve(workspace), resolve(path)).split(sep).join("/");
}

function managedIgnoreBlock(newline = "\n"): string {
  return `${GITIGNORE_MARKER}${newline}${GITIGNORE_ENTRY}${newline}`;
}

export function hasManagedIgnoreBlock(raw: string | null): boolean {
  if (raw === null) return false;
  const lines = raw.split(/\r?\n/);
  return lines.some((line, index) => line === GITIGNORE_MARKER && lines[index + 1] === GITIGNORE_ENTRY);
}

export function addManagedIgnoreBlock(raw: string | null): string {
  if (hasManagedIgnoreBlock(raw)) return raw!;
  const newline = raw?.includes("\r\n") ? "\r\n" : "\n";
  const prefix = raw && raw.length > 0
    ? raw.endsWith("\n") ? raw : `${raw}${newline}`
    : "";
  return `${prefix}${managedIgnoreBlock(newline)}`;
}

export function removeManagedIgnoreBlock(raw: string): string {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = raw.endsWith("\n");
  const lines = raw.split(/\r?\n/);
  const markerIndex = lines.findIndex((line, index) => line === GITIGNORE_MARKER && lines[index + 1] === GITIGNORE_ENTRY);
  if (markerIndex < 0) return raw;
  lines.splice(markerIndex, 2);
  while (lines.length > 1 && lines.at(-1) === "" && lines.at(-2) === "") lines.pop();
  let next = lines.join(newline);
  if (hadTrailingNewline && next.length > 0 && !next.endsWith(newline)) next += newline;
  return next;
}

export function ignoreBlockHash(): string {
  return sha256Hex(managedIgnoreBlock("\n"));
}

export function fileChange(path: string, sensitive: boolean, before: FileSnapshot, next: Buffer | null, dryRun: boolean): HookFileChange {
  const unchanged = before.existed === (next !== null) && (
    next === null || (before.bytes !== null && before.bytes.equals(next))
  );
  if (unchanged) return { path, action: "unchanged", sensitive };
  if (dryRun) {
    return {
      path,
      action: next === null ? "would-delete" : before.existed ? "would-update" : "would-create",
      sensitive
    };
  }
  return {
    path,
    action: next === null ? "delete" : before.existed ? "update" : "create",
    sensitive
  };
}

export function decodeLeasePayload(token: string): unknown {
  const [payloadPart] = token.split(".");
  if (!payloadPart) throw new HookIntegrationError("HOOK_TOKEN_INVALID", "issued lease token has no payload");
  const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
  } catch {
    throw new HookIntegrationError("HOOK_TOKEN_INVALID", "issued lease payload is invalid");
  }
}
