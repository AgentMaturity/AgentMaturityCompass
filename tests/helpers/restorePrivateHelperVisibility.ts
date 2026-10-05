import { restoreWorkspacePathSharing } from "./restoreWorkspacePathSharing.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type DeclaredVisibilityChange = {
  name: string;
  originalDeclaration: string;
  bodySha256: string;
};
const manifest = JSON.parse(readFileSync(resolve(
  "unused-code/2026-10-02-main/private-module-helpers/restoration.json"), "utf8")) as {
  files: Array<{ originalPath: string; sha256: string; declarations: DeclaredVisibilityChange[] }>;
};
const hash = (source: string) => createHash("sha256").update(source).digest("hex");

/** Undo only the declared visibility change before an earlier scope's strict source freeze. */
export function restorePrivateHelperVisibility(file: string, source: string): string {
  source = restoreWorkspacePathSharing(file, source);
  const row = manifest.files.find(value => value.originalPath === file);
  if (!row) return source;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const positions: number[] = [];
  for (const declaration of row.declarations) {
    const matches = ast.statements.filter(statement => ts.isFunctionDeclaration(statement)
      && statement.name?.text === declaration.name);
    if (matches.length !== 1 || !ts.isFunctionDeclaration(matches[0])) {
      throw new Error("Declared private helper missing: " + file + ":" + declaration.name);
    }
    const node = matches[0];
    if (node.getText(ast) !== declaration.originalDeclaration.replace(/^export /, "")
      || !node.body || hash(node.body.getText(ast)) !== declaration.bodySha256
      || node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      throw new Error("Private helper changed beyond its declared visibility: " + file + ":" + declaration.name);
    }
    positions.push(node.getStart(ast));
  }
  let restored = source;
  for (const position of positions.sort((a, b) => b - a)) {
    restored = restored.slice(0, position) + "export " + restored.slice(position);
  }
  if (hash(restored) !== row.sha256) throw new Error("Whole source changed outside declared helper visibility: " + file);
  return restored;
}
