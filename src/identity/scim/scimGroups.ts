import {
  appendHostAudit,
  applyMembershipRolesFromSource,
  deleteScimGroup,
  findHostUserById,
  listScimGroupMembers,
  listScimGroups,
  openHostDb,
  replaceScimGroupMembers,
  revokeMembershipRolesFromSource,
  upsertScimGroup
} from "../../workspaces/hostDb.js";
import type { IdentityConfig } from "../identityConfig.js";
import { evaluateRoleMapping } from "../roleMapping.js";
import { scimOperationPath } from "./scimPatch.js";

interface ScimGroupRecord {
  id: string;
  displayName: string;
  externalId?: string | null;
  members: Array<{ value: string; display?: string }>;
}

function userMembershipGrants(params: {
  hostDir: string;
  identityConfig: IdentityConfig;
  groupId: string;
  groupDisplayName: string;
  userId: string;
}): Array<{ workspaceId: string; roles: Array<"OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER"> }> {
  const user = findHostUserById(params.hostDir, params.userId);
  if (!user) {
    return [];
  }
  const mapping = evaluateRoleMapping(params.identityConfig, {
    providerId: "SCIM",
    subject: `scim:${params.groupId}:${params.userId}`,
    email: user.email ?? user.username,
    groups: [params.groupDisplayName]
  });
  return mapping.workspaceGrants.map((grant) => ({
    workspaceId: grant.workspaceId,
    roles: grant.roles
  }));
}

function toScimGroup(params: {
  hostDir: string;
  row: { groupId: string; displayName: string; externalId: string | null };
}): ScimGroupRecord {
  const memberIds = listScimGroupMembers(params.hostDir, params.row.groupId);
  return {
    id: params.row.groupId,
    displayName: params.row.displayName,
    externalId: params.row.externalId ?? undefined,
    members: memberIds.map((userId) => {
      const user = findHostUserById(params.hostDir, userId);
      return {
        value: userId,
        display: user?.username
      };
    })
  };
}

export function scimListGroups(hostDir: string): ScimGroupRecord[] {
  return listScimGroups(hostDir).map((row) => toScimGroup({ hostDir, row }));
}

export function scimGetGroup(hostDir: string, groupId: string): ScimGroupRecord | null {
  const row = listScimGroups(hostDir).find((item) => item.groupId === groupId);
  if (!row) {
    return null;
  }
  return toScimGroup({ hostDir, row });
}

export function scimCreateOrReplaceGroup(params: {
  hostDir: string;
  identityConfig: IdentityConfig;
  groupId?: string;
  body: Record<string, unknown>;
  actorTokenId: string;
}): ScimGroupRecord {
  const displayName = typeof params.body.displayName === "string" ? params.body.displayName : "";
  if (!displayName.trim()) {
    throw new Error("SCIM group displayName is required");
  }
  const externalId = typeof params.body.externalId === "string" ? params.body.externalId : null;
  const group = upsertScimGroup({
    hostDir: params.hostDir,
    groupId: params.groupId,
    displayName,
    externalId
  });
  const rawMembers = Array.isArray(params.body.members) ? params.body.members : [];
  const members = rawMembers
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const value = (item as { value?: unknown }).value;
      return typeof value === "string" && value.length > 0 ? value : null;
    })
    .filter((value): value is string => value !== null);
  // Revoke old SCIM_GROUP sourced roles for prior members, then re-apply from this exact membership snapshot.
  const prevMembers = listScimGroupMembers(params.hostDir, group.groupId);
  for (const userId of prevMembers) {
    revokeMembershipRolesFromSource({
      hostDir: params.hostDir,
      userId,
      sourceType: "SCIM_GROUP",
      sourceId: group.groupId
    });
  }
  replaceScimGroupMembers({
    hostDir: params.hostDir,
    groupId: group.groupId,
    userIds: members
  });
  for (const userId of members) {
    const grants = userMembershipGrants({
      hostDir: params.hostDir,
      identityConfig: params.identityConfig,
      groupId: group.groupId,
      groupDisplayName: group.displayName,
      userId
    });
    for (const grant of grants) {
      applyMembershipRolesFromSource({
        hostDir: params.hostDir,
        userId,
        workspaceId: grant.workspaceId,
        roles: grant.roles,
        sourceType: "SCIM_GROUP",
        sourceId: group.groupId
      });
    }
  }
  appendHostAudit(params.hostDir, "SCIM_GROUP_UPDATED", null, {
    actorTokenId: params.actorTokenId,
    groupId: group.groupId,
    memberCount: members.length
  });
  return toScimGroup({ hostDir: params.hostDir, row: group });
}

