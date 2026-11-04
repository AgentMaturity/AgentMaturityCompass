import { assertOwnerMode } from "../mode/mode.js";
import { cgxInitForApiAsync, cgxBuildForApiAsync, cgxPolicyApplyForApiAsync, cgxPolicyForApiAsync } from "./cgxApi.js";
import {
  cgxBuildForApi,
  cgxInitForApi,
  cgxLatestGraphForApi,
  cgxLatestPackForApi,
  cgxPolicyApplyForApi,
  cgxPolicyForApi,
  cgxVerifyForApi
} from "./cgxApi.js";
import type { CgxPolicy } from "./cgxSchema.js";

export function cgxBuildCli(params: {
  workspace: string;
  scope: "workspace" | "agent";
  id?: string;
}) {
  return cgxBuildForApi({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.id
  });
}

export function cgxVerifyCli(workspace: string) {
  return cgxVerifyForApi(workspace);
}

export function cgxShowCli(params: {
  workspace: string;
  scope: "workspace" | "agent";
  id?: string;
  format: "graph" | "pack";
}) {
  if (params.format === "pack") {
    return cgxLatestPackForApi({
      workspace: params.workspace,
      agentId: params.id
    });
  }
  return cgxLatestGraphForApi({
    workspace: params.workspace,
    scope: params.scope,
    targetId: params.id
  });
}

export function cgxPolicyPrintCli(workspace: string): CgxPolicy {
  return cgxPolicyForApi(workspace).policy;
}

export function cgxPolicyApplyCli(params: {
  workspace: string;
  policy: CgxPolicy;
}) {
  return cgxPolicyApplyForApi(params);
}

export async function cgxInitCliAsync(workspace: string) { return cgxInitForApiAsync(workspace, { beforePublish: () => assertOwnerMode(workspace, "cgx init") }); }
export async function cgxBuildCliAsync(params: Parameters<typeof cgxBuildCli>[0]) {
  const own = { ...params }; return cgxBuildForApiAsync({ workspace: own.workspace, scope: own.scope, targetId: own.id }, { beforePublish: () => assertOwnerMode(own.workspace, "cgx build") });
}
