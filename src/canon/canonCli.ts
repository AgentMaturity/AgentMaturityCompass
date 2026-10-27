import { canonApplyForApi, canonGetForApi, canonInitForApi, canonVerifyForApi, canonInitForApiAsync } from "./canonApi.js";
import { assertOwnerMode } from "../mode/mode.js";
import type { CompassCanon } from "./canonSchema.js";

export function canonVerifyCli(workspace: string) {
  return canonVerifyForApi(workspace);
}

export function canonPrintCli(workspace: string): CompassCanon {
  return canonGetForApi(workspace).canon;
}

export function canonApplyCli(params: {
  workspace: string;
  canon: CompassCanon;
}) {
  return canonApplyForApi(params);
}

export function canonInitCliAsync(workspace: string) {
  return canonInitForApiAsync(workspace, { beforePublish: () => assertOwnerMode(workspace, "canon init") });
}
