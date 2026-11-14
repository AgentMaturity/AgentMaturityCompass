import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ prompt: vi.fn(), secret: vi.fn() }));
vi.mock("inquirer", () => ({ default: { prompt: seam.prompt } }));
vi.mock("../src/cli-credentials-commands.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/cli-credentials-commands.js")>()),
  readSecretFromStdinOrPrompt: seam.secret
}));

import { chatSetupDeps } from "../src/setup/nativeChatSetupIo.js";

const roots: string[] = [];
afterEach(() => { vi.clearAllMocks(); while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("chat setup's terminal side", () => {
  it("asks with inquirer and treats Ctrl-C as a cancelled question", async () => {
    const deps = chatSetupDeps({ log: () => undefined });
    seam.prompt.mockResolvedValueOnce({ answer: "anthropic" });
    await expect(deps.ask("Provider: ")).resolves.toBe("anthropic");
    seam.prompt.mockRejectedValueOnce(new Error("User force closed the prompt"));
    await expect(deps.ask("Provider: ")).resolves.toBeNull();
  });

  it("asks for a key with the masked prompt amc credentials set uses, and stores it 0600 in the chosen file", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-chat-setup-io-"));
    roots.push(root);
    const deps = chatSetupDeps({ log: () => undefined });
    seam.secret.mockResolvedValueOnce("sk-fixture-not-printed");
    await expect(deps.askSecret("ANTHROPIC_API_KEY")).resolves.toBe("sk-fixture-not-printed");
    expect(seam.secret).toHaveBeenCalledWith("ANTHROPIC_API_KEY");
    const file = join(root, "credentials.yaml");
    const stored = await deps.storeCredential({ ref: "ANTHROPIC_API_KEY", value: "sk-fixture-not-printed", options: { workspace: root, credentialsFile: file } });
    expect(stored).toBe(file);
    expect(readFileSync(file, "utf8")).toContain("ANTHROPIC_API_KEY");
    expect(statSync(file).mode & 0o077).toBe(0);
  });
});
