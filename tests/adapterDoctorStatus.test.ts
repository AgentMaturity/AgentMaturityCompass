import { describe, expect, it } from "vitest";
import { adapterDoctorCheck } from "../src/adapters/adapterDetection.js";

const row = (adapterId: string, command: string | null, installed = command !== null, version: string | null = "1.0") =>
  ({ adapterId, installed, command, version, detail: installed ? `${command} ${version}` : "missing commands: openhands, oh" });

describe("doctor does not warn about optional adapters a new user does not use", () => {
  it("shows an absent adapter as neutral and optional, with no fix to chase", () => {
    expect(adapterDoctorCheck(row("openhands-cli", null))).toEqual({ status: "INFO", message: "openhands-cli: not installed (optional)" });
  });

  it("passes only an adapter whose own command answered", () => {
    expect(adapterDoctorCheck(row("claude-cli", "claude", true, "2.1.296"))).toMatchObject({ status: "PASS", message: "claude-cli: claude 2.1.296" });
    expect(adapterDoctorCheck(row("generic-cli", "sh", true, "3.2"))).toMatchObject({ status: "PASS" });
  });

  it("does not report PASS for a framework just because python3 or node exists", () => {
    for (const [id, runtime] of [["crewai-cli", "python3"], ["langgraph-python", "python3"], ["langchain-node", "node"], ["python-amc-sdk", "/usr/bin/python"]] as const) {
      const check = adapterDoctorCheck(row(id, runtime));
      expect(check.status, id).toBe("INFO");
      expect(check.message, id).toContain(`${id}: not detected (optional)`);
      expect(check.message, id).toContain("present");
    }
  });

  it("shows a command that was found but did not answer as found, neither PASS nor a warning", () => {
    expect(adapterDoctorCheck({ adapterId: "gemini-cli", installed: true, command: "gemini", version: null, detail: "found command(s) but version probe failed: gemini(error=ETIMEDOUT)" }))
      .toEqual({ status: "INFO", message: "gemini-cli: gemini found, but it did not report a version (found command(s) but version probe failed: gemini(error=ETIMEDOUT))" });
    expect(adapterDoctorCheck({ adapterId: "python-amc-sdk", installed: true, command: "python3", version: null, detail: "x" }))
      .toEqual({ status: "INFO", message: "python-amc-sdk: not detected (optional); only its runtime python3 is present" });
  });
});
