/**
 * First-run docs truth (LIVE-UX-09). The README's first-score block and the website's getting-started page left out the
 * console sign-in step, and the sign-in paragraphs must not send anyone to `amc vault unlock`, which unlocks only its own
 * process, to make `amc user init` work.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const readme = read("README.md");
const gettingStarted = read("docs/GETTING_STARTED.md");
const website = read("website/docs/getting-started.html");

function nearby(text: string, needle: string, radius = 200): string[] {
  const windows: string[] = [];
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) {
    windows.push(text.slice(Math.max(0, index - radius), index + needle.length + radius));
  }
  return windows;
}

describe("the first console login is in the first-run path", () => {
  test("the README's 60-seconds block creates the first login after amc up", () => {
    const section = readme.slice(readme.indexOf("## 60 Seconds to Your First Score"));
    const block = section.slice(section.indexOf("```bash"), section.indexOf("```", section.indexOf("```bash") + 7));
    expect(block).toContain("amc user init --username <you>   # new workspace only: the first console login (asks for a password)");
    expect(block.indexOf("amc user init")).toBeGreaterThan(block.indexOf("amc up"));
  });

  test("the website's Open Studio step names amc user init and amc user add", () => {
    const step = website.slice(website.indexOf("<h4>Open Studio when ready</h4>"), website.indexOf("</div>", website.indexOf("<h4>Open Studio when ready</h4>")));
    expect(step).toContain("amc user init --username &lt;you&gt;   # new workspace only: the first console login (asks for a password)");
    expect(step).toContain("Then sign in to the Compass Console at the URL amc up printed.");
    expect(step).toContain("If the workspace already has logins, an OWNER adds yours with <code>amc user add</code>.");
  });
});

describe("the sign-in paragraphs stay true", () => {
  test.each([["README.md", readme], ["docs/GETTING_STARTED.md", gettingStarted]])("%s: remembered passphrase first, AMC_VAULT_PASSPHRASE as the fallback, never amc vault unlock", (_file, text) => {
    expect(text).toContain("after `amc up` the passphrase it remembered is used. If it reports `Vault locked`, set `AMC_VAULT_PASSPHRASE` in that shell and run it again.");
    for (const window of nearby(text, "user init")) expect(window).not.toContain("amc vault unlock");
    expect(text).toContain("amc user add");
  });

  test("the replace warning is kept verbatim", () => {
    expect(readme).toContain("`amc user init` replaces `.amc/users.yaml`: if the workspace already has logins (for example after `amc init --coding`), add yours with `amc user add --username <you> --role OWNER` instead.");
    expect(gettingStarted).toContain("`amc user init` replaces `.amc/users.yaml`, so on a workspace that already has\nlogins (for example after `amc init --coding`) use `amc user add` instead.");
  });

  test("the README says users.yaml is not covered by the workspace .gitignore", () => {
    const ignore = read("src/workspaceGitignore.ts");
    expect(ignore).not.toMatch(/"users\.yaml"/);
    expect(readme).toContain("A new workspace also gets `.amc/.gitignore`, which keeps those secrets and per-machine runtime state out of git. `.amc/users.yaml` (console password hashes) is not ignored by that file; keep it out of git unless the repository is private.");
  });
});
