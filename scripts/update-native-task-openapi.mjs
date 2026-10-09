// Publish the native Studio contract and the A4 Forge routes (P1-57) into the public OpenAPI 3.0 document.
// Run after building: node scripts/update-native-task-openapi.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { nativeTaskEndpoints, nativeTaskSchemas } from "../dist/studio/nativeTaskOpenapi.js";
import { a4Endpoints, a4Schemas } from "../dist/studio/a4Openapi.js";
import { API_RESULT_ROUTES, withClaimResponses } from "../dist/api/resultRouteRegistry.js";

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
    if (branches.length !== 1) throw new Error("Unsupported nullable OpenAPI union");
    if (typeof branches[0].$ref === "string") {
      // OpenAPI 3.0 ignores siblings of $ref, and nullable only applies to a
      // type in the same schema. Keep the referenced constraints and represent
      // null with a separate branch whose enum excludes every object value.
      // https://spec.openapis.org/oas/v3.0.3.html#schema-object
      result.oneOf = [branches[0], { type: "object", nullable: true, enum: [null] }];
    } else {
      if (!branches[0].type) throw new Error("Unsupported nullable OpenAPI union");
      delete result.oneOf;
      Object.assign(result, branches[0], { nullable: true });
    }
  }
  return result;
}

const authNames = { adminToken: "amcAdminToken", sessionCookie: "amcSessionCookie" };
const publicPaths = (endpoints) => Object.fromEntries(Object.entries(endpoints).map(([path, methods]) => [
  path.replace(/^\/api\//, "/"),
  Object.fromEntries(Object.entries(methods).map(([method, operation]) => [method, {
    ...schema30(operation),
    security: operation.security.map(requirement => Object.fromEntries(Object.entries(requirement).map(([name, scopes]) => {
      if (!authNames[name]) throw new Error(`Unknown native security scheme: ${name}`);
      return [authNames[name], scopes];
    })))
  }]))
]));
const paths = publicPaths(nativeTaskEndpoints());
// A4 result routes reference ClaimResult exactly as the generated spec does (one claim per result).
const a4Paths = publicPaths(withClaimResponses(a4Endpoints(), API_RESULT_ROUTES, true));

function publishBlock(source, kind, value, indent, insert, label = "NATIVE TASK") {
  const start = `${" ".repeat(indent)}# BEGIN GENERATED ${label} ${kind}\n`;
  const end = `${" ".repeat(indent)}# END GENERATED ${label} ${kind}\n`;
  const block = start + YAML.stringify(value, { lineWidth: 110 }).split("\n").filter(Boolean)
    .map(line => " ".repeat(indent) + line).join("\n") + "\n" + end;
  const from = source.indexOf(start);
  if (from < 0) {
    if (source.includes(end)) throw new Error(`Unpaired ${label} ${kind} marker`);
    return insert(source, block);
  }
  const to = source.indexOf(end, from + start.length);
  if (to < 0 || source.indexOf(start, from + start.length) >= 0) throw new Error(`Invalid ${label} ${kind} markers`);
  return source.slice(0, from) + block + source.slice(to + end.length);
}

const path = fileURLToPath(new URL("../website/openapi.yaml", import.meta.url));
const original = readFileSync(path, "utf8");
const document = YAML.parse(original);
if (document.openapi !== "3.0.3") throw new Error("Review the native publisher for the new public OpenAPI version");
const insertSchemas = (source, block) => {
  if (!source.includes("\ntags:\n")) throw new Error("Missing public schema insertion boundary");
  return source.replace("\ntags:\n", `\n${block}\ntags:\n`);
};
const appendPaths = (source, block) => {
  if (Object.keys(document).at(-1) !== "paths") throw new Error("Public paths must be the final section");
  return source.trimEnd() + "\n" + block;
};
let output = publishBlock(original, "SCHEMAS", schema30(nativeTaskSchemas()), 4, insertSchemas);
output = publishBlock(output, "PATHS", paths, 2, appendPaths);
output = publishBlock(output, "SCHEMAS", schema30(a4Schemas()), 4, insertSchemas, "A4");
output = publishBlock(output, "PATHS", a4Paths, 2, appendPaths, "A4");
const proofHeaders = paths["/v1/native-tasks"].post.parameters.filter(parameter => parameter.in === "header");
for (const action of ["decide", "cancel"]) {
  output = publishBlock(output, `APPROVAL ${action.toUpperCase()} HEADERS`, proofHeaders, 8, (source, block) => {
    const boundary = `\n  /approvals/requests/{id}/${action}:\n`;
    const start = source.indexOf(boundary);
    if (start < 0) throw new Error(`Missing approval ${action} operation`);
    const end = source.indexOf("\n  /", start + boundary.length);
    const section = source.slice(start, end < 0 ? undefined : end);
    const id = "        - { name: id, in: path, required: true, schema: { type: string } }\n";
    if (!section.includes(id)) throw new Error(`Missing approval ${action} parameter insertion boundary`);
    return source.slice(0, start) + section.replace(id, id + block) + (end < 0 ? "" : source.slice(end));
  });
}
if (process.argv.includes("--check")) {
  if (output !== original) throw new Error("Public native task contract is stale; run the publisher after building");
} else if (output !== original) {
  writeFileSync(path, output);
}
