#!/usr/bin/env node
// P1-01: spec/schemas/ is generated from the zod schemas AMC parses with (dist/contracts/index.js; build first).
//   --write  regenerate spec/schemas/v1/*.schema.json and spec/schemas/index.json
//   --check  fail when a committed file differs from a fresh generation, and when a contract fixture under
//            tests/fixtures/contracts/<name>/{valid,invalid}/ is judged differently by zod and by Ajv's 2020-12 build,
//            or differently from its folder
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(root, "spec/schemas");
const fixturesDir = join(root, "tests/fixtures/contracts");
const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  console.error("usage: node scripts/gen-spec-schemas.mjs --write|--check");
  process.exit(2);
}
const distEntry = join(root, "dist/contracts/index.js");
if (!existsSync(distEntry)) {
  console.error("gen-spec-schemas: dist/contracts/index.js is missing: run npm run build first");
  process.exit(2);
}
const { CONTRACTS, publishedSchemas, serializeSchema } = await import(pathToFileURL(distEntry).href);

const expected = new Map();
const index = [];
for (const { name, $id, schema } of publishedSchemas()) {
  const bytes = serializeSchema(schema);
  expected.set(`v1/${name}`, bytes);
  index.push({ name, $id, sha256: createHash("sha256").update(bytes).digest("hex") });
}
expected.set("index.json", serializeSchema({ version: 1, schemas: index }));
const committed = existsSync(join(specDir, "v1")) ? readdirSync(join(specDir, "v1")).map((name) => `v1/${name}`) : [];

if (mode === "--write") {
  for (const path of committed) if (!expected.has(path)) rmSync(join(specDir, path));
  mkdirSync(join(specDir, "v1"), { recursive: true });
  for (const [path, bytes] of expected) writeFileSync(join(specDir, path), bytes);
  console.log(`gen-spec-schemas: wrote ${expected.size - 1} schemas and spec/schemas/index.json`);
  process.exit(0);
}

const failures = [];
for (const [path, bytes] of expected) {
  const file = join(specDir, path);
  if (!existsSync(file) || readFileSync(file, "utf8") !== bytes) failures.push(`spec/schemas/${path} is stale: run npm run gen:schemas`);
}
for (const path of committed) if (!expected.has(path)) failures.push(`spec/schemas/${path} is not generated: run npm run gen:schemas`);

const Ajv2020 = createRequire(import.meta.url)("ajv/dist/2020.js").default;
// The `pattern` zod emits next to `format: "date-time"` carries the timestamp rule, so formats are not re-checked.
const ajv = new Ajv2020({ allErrors: true, validateFormats: false });
const schemaById = new Map(publishedSchemas().map((row) => [row.name, row.schema]));
let fixtureCount = 0;
for (const name of existsSync(fixturesDir) ? readdirSync(fixturesDir) : []) {
  const contract = CONTRACTS[name];
  if (!contract) {
    failures.push(`tests/fixtures/contracts/${name} names no contract`);
    continue;
  }
  const validate = ajv.compile(schemaById.get(`${name}.schema.json`));
  for (const verdict of ["valid", "invalid"]) {
    const dir = join(fixturesDir, name, verdict);
    for (const file of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []) {
      fixtureCount += 1;
      const value = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const byZod = contract.schema.safeParse(value).success;
      const byAjv = validate(value);
      const where = `tests/fixtures/contracts/${name}/${verdict}/${file}`;
      if (byZod !== byAjv) failures.push(`${where}: zod says ${byZod ? "valid" : "invalid"}, the published schema says ${byAjv ? "valid" : "invalid"}`);
      else if (byZod !== (verdict === "valid")) failures.push(`${where}: expected ${verdict}, both say ${byZod ? "valid" : "invalid"}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`gen-spec-schemas: ${expected.size - 1} schemas current; ${fixtureCount} contract fixtures agree`);
