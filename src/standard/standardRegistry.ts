import { join } from "node:path";
import { ensureDir } from "../utils/fs.js";

export function standardRoot(workspace: string): string {
  return join(workspace, ".amc", "standard");
}

export function standardSchemasDir(workspace: string): string {
  return join(standardRoot(workspace), "schemas");
}

export function standardMetaPath(workspace: string): string {
  return join(standardRoot(workspace), "meta.json");
}

export function standardMetaSigPath(workspace: string): string {
  return `${standardMetaPath(workspace)}.sig`;
}

export function standardBundleSigPath(workspace: string): string {
  return join(standardRoot(workspace), "schemas.sig");
}
