import { mkdtempSync, rmSync, realpathSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  initPresets,
  presetsPath,
  readPresets,
  resolvePreset,
  savePresets
} from "../src/presets/agentPresets.js";

/**
 * Agent presets (plan P6.3): "a preset composes a per-session agent".
 *
 * A preset names a model, a tool mode, an approval gate and a delegation
 * posture -- which is to say it decides what an agent may do. That makes
 * `.amc/agents.yaml` a policy surface, signed and fail-closed like
 * `.amc/tools.yaml`, `.amc/adapters.yaml` and `.amc/schedules.yaml`. Otherwise
 * anyone who can write a file can compose an agent with capabilities nobody
 * granted.
 */
const PASS = "agent-presets-test-passphrase";
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-presets-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initPresets(dir);
  return dir;
}

const reviewer = (over: Record<string, unknown> = {}) => ({
  id: "reviewer",
  description: "a read-only reviewer",
  model: "claude-opus-4-6",
  providerId: "anthropic",
  maxSteps: 8,
  tools: "workspace",
  ...over
});

describe("the file that composes agents is signed", () => {
  it("reads presets from a signed file", () => {
    const dir = workspace();
    savePresets(dir, [reviewer()]);

    const read = readPresets(dir);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.presets.map((p) => p.id)).toEqual(["reviewer"]);
  });

  it("composes NOTHING when the signature does not verify", () => {
    // Fail closed, for the same reason schedules do: an edited preset file is an
    // agent somebody could have given tools, delegation or a weaker approval
    // gate, and "I cannot verify who authorised this" does not mean "run it".
    const dir = workspace();
    savePresets(dir, [reviewer()]);
    const path = presetsPath(dir);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n# tampered\n`, "utf8");

    const read = readPresets(dir);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.reason).toMatch(/signature/i);
  });
});

describe("a preset is refused rather than half-understood", () => {
  it("refuses an unknown field instead of ignoring it", () => {
    // THE property that matters most here. A typo'd `deligate: true` that is
    // silently dropped gives an operator a preset which does not do what it
    // plainly says, and nothing anywhere reports the difference.
    const dir = workspace();

    expect(() => savePresets(dir, [reviewer({ deligate: true })])).toThrow(/deligate/);
  });

  it("refuses a tools mode it does not have", () => {
    const dir = workspace();
    expect(() => savePresets(dir, [reviewer({ tools: "everything" })])).toThrow(/everything/);
  });

  it("refuses a delegation scope that is not an action class", () => {
    const dir = workspace();
    expect(() => savePresets(dir, [reviewer({ delegate: { enabled: true, scope: ["read_only"] } })]))
      .toThrow(/read_only/);
  });
});

describe("resolving a preset into a composition", () => {
  it("returns the preset's settings", () => {
    const dir = workspace();
    savePresets(dir, [reviewer({ maxSteps: 3, persona: "You review code." })]);

    const resolved = resolvePreset(dir, "reviewer");

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.preset.model).toBe("claude-opus-4-6");
    expect(resolved.preset.maxSteps).toBe(3);
    expect(resolved.preset.persona).toBe("You review code.");
  });

  it("names what the operator does have when the preset is unknown", () => {
    const dir = workspace();
    savePresets(dir, [reviewer()]);

    const resolved = resolvePreset(dir, "auditor");

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain("auditor");
    expect(resolved.reason, "and says what there is").toContain("reviewer");
  });

  it("says so when no presets are defined at all", () => {
    const dir = workspace();
    const resolved = resolvePreset(dir, "reviewer");

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toMatch(/no presets/i);
  });
});

describe("a preset carries a delegation posture", () => {
  it("keeps an explicit scope and depth", () => {
    const dir = workspace();
    savePresets(dir, [reviewer({ delegate: { enabled: true, scope: ["READ_ONLY"], maxDepth: 1 } })]);

    const resolved = resolvePreset(dir, "reviewer");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.preset.delegate?.enabled).toBe(true);
    expect(resolved.preset.delegate?.scope).toEqual(["READ_ONLY"]);
    expect(resolved.preset.delegate?.maxDepth).toBe(1);
  });

  it("defaults to not delegating", () => {
    // The capability that spends an operator's budget on agents they did not
    // start is not something a preset gets by omission.
    const dir = workspace();
    savePresets(dir, [reviewer()]);

    const resolved = resolvePreset(dir, "reviewer");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.preset.delegate?.enabled ?? false).toBe(false);
  });
});
