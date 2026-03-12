#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

function debugSnapshot(cwd, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  return {
    cwd,
    execPath: process.execPath,
    argv: process.argv,
    NODE_OPTIONS: env.NODE_OPTIONS ?? "",
    npm_execpath: env.npm_execpath ?? "",
    npm_node_execpath: env.npm_node_execpath ?? "",
    yamlDistExists: existsSync(join(cwd, "node_modules/yaml/dist/index.js")),
    chalkSourceExists: existsSync(join(cwd, "node_modules/chalk/source/index.js")),
    yamlPkgExists: existsSync(join(cwd, "node_modules/yaml/package.json")),
    chalkPkgExists: existsSync(join(cwd, "node_modules/chalk/package.json"))
  };
}

function run(cmd, args, cwd, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const before = debugSnapshot(cwd, extraEnv);
  console.error(`[prepack] RUN ${cmd} ${args.join(" ")}`);
  console.error(`[prepack] BEFORE ${JSON.stringify(before)}`);
  const out = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8"
  });
  const after = debugSnapshot(cwd, extraEnv);
  console.error(`[prepack] AFTER ${JSON.stringify(after)}`);
  console.error(`[prepack] EXIT ${out.status}`);
  if (out.status !== 0) {
    throw new Error(
      `Command failed: ${cmd} ${args.join(" ")}\n` +
      `Snapshot(before): ${JSON.stringify(before, null, 2)}\n` +
      `Snapshot(after): ${JSON.stringify(after, null, 2)}\n` +
      `${(out.stdout ?? "") + (out.stderr ?? "")}`
    );
  }
  return out.stdout ?? "";
}

const workspace = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "amc-prepack-"));
const npmCache = join(tmp, "npm-cache");
try {
  const npmEnv = {
    npm_config_cache: npmCache,
    NPM_CONFIG_CACHE: npmCache
  };
  const packStdout = run("npm", ["pack", "--json", "--ignore-scripts"], workspace, npmEnv);
  const packInfo = JSON.parse(packStdout);
  const tgz = packInfo?.[0]?.filename;
  if (!tgz) {
    throw new Error("npm pack did not produce a tarball");
  }

  run("node", ["dist/cli.js", "release", "sbom", "--out", join(tmp, "sbom.cdx.json")], workspace);
  run("node", ["dist/cli.js", "release", "licenses", "--out", join(tmp, "licenses.json")], workspace);
  run("node", ["dist/cli.js", "release", "scan", "--in", join(workspace, tgz)], workspace, npmEnv);

  const keyPair = generateKeyPairSync("ed25519");
  const privatePem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const releaseOut = join(tmp, "prepack.amcrelease");
  run(
    "node",
    ["dist/cli.js", "release", "pack", "--out", releaseOut],
    workspace,
    {
      ...npmEnv,
      AMC_RELEASE_SIGNING_KEY: Buffer.from(privatePem, "utf8").toString("base64")
    }
  );
  run("node", ["dist/cli.js", "release", "verify", releaseOut], workspace, npmEnv);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
