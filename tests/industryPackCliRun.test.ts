import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { promptMock } = vi.hoisted(() => ({ promptMock: vi.fn() }));
vi.mock("inquirer", () => ({ default: { prompt: promptMock } }));

import { registerDomainProductCliCommands } from "../src/cli-domain-product-commands.js";
import { getPackById } from "../src/domains/industryPacks.js";

// H2 (2026-11-07 overseer): the interactive run cut every question at 120 characters and each level text at 80.
const pack = getPackById("farm-to-fork")!;
let home: string;
let stdinTTY: PropertyDescriptor | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "amc-pack-run-"));
  vi.stubEnv("AMC_HOME", home);
  stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
});
afterEach(() => {
  if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY); else Reflect.deleteProperty(process.stdin, "isTTY");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  promptMock.mockReset();
  rmSync(home, { recursive: true, force: true });
});

test("amc domain pack run shows every question and level text in full", async () => {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { lines.push(parts.map(String).join(" ")); });
  promptMock.mockResolvedValue({ level: 3 });
  const domainCmd = new Command("domain").exitOverride();
  registerDomainProductCliCommands({ product: new Command("product"), productGlossary: new Command("glossary"), domainCmd });
  await domainCmd.parseAsync(["pack", "run", "--pack", pack.id], { from: "user" });

  expect(promptMock).toHaveBeenCalledTimes(pack.questions.length);
  const printed = lines.join("\n");
  pack.questions.forEach((q, index) => {
    expect(printed).toContain(q.text);
    const [question] = promptMock.mock.calls[index]![0] as Array<{ pageSize: number; choices: Array<{ name: string; short: string }> }>;
    expect(question.choices).toEqual([
      expect.objectContaining({ name: `L1 — ${q.l1}`, short: "L1" }),
      expect.objectContaining({ name: `L3 — ${q.l3}`, short: "L3" }),
      expect.objectContaining({ name: `L5 — ${q.l5}`, short: "L5" })
    ]);
    // Wrapped choices must fit one page, or inquirer cuts the wrapped lines off.
    expect(question.pageSize).toBeGreaterThan(7);
  });
  // The run still reports a self-reported result with every question answered.
  expect(printed).toContain(`(${pack.questions.length}/${pack.questions.length} answered; self-reported; not a certification)`);
});
