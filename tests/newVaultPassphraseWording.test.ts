import { describe, expect, it } from "vitest";
import { generatedPassphraseRoute, newVaultPassphraseChoices, rememberedPassphraseNotice, shownOncePassphraseLines } from "../src/cli/initPassphrase.js";

describe("a generated vault passphrase is remembered, not printed, for an operator in a terminal", () => {
  it("remembers in a terminal with remembering on, and shows once only where no store may hold it", () => {
    expect(generatedPassphraseRoute({}, true)).toBe("remember");
    expect(generatedPassphraseRoute({ AMC_VAULT_REMEMBER: "0" }, true)).toBe("show-once");
    expect(generatedPassphraseRoute({}, false), "non-interactive init keeps its printed export").toBe("show-once");
    expect(generatedPassphraseRoute({ CLAUDECODE: "1" }, true), "an agent's shell is not an operator").toBe("show-once");
    expect(generatedPassphraseRoute({ CI: "true" }, true)).toBe("show-once");
  });

  it("offers create-and-remember first, and says plainly when the created one is shown instead", () => {
    expect(newVaultPassphraseChoices(true).map((choice) => choice.name)).toEqual(["Let AMC create and remember one (recommended)", "Enter my own"]);
    const shown = newVaultPassphraseChoices(false).map((choice) => choice.name);
    expect(shown[0]).toMatch(/shown once/);
    expect(newVaultPassphraseChoices(true).map((choice) => choice.value)).toEqual(["auto", "custom"]);
  });

  it("names where it is kept and the existing commands to change or forget it, never the value", () => {
    const notice = rememberedPassphraseNotice("the macOS Keychain (service amc-vault)", "keychain");
    expect(notice).toContain("Vault passphrase generated and remembered in the macOS Keychain (service amc-vault)");
    expect(notice).toContain("amc vault passphrase");
    expect(notice).toContain("amc vault forget");
    expect(notice).toContain("Keychain Access");
    expect(rememberedPassphraseNotice("/home/x/creds.json", "file")).not.toContain("Keychain Access");
  });

  it("prints a shown-once passphrase with a save-it-now line", () => {
    const lines = shownOncePassphraseLines("value-shown-once").join("\n");
    expect(lines).toMatch(/Save this vault passphrase now/);
    expect(lines).toContain("value-shown-once");
  });
});

describe("a created passphrase the store refuses", () => {
  it("is shown once rather than lost", async () => {
    const { rememberOrShowOnce } = await import("../src/cli/initPassphrase.js");
    const lines = rememberOrShowOnce("/nonexistent/ws", "value-the-store-refused", { AMC_VAULT_REMEMBER: "0" });
    expect(lines.join("\n")).toContain("could not be remembered");
    expect(lines.join("\n")).toContain("Save this vault passphrase now");
  });
});
