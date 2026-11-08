import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The mock emulates where inquirer draws a prompt: the default module on stdout, a module created with
// createPromptModule({ output }) on that output (inquirer 13: dist/ui/prompt.js pipes opt.output || process.stdout).
const { promptMock, streams } = vi.hoisted(() => ({ promptMock: vi.fn(), streams: { out: [] as string[], err: [] as string[], moduleOptions: [] as unknown[] } }));
vi.mock("inquirer", () => {
  const drawn = (sink: string[]) => (questions: Array<{ message: string }>, ...rest: unknown[]) => {
    sink.push(`? ${questions[0]!.message}`);
    return promptMock(questions, ...rest);
  };
  return { default: {
    prompt: drawn(streams.out),
    createPromptModule: (options: { output?: unknown }) => {
      streams.moduleOptions.push(options);
      return drawn(options?.output === process.stderr ? streams.err : streams.out);
    }
  } };
});

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
  streams.out.splice(0); streams.err.splice(0); streams.moduleOptions.splice(0);
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

function run(args: string[]) {
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { streams.out.push(parts.map(String).join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => { streams.err.push(parts.map(String).join(" ")); });
  promptMock.mockResolvedValue({ level: 3 });
  const domainCmd = new Command("domain").exitOverride();
  registerDomainProductCliCommands({ product: new Command("product"), productGlossary: new Command("glossary"), domainCmd });
  return domainCmd.parseAsync(["pack", "run", "--pack", pack.id, ...args], { from: "user" });
}

// LIVE-UX-10: the interactive run ended without saying the answers are not stored, and --json > file captured the
// question lines and the prompts before the JSON.
test("an interactive run ends by saying the self-assessment is not stored, with a recipe that keeps it", async () => {
  await run([]);
  const last = streams.out.map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
  expect(last).toContain("This self-assessment is shown only; it is not stored in the workspace.");
  expect(last).toContain(`amc domain pack run --pack ${pack.id} --json > ${pack.id}-self-assessment.json`);
  expect(last).toContain("the questions are asked again, on the terminal; the file gets only the result");
});

test("with --json, stdout is exactly one JSON document; questions and prompts go to stderr", async () => {
  await run(["--json"]);
  expect(promptMock).toHaveBeenCalledTimes(pack.questions.length);
  expect(streams.moduleOptions).toEqual([{ output: process.stderr }]);
  const parsed = JSON.parse(streams.out.join("\n"));
  expect(parsed.packId).toBe(pack.id);
  expect(parsed.selfAssessment).toMatchObject({ answered: pack.questions.length, total: pack.questions.length });
  const err = streams.err.join("\n");
  for (const q of pack.questions) {
    expect(err).toContain(q.id);
    expect(err).toContain(q.text);
  }
  expect(streams.out.join("\n")).not.toContain("not stored in the workspace");
});
