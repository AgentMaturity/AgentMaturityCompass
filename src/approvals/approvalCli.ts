import type { ExecutionMode } from "../types.js";
import { parseApprovalInboxStatus } from "./approvalInbox.js";
import type { ApprovalRequestStatus } from "./approvalChainStore.js";
import { parseUserRoles, type UserRole } from "../auth/roles.js";

export function parseApprovalStatus(value?: string): ApprovalRequestStatus | undefined {
  return parseApprovalInboxStatus(value);
}

export function parseApprovalMode(value: string): ExecutionMode {
  const normalized = value.trim().toUpperCase();
  if (normalized === "SIMULATE" || normalized === "EXECUTE") {
    return normalized;
  }
  throw new Error(`Invalid approval mode: ${value}`);
}

export function parseApprovalReviewerRoles(value: string): UserRole[] {
  const tokens = value.split(",").map((role) => role.trim()).filter((role) => role.length > 0);
  const roles = parseUserRoles(tokens);
  if (tokens.length === 0 || roles.length !== new Set(tokens.map((role) => role.toUpperCase())).size) {
    throw new Error(`Invalid approval reviewer roles: ${value}`);
  }
  return roles;
}
