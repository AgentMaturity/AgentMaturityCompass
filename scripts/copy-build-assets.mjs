import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Use Node filesystem operations so a source build does not require POSIX utilities on Windows.
const root = fileURLToPath(new URL("../", import.meta.url));
for (const [source, destination] of [
  ["src/console/pages", "dist/console/pages"],
  ["src/console/assets", "dist/console/assets"],
  ["src/dashboard/templates", "dist/dashboard/templates"],
]) {
  const target = join(root, destination);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(root, source), target, { recursive: true });
}
mkdirSync(join(root, "dist/trust"), { recursive: true });
cpSync(join(root, "src/trust/amc-distrust.json"), join(root, "dist/trust/amc-distrust.json"));
mkdirSync(join(root, "dist/acp"), { recursive: true });
cpSync(join(root, "vendor/acp-schema/schema.json"), join(root, "dist/acp/acp-schema.json"));
// P2-37: A4 projects its IntegrationClaims from the adapter claim manifests at runtime (src/a4/assemblePaths.ts), and
// docs/ and qualification/ are not in the package: ship each manifest with its qualification record and that folder's
// receipt.json, at their repository paths, so the loader checks the same hashes. A missing file is copied as missing
// (the loader reports it and the claim is not enforced).
const claims = join(root, "dist/adapter-claims");
rmSync(claims, { recursive: true, force: true });
const manifestDir = "docs/adapters/manifests";
for (const name of readdirSync(join(root, manifestDir)).filter((entry) => entry.endsWith(".json")).sort()) {
  const file = `${manifestDir}/${name}`;
  let receipt = null;
  try { receipt = JSON.parse(readFileSync(join(root, file), "utf8")).receipt; } catch { /* the loader reports a manifest that is not JSON */ }
  const paths = [file, ...(typeof receipt === "string" && /^qualification\/[\w.-]+\/[\w.-]+\.json$/.test(receipt) ? [receipt, `${dirname(receipt)}/receipt.json`] : [])];
  for (const path of paths.filter((candidate) => existsSync(join(root, candidate)))) {
    mkdirSync(join(claims, dirname(path)), { recursive: true });
    cpSync(join(root, path), join(claims, path));
  }
}
const cli = join(root, "dist/cli.js");
if (existsSync(cli)) chmodSync(cli, 0o755);