export function scimPatchGroup(params: {
  hostDir: string;
  identityConfig: IdentityConfig;
  groupId: string;
  operations: Array<{ op: "add" | "remove" | "replace"; path?: string; value?: unknown }>;
  actorTokenId: string;
}): ScimGroupRecord {
  if (!Array.isArray(params.operations) || params.operations.length === 0) {
    throw new Error("invalidValue");
  }
  // Keep the original path for case-sensitive member IDs; validate before database access.
  const operations = params.operations.map((op) => {
    const path = scimOperationPath(op);
    const member = /^members\s*\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i.exec(path);
    if (member && member[0] === path) {
      if (op.op !== "remove") {
        throw new Error("invalidPath");
      }
      if (op.value !== undefined) {
        throw new Error("invalidValue");
      }
      return { op: op.op, ids: [member[1]!] };
    }
    if (path.toLowerCase() !== "members" && path !== "") {
      throw new Error("invalidPath");
    }
    if (op.op === "remove" && op.value === undefined) {
      return { op: op.op, ids: [] };
    }
    const values = Array.isArray(op.value) ? op.value : [op.value];
    const ids = values.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("invalidValue");
      }
      const value = (item as { value?: unknown }).value;
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("invalidValue");
      }
      return value;
    });
    if (op.op === "add" && ids.length === 0) {
      throw new Error("invalidValue");
    }
    return { op: op.op, ids };
  });
  const current = scimGetGroup(params.hostDir, params.groupId);
  if (!current) {
    throw new Error("SCIM group not found");
  }
  let members = new Set(current.members.map((member) => member.value));
  for (const { op, ids } of operations) {
    if (op !== "remove") {
      for (const id of ids) {
        if (!findHostUserById(params.hostDir, id)) {
          throw new Error("invalidValue");
        }
      }
    }
    if (op === "replace") {
      members = new Set(ids);
    } else if (op === "add") {
      for (const id of ids) {
        members.add(id);
      }
    } else if (ids.length === 0) {
      members.clear();
    } else {
      for (const id of ids) {
        members.delete(id);
      }
    }
  }
  return scimCreateOrReplaceGroup({
    hostDir: params.hostDir,
    identityConfig: params.identityConfig,
    groupId: params.groupId,
    body: {
      displayName: current.displayName,
      externalId: current.externalId ?? undefined,
      members: Array.from(members).map((value) => ({ value }))
    },
    actorTokenId: params.actorTokenId
  });
}

export function scimDeleteGroup(params: {
  hostDir: string;
  groupId: string;
  actorTokenId: string;
}): void {
  const members = listScimGroupMembers(params.hostDir, params.groupId);
  for (const userId of members) {
    revokeMembershipRolesFromSource({
      hostDir: params.hostDir,
      userId,
      sourceType: "SCIM_GROUP",
      sourceId: params.groupId
    });
  }
  deleteScimGroup(params.hostDir, params.groupId);
  appendHostAudit(params.hostDir, "SCIM_GROUP_DELETED", null, {
    actorTokenId: params.actorTokenId,
    groupId: params.groupId
  });
}

export function findScimGroupByDisplayName(hostDir: string, displayName: string): { groupId: string } | null {
  const handle = openHostDb(hostDir);
  try {
    const row = handle.db
      .prepare(`SELECT group_id AS groupId FROM scim_groups WHERE lower(display_name) = ?`)
      .get(displayName.trim().toLowerCase()) as { groupId: string } | undefined;
    return row ?? null;
  } finally {
    handle.close();
  }
}
