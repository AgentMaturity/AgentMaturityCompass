import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `amc comply risk-classify` run in-process: flags, --capabilities JSON, --guide answers, and the refusals. */
const prompt = vi.hoisted(() => vi.fn());
vi.mock("inquirer", () => ({ default: { prompt } }));

import { addRiskClassifyOptions, guideCapabilities, riskClassifyAction, GUIDE_AREA_CHOICES, GUIDE_BANNED_CHOICES } from "../src/compliance/euAiActCli.js";

let out: string[];
let err: string[];
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
const text = () => strip(out.join("\n"));

beforeEach(() => {
  out = []; err = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(a.map(String).join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { err.push(a.map(String).join(" ")); });
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
});
afterEach(() => { vi.restoreAllMocks(); prompt.mockReset(); });

function parsedOptions(argv: string[]): Record<string, unknown> {
  const cmd = addRiskClassifyOptions(new Command("risk-classify")).exitOverride();
  cmd.action(() => undefined);
  cmd.parse(["node", "risk-classify", ...argv]);
  return cmd.opts();
}

describe("risk-classify options", () => {
  it("registers every capability flag as false by default and maps a flag to its camel-case option", () => {
    const opts = parsedOptions(["--employment", "--realtime-biometric"]);
    expect(opts).toMatchObject({ employment: true, realtimeBiometric: true, chatbot: false, guide: false, json: false });
  });
});

describe("guideCapabilities", () => {
  it("turns the six answers into capabilities and leaves unticked ones out", () => {
    expect(guideCapabilities({ banned: ["socialScoring"], areas: ["employment"], safetyComponent: true, talksToPeople: true,
      content: ["deepFakes"], role: "both" }))
      .toEqual({ socialScoring: true, employment: true, safetyComponent: true, humanInteraction: true, deepFakes: true });
    expect(guideCapabilities({ banned: [], areas: [], safetyComponent: false, talksToPeople: false, content: [], role: "provider" })).toEqual({});
    expect(GUIDE_BANNED_CHOICES.length).toBe(10);
    expect(GUIDE_AREA_CHOICES.map(([key]) => key)).toContain("migrationBorderControl");
  });
});

describe("riskClassifyAction", () => {
  it("classifies flags as HIGH and lists provider and deployer duties apart, never claiming compliance", async () => {
    await riskClassifyAction(parsedOptions(["--employment"]));
    const shown = text();
    expect(shown).toContain("Risk Tier: HIGH");
    expect(shown).toContain("If you build the agent and offer it under your name (provider):");
    expect(shown).toContain("If you use the agent in your own work (deployer):");
    expect(shown).toContain("Findings:");
    expect(shown).toContain("not legal advice and does not say the agent meets the EU AI Act");
    expect(shown).toContain("amc comply roadmap --framework EU_AI_ACT --risk-tier HIGH");
  });

  it("shows a banned practice as UNACCEPTABLE with a CRITICAL finding", async () => {
    await riskClassifyAction(parsedOptions(["--social-scoring"]));
    expect(text()).toContain("Risk Tier: UNACCEPTABLE");
    expect(text()).toContain("[CRITICAL]");
  });

  it("with no capability says MINIMAL and lists no articles", async () => {
    await riskClassifyAction(parsedOptions([]));
    expect(text()).toContain("Risk Tier: MINIMAL");
    expect(text()).toContain("Articles: none");
    expect(text()).not.toContain("Findings:");
  });

  it("--capabilities JSON is classified and --json prints the result with its claim fields", async () => {
    await riskClassifyAction({ capabilities: JSON.stringify({ chatbot: true }), json: true });
    const result = JSON.parse(out.join("\n"));
    expect(result.riskTier).toBe("LIMITED");
    expect(result.claimKind).toBeDefined();
    expect(typeof result.claimLabel).toBe("string");
  });

  it("refuses invalid --capabilities JSON", async () => {
    await expect(riskClassifyAction({ capabilities: "{not json" })).rejects.toThrow("exit 1");
    expect(strip(err.join("\n"))).toContain("Invalid --capabilities JSON");
  });

  it("refuses --guide without a terminal and names the flag alternative", async () => {
    const stdin = process.stdin.isTTY, stdout = process.stdout.isTTY;
    try {
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      await expect(riskClassifyAction({ guide: true })).rejects.toThrow("exit 1");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
      Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
    }
    expect(strip(err.join("\n"))).toContain("--guide asks six questions and needs a terminal.");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("--guide at a terminal asks six questions and shows only the chosen role's duties", async () => {
    prompt.mockResolvedValue({ banned: [], areas: ["employment"], safetyComponent: false, talksToPeople: true, content: [], role: "deployer" });
    const stdin = process.stdin.isTTY, stdout = process.stdout.isTTY;
    try {
      Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
      Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
      await riskClassifyAction({ guide: true });
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
      Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
    }
    expect(prompt).toHaveBeenCalledTimes(1);
    const questions = prompt.mock.calls[0]![0] as Array<{ name: string; message: string }>;
    expect(questions.map((q) => q.name)).toEqual(["banned", "areas", "safetyComponent", "talksToPeople", "content", "role"]);
    expect(text()).toContain("Risk Tier: HIGH");
    expect(text()).toContain("If you use the agent in your own work (deployer):");
    expect(text()).not.toContain("(provider):");
  });
});
