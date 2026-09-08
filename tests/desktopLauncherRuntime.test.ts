import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test.skipIf(process.platform === "win32")("macOS launcher preserves an operator-selected runtime before Finder fallbacks", () => {
  const directory = mkdtempSync(join(tmpdir(), "amc-launcher-runtime-"));
  try {
    const selectedNode = join(directory, "node");
    writeFileSync(selectedNode, "#!/bin/sh\nprintf '%s' selected-runtime\n", { mode: 0o755 });
    const source = readFileSync(resolve("scripts/package-desktop-installers.mjs"), "utf8");
    const pathSetup = source.match(/^export PATH="[^"]+"$/m)?.[0];
    expect(pathSetup).toBeDefined();
    // Execute the production launcher's PATH setup and a real executable lookup.
    // Prepending a globally installed Node used to override this explicit choice.
    const result = spawnSync("/bin/sh", ["-c", `${pathSetup}\nnode`], {
      env: { PATH: `${directory}:/usr/bin:/bin` }, encoding: "utf8"
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("selected-runtime");
    expect(result.stderr).toBe("");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
