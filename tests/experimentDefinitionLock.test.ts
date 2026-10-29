import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { createExperiment, setExperimentBaseline, setExperimentCandidate } from "../src/experiments/experimentRunner.js";
import { ControlFileLockError } from "../src/lifecycle/controlFileLock.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";

// A one-shot hook that runs when experiment.yaml is read: the window between a writer's read and its save, where a
// second writer can interleave. The lock timeout is shortened so a blocked writer fails fast instead of after 5 s.
const onRead = vi.hoisted(() => ({ next: null as null | (() => void) }));
vi.mock("../src/utils/fs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/fs.js")>();
  return { ...actual, readUtf8: ((path: string) => {
    const text = actual.readUtf8(path);
    if (path.endsWith("experiment.yaml") && onRead.next) { const hook = onRead.next; onRead.next = null; hook(); }
    return text;
  }) as typeof actual.readUtf8 };
});
vi.mock("../src/lifecycle/controlFileLock.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lifecycle/controlFileLock.js")>();
  return { ...actual, withControlFileLock: ((input) => actual.withControlFileLock({ ...input, timeoutMs: 100 })) as typeof actual.withControlFileLock };
});

const roots: string[] = [];
afterEach(() => {
  onRead.next = null;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("experiment definition updates (H2X-19)", () => {
  test("a set-candidate that interleaves with set-baseline is serialized, and after retry both updates persist", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-experiment-lock-"));
    roots.push(ws);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "experiment-lock-fixture");
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    const { experimentId, path } = createExperiment({ workspace: ws, agentId: "default", name: "locked", casebookId: "default" });
    const baselineFile = join(ws, "baseline.yaml");
    writeFileSync(baselineFile, "baseline: 1\n");
    const candidateFile = join(ws, "candidate.yaml");
    writeFileSync(candidateFile, "candidate: 1\n");
    const digestSha256 = sha256Hex(readFileSync(candidateFile));
    writeFileSync(`${candidateFile}.sig`, JSON.stringify({ digestSha256, signature: signHexDigest(digestSha256, getPrivateKeyPem(ws, "auditor")),
      signedTs: Date.now(), signer: "auditor" }));
    const setCandidate = () => setExperimentCandidate({ workspace: ws, agentId: "default", experimentId, candidateFile });

    let interleaved: unknown = null;
    // The first read is the pre-lock existence check; the hook fires on the locked read.
    let reads = 0;
    const arm = () => { onRead.next = () => { reads += 1; if (reads < 2) { arm(); return; } try { setCandidate(); } catch (error) { interleaved = error; } }; };
    arm();
    setExperimentBaseline({ workspace: ws, agentId: "default", experimentId, config: { path: baselineFile } });
    expect(interleaved).toBeInstanceOf(ControlFileLockError);
    setCandidate(); // the refused writer retries, as its error tells it to

    const saved = YAML.parse(readFileSync(path, "utf8")) as { experiment: { baselineConfig: { kind: string }; candidateConfig: { digestSha256: string } | null } };
    expect(saved.experiment.baselineConfig.kind).toBe("file");
    expect(saved.experiment.candidateConfig?.digestSha256).toBe(digestSha256);
  }, 60_000);
});
