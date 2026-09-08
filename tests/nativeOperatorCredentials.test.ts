import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { credentialRef } from "../src/credentials/credentialRef.js";

const roots: string[] = [], stores: LocalCredentialsService[] = [];
const ref = credentialRef("AMC_OPERATOR_FIXTURE_KEY");
function fixture(includeDotenv?: boolean, env: NodeJS.ProcessEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "amc-operator-creds-")); roots.push(root);
  const project = join(root, "project"), file = join(root, ".credentials.yaml"), user = join(root, "user.env");
  mkdirSync(project);
  writeFileSync(join(project, ".env"), "AMC_OPERATOR_FIXTURE_KEY=synthetic-project-canary\n");
  writeFileSync(user, "AMC_OPERATOR_FIXTURE_KEY=synthetic-user-canary\n");
  const store = new LocalCredentialsService({ homeDir: root, path: file, projectDir: project, userEnvPath: user,
    includeDotenv, env, watch: false }); stores.push(store);
  return { store, file, project, user };
}
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("ordinary callers retain layered lookup, while operator mode cannot adopt either dotenv source", () => {
  const ordinary = fixture(), operator = fixture(false);
  expect(ordinary.store.resolve(ref)).toBe("synthetic-project-canary");
  expect(ordinary.store.describe(ref).source).toBe("project-env");
  expect(operator.store.resolve(ref)).toBeNull();
  expect(operator.store.describe(ref)).toEqual({ configured: false, source: null, writable: true });
  rmSync(join(ordinary.project, ".env")); ordinary.store.reload();
  expect(ordinary.store.resolve(ref)).toBe("synthetic-user-canary");
  rmSync(join(operator.project, ".env")); operator.store.reload();
  expect(operator.store.resolve(ref)).toBeNull();
});

test("operator exclusion survives explicit reload and credential writes/unsets", async () => {
  const f = fixture(false);
  await f.store.set(ref, "synthetic-operator-file-value");
  expect(f.store.resolve(ref)).toBe("synthetic-operator-file-value");
  expect(f.store.describe(ref).source).toBe("file");
  writeFileSync(join(f.project, ".env"), "AMC_OPERATOR_FIXTURE_KEY=synthetic-replacement-project\n");
  await f.store.unset(ref);
  expect(f.store.resolve(ref)).toBeNull();
  f.store.reload();
  expect(f.store.resolve(ref)).toBeNull();
  expect(JSON.stringify(f.store.describe(ref))).not.toContain("synthetic-");
});

test("intentional environment credentials retain priority without reviving dotenv after removal", () => {
  const env: NodeJS.ProcessEnv = { AMC_OPERATOR_FIXTURE_KEY: "synthetic-operator-env-value" };
  const f = fixture(false, env);
  expect(f.store.describe(ref)).toEqual({ configured: true, source: "env", writable: false });
  expect(f.store.resolve(ref)).toBe("synthetic-operator-env-value");
  delete env.AMC_OPERATOR_FIXTURE_KEY;
  f.store.reload();
  expect(f.store.resolve(ref)).toBeNull();
  expect(f.store.describe(ref).source).toBeNull();
});
