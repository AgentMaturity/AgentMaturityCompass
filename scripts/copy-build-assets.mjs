import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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
const cli = join(root, "dist/cli.js");
if (existsSync(cli)) chmodSync(cli, 0o755);
