import { describe, expect, test } from "vitest";
import { promptNewSecret, type SecretPrompt } from "../src/cli/initPassphrase.js";

// CLI-07: `amc init` "Enter my own" took the vault passphrase once, so one typo sealed a vault nobody could open.
function scripted(answers: string[]): { ask: SecretPrompt; asked: string[] } {
  const asked: string[] = [];
  return { asked, ask: async (message) => { asked.push(message); return answers.shift() ?? ""; } };
}

describe("promptNewSecret", () => {
  test("asks twice and returns the passphrase when both entries match", async () => {
    const { ask, asked } = scripted(["correct horse", "correct horse"]);
    await expect(promptNewSecret("Vault passphrase", 8, ask)).resolves.toBe("correct horse");
    expect(asked).toEqual(["Vault passphrase (min 8 chars):", "Repeat the vault passphrase:"]);
  });

  test("refuses a mismatch before anything is created", async () => {
    const { ask } = scripted(["correct horse", "correct hrose"]);
    await expect(promptNewSecret("Vault passphrase", 8, ask)).rejects.toThrow("do not match, so nothing was created");
  });
});
