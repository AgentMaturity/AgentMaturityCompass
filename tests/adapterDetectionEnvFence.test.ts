import { mkdtempSync, rmSync, writeFileSync, chmodSync, realpathSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectAdapter } from "../src/adapters/adapterDetection.js";
import { PROVIDER_KEY_ENV_NAMES } from "../src/utils/providerKeys.js";
import type { AdapterDefinition } from "../src/adapters/adapterTypes.js";
import { builtInAdapterCapabilities } from "../src/adapters/adapterCapabilities.js";

/**
 * Detection probes an UNVETTED binary. It must not hand it AMC's keys.
 *
 * `detectAdapter` runs `<candidate> --version` for every candidate of every
 * adapter — `amc adapters list` alone probes the whole builtin catalogue. The
 * candidates are bare names resolved off PATH (`claude`, `codex`, `sh`), so the
 * program that answers is whatever PATH says it is, which is exactly the case
 * where the environment must be fenced.
 *
 * `src/ledger/monitor.ts` already fences its own version probe and says why. This
 * pins the same rule for the adapter probe, which did not have it.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** A "foreign CLI" that reports the environment it was handed. */
function fakeCliOnPath(name: string): { dir: string; outFile: string } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-probe-fence-")));
  dirs.push(dir);
  const outFile = join(dir, "seen-env.txt");
  const script = join(dir, name);
  writeFileSync(script, `#!/bin/sh\nenv > ${JSON.stringify(outFile)}\necho "1.2.3"\n`, "utf8");
  chmodSync(script, 0o755);
  return { dir, outFile };
}

function definitionFor(command: string): AdapterDefinition {
  return {
    id: "probe-fence-test",
    displayName: "Probe Fence Test",
    kind: "CLI",
    detection: {
      commandCandidates: [command],
      versionArgs: ["--version"],
      parseVersionRegex: "([0-9]+(?:\\.[0-9]+){0,2})"
    },
    providerFamily: "OPENAI_COMPAT",
    defaultRunMode: "SUPERVISE",
    envStrategy: { leaseCarrier: "ENV_API_KEY" },
    commandTemplate: { executable: command, args: [], supportsStdin: false },
    capabilities: builtInAdapterCapabilities({ versionSource: "shell_runtime", evidenceRefs: [] })
  } as AdapterDefinition;
}

describe("the adapter version probe is fenced", () => {
  // NOTE: there is deliberately no test for the `stdio: ["ignore", ...]` half of
  // the fence. One was written and deleted: `spawnSync` closes a default `pipe`
  // stdin immediately when no `input` is supplied, and vitest's own stdin is not
  // a TTY, so a probe behaves identically with and without the option here.
  // Removing the line left the test green — it could not fail, and a test that
  // cannot fail is worse than no test. The option stays because it is correct
  // and matches the documented twin in src/ledger/monitor.ts; what it defends
  // against is an inherited terminal, which this suite cannot produce.

  it("hands no provider API key to the binary it probes", () => {
    const { dir, outFile } = fakeCliOnPath("amc-fake-agent");
    const priorPath = process.env["PATH"];
    const priorKey = process.env["ANTHROPIC_API_KEY"];
    process.env["PATH"] = `${dir}:${priorPath ?? ""}`;
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-must-not-escape";
    try {
      const detection = detectAdapter(definitionFor("amc-fake-agent"), { timeoutMs: 5_000 });
      expect(detection.installed, "the fake CLI answered, so the probe really ran").toBe(true);

      const seen = readFileSync(outFile, "utf8");
      expect(seen, "the probe ran and captured its env").toContain("PATH=");
      for (const key of PROVIDER_KEY_ENV_NAMES) {
        expect(seen, `${key} must not reach an unvetted binary`).not.toContain(`${key}=`);
      }
      expect(seen).not.toContain("sk-ant-must-not-escape");
    } finally {
      if (priorPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = priorPath;
      if (priorKey === undefined) delete process.env["ANTHROPIC_API_KEY"]; else process.env["ANTHROPIC_API_KEY"] = priorKey;
    }
  });
});
