import { resolve } from "node:path";
import {
  standardGenerateForApi,
  standardSchemaReadForApi,
  standardSchemasForApi,
  standardValidateForApi,
  standardVerifyForApi
} from "./standardApi.js";

export function standardGenerateCli(workspace: string) {
  return standardGenerateForApi(workspace);
}

export function standardVerifyCli(workspace: string) {
  return standardVerifyForApi(workspace);
}

export function standardPrintCli(params: {
  workspace: string;
  id: string;
}) {
  return standardSchemaReadForApi(params.workspace, params.id);
}

export function standardValidateCli(params: {
  workspace: string;
  schema: string;
  file: string;
}) {
  return standardValidateForApi({
    workspace: params.workspace,
    schemaId: params.schema,
    file: resolve(params.file)
  });
}

export function standardListCli(workspace: string) {
  return standardSchemasForApi(workspace);
}


export { standardGenerateForApiAsync as standardGenerateCliAsync, standardVerifyForApiAsync as standardVerifyCliAsync } from "./standardApi.js";
