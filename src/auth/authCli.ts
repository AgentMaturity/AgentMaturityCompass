import { initUsersConfig, addUser, listUsers, revokeUser, setUserRoles, verifyUsersConfigSignature } from "./authApi.js";
import { initUsersConfigAsync, addUserAsync, revokeUserAsync, setUserRolesAsync } from "./authApi.js";
import { parseUserRoles, type UserRole } from "./roles.js";

export function parseRolesCsv(raw: string): UserRole[] {
  const roles = parseUserRoles(raw.split(",").map((value) => value.trim()));
  if (roles.length === 0) {
    throw new Error("at least one valid role is required");
  }
  return roles;
}

export function userInitCli(params: {
  workspace: string;
  username: string;
  password: string;
}): { username: string; roles: UserRole[]; path: string; sigPath: string } {
  const out = initUsersConfig({
    workspace: params.workspace,
    username: params.username,
    password: params.password
  });
  return {
    username: out.owner.username,
    roles: out.owner.roles,
    path: out.path,
    sigPath: out.sigPath
  };
}

export function userAddCli(params: {
  workspace: string;
  username: string;
  roles: UserRole[];
  password: string;
}): { username: string; roles: UserRole[] } {
  const user = addUser(params);
  return {
    username: user.username,
    roles: user.roles
  };
}

export function userListCli(workspace: string): Array<{
  username: string;
  roles: UserRole[];
  status: "ACTIVE" | "REVOKED";
  createdTs: number;
}> {
  return listUsers(workspace).map((user) => ({
    username: user.username,
    roles: user.roles,
    status: user.status,
    createdTs: user.createdTs
  }));
}

export function userRevokeCli(params: {
  workspace: string;
  username: string;
}): { username: string; status: "ACTIVE" | "REVOKED" } {
  const user = revokeUser(params);
  return {
    username: user.username,
    status: user.status
  };
}

export function userRoleSetCli(params: {
  workspace: string;
  username: string;
  roles: UserRole[];
}): { username: string; roles: UserRole[] } {
  const user = setUserRoles(params);
  return {
    username: user.username,
    roles: user.roles
  };
}

export function userVerifyCli(workspace: string): ReturnType<typeof verifyUsersConfigSignature> {
  return verifyUsersConfigSignature(workspace);
}

/** Maintained CLI authoring paths; synchronous wrapper exports above retain their original contracts. */
export async function userInitCliAsync(params: Parameters<typeof userInitCli>[0]): Promise<ReturnType<typeof userInitCli>> {
  const out = await initUsersConfigAsync({ ...params });
  return { username: out.owner.username, roles: out.owner.roles, path: out.path, sigPath: out.sigPath };
}
export async function userAddCliAsync(params: Parameters<typeof userAddCli>[0]): Promise<ReturnType<typeof userAddCli>> {
  const user = await addUserAsync({ ...params, roles: [...params.roles] });
  return { username: user.username, roles: user.roles };
}
export async function userRevokeCliAsync(params: Parameters<typeof userRevokeCli>[0]): Promise<ReturnType<typeof userRevokeCli>> {
  const user = await revokeUserAsync({ ...params }); return { username: user.username, status: user.status };
}
export async function userRoleSetCliAsync(params: Parameters<typeof userRoleSetCli>[0]): Promise<ReturnType<typeof userRoleSetCli>> {
  const user = await setUserRolesAsync({ ...params, roles: [...params.roles] }); return { username: user.username, roles: user.roles };
}
