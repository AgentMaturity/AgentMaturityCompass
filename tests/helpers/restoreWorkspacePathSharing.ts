import { restoreNativeSecondSharing } from "./restoreNativeSecondSharing.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const manifest = JSON.parse(readFileSync(resolve(
  "unused-code/2026-10-02-main/workspace-path-redaction/restoration.json"), "utf8")) as {
  files: Array<{ originalPath: string; sha256: string; currentSha256: string; name: string;
    importLine: string; beforeBody: string; afterBody: string; currentDeclaration: string }>;
};
const hash = (source: string) => createHash("sha256").update(source).digest("hex");

/** Reverse only the exact, independently tested path-sharing change for older source freezes. */
export function restoreWorkspacePathSharing(file: string, source: string): string {
  source = restoreNativeSecondSharing(file, source);
  const row = manifest.files.find(value => value.originalPath === file);
  if (!row) return source;
  if (hash(source) !== row.currentSha256 || !source.startsWith(row.importLine)) {
    throw new Error("Source changed beyond declared workspace-path sharing: " + file);
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === row.name);
  if (matches.length !== 1 || !ts.isFunctionDeclaration(matches[0]) || !matches[0].body
    || matches[0].getText(ast) !== row.currentDeclaration || matches[0].body.getText(ast) !== row.afterBody) {
    throw new Error("Declared workspace-path wrapper changed: " + file);
  }
  const body = matches[0].body;
  const restored = (source.slice(0, body.getStart(ast)) + row.beforeBody + source.slice(body.end)).slice(row.importLine.length);
  if (hash(restored) !== row.sha256) throw new Error("Workspace-path original does not match: " + file);
  return restored;
}
