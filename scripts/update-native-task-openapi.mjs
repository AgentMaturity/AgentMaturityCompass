// Publish the native Studio contract into the public OpenAPI 3.0 document.
// Run after building: node scripts/update-native-task-openapi.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { nativeTaskEndpoints, nativeTaskSchemas } from "../dist/studio/nativeTaskOpenapi.js";

function schema30(value) {
  if (Array.isArray(value)) return value.map(schema30);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, schema30(child)]));
  if (Array.isArray(result.type)) {
    const types = result.type.filter(type => type !== "null");
    if (types.length !== 1 || !result.type.includes("null")) throw new Error("Unsupported OpenAPI type union");
    result.type = types[0];
    result.nullable = true;
  }
  if (Object.hasOwn(result, "const")) {
    result.enum = [result.const];
    delete result.const;
  }
  if (result.oneOf?.some(branch => branch.type === "null")) {
    const branches = result.oneOf.filter(branch => branch.type !== "null");
    if (branches.length !== 1 || !branches[0].type) throw new Error("Unsupported nullable OpenAPI union");
    delete result.oneOf;
    Object.assign(result, branches[0], { nullable: true });
  }
  return result;
}

const authNames = { adminToken: "amcAdminToken", sessionCookie: "amcSessionCookie" };
const paths = Object.fromEntries(Object.entries(nativeTaskEndpoints()).map(([path, methods]) => [
  path.replace(/^\/api\//, "/"),
  Object.fromEntries(Object.entries(methods).map(([method, operation]) => [method, {
    ...schema30(operation),
    security: operation.security.map(requirement => Object.fromEntries(Object.entries(requirement).map(([name, scopes]) => {
      if (!authNames[name]) throw new Error(`Unknown native security scheme: ${name}`);
      return [authNames[name], scopes];
    })))
  }]))
]));

function publishBlock(source, kind, value, indent, insert) {
  const start = `${" ".repeat(indent)}# BEGIN GENERATED NATIVE TASK ${kind}\n`;
  const end = `${" ".repeat(indent)}# END GENERATED NATIVE TASK ${kind}\n`;
  const block = start + YAML.stringify(value, { lineWidth: 110 }).split("\n").filter(Boolean)
    .map(line => " ".repeat(indent) + line).join("\n") + "\n" + end;
  const from = source.indexOf(start);
  if (from < 0) {
    if (source.includes(end)) throw new Error(`Unpaired native ${kind} marker`);
    return insert(source, block);
  }
  const to = source.indexOf(end, from + start.length);
  if (to < 0 || source.indexOf(start, from + start.length) >= 0) throw new Error(`Invalid native ${kind} markers`);
  return source.slice(0, from) + block + source.slice(to + end.length);
}

const path = fileURLToPath(new URL("../website/openapi.yaml", import.meta.url));
const original = readFileSync(path, "utf8");
const document = YAML.parse(original);
if (document.openapi !== "3.0.3") throw new Error("Review the native publisher for the new public OpenAPI version");
let output = publishBlock(original, "SCHEMAS", schema30(nativeTaskSchemas()), 4, (source, block) => {
  if (!source.includes("\ntags:\n")) throw new Error("Missing public schema insertion boundary");
  return source.replace("\ntags:\n", `\n${block}\ntags:\n`);
});
output = publishBlock(output, "PATHS", paths, 2, (source, block) => {
  if (Object.keys(document).at(-1) !== "paths") throw new Error("Public paths must be the final section");
  return source.trimEnd() + "\n" + block;
});
if (process.argv.includes("--check")) {
  if (output !== original) throw new Error("Public native task contract is stale; run the publisher after building");
} else if (output !== original) {
  writeFileSync(path, output);
}
