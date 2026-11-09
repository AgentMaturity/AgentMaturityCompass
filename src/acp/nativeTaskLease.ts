import { closeSync, readFileSync } from "node:fs";
import { NATIVE_TASK_LEASE_FD, NATIVE_TASK_LEASE_FD_ENV } from "./acpRuntimeContracts.js";

/**
 * The lease a spawning composer handed this process (P1-67): read once from the inherited pipe the environment names,
 * then the pipe is closed and the name unset, so no tool, check or MCP child inherits either. None without the name;
 * a named pipe that cannot be read throws (the caller answers it as a startup refusal).
 */
export function takeNativeTaskLease(): string | undefined {
  const fd = process.env[NATIVE_TASK_LEASE_FD_ENV];
  delete process.env[NATIVE_TASK_LEASE_FD_ENV];
  if (fd === undefined) return undefined;
  if (fd !== String(NATIVE_TASK_LEASE_FD)) throw new Error(`${NATIVE_TASK_LEASE_FD_ENV} must name fd ${NATIVE_TASK_LEASE_FD}`);
  try {
    return readFileSync(NATIVE_TASK_LEASE_FD, "utf8") || undefined;
  } finally {
    try { closeSync(NATIVE_TASK_LEASE_FD); } catch { /* already closed: the read reported why */ }
  }
}
