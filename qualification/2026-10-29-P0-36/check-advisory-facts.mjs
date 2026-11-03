#!/usr/bin/env node
/**
 * P0-36: re-checks every repository fact the 1.1.1 advisory draft (docs/security/advisories/1.1.1.md) cites,
 * against the git history of the checkout it runs in. Read-only: it runs `git show`, `git ls-tree`, `git log` and
 * `git merge-base` only. Exit 0 when every fact holds, 1 otherwise.
 *
 *   node qualification/2026-10-29-P0-36/check-advisory-facts.mjs            # facts
 *   node qualification/2026-10-29-P0-36/check-advisory-facts.mjs --keys     # also list historical public key ids
 *   node qualification/2026-10-29-P0-36/check-advisory-facts.mjs --published <package dir>
 *
 * --published also checks each fact against an extracted npm 1.1.1 tarball (the directory holding package.json and
 * dist/). The registry's 1.1.1 was built from a source later than the v1.1.1 tag, so a fact that holds at the tag
 * does not by itself hold for what npm users installed.
 *
 * --keys lists the AMC key id (sha256 of the canonical SPKI PEM, src/keys/algorithmPolicy.ts signingKeyIdentity)
 * of every public key ever tracked under .amc/keys/ or --/.amc/keys/. They are candidate inputs for P0-37's distrust
 * list, not a distrust list: which of them had a private half in a tracked vault needs the vault passphrase (Sid).
 */
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };
const lineAt = (rev, path, line) => (tryGit("show", `${rev}:${path}`) ?? "").split("\n")[line - 1] ?? "";

/** [rev, path, line, text that line must contain] */
const LINES = [
  ["v1.1.1", "src/assurance/assuranceRunner.ts", 133, "function syntheticResponse("],
  ["v1.1.1", "src/assurance/assuranceRunner.ts", 266, 'let trustTier: TrustTier = "OBSERVED"'],
  ["v1.1.1", "src/assurance/assuranceRunner.ts", 315, "syntheticResponse(prompt, context)"],
  ["v1.1.1", "src/redteam/runner.ts", 206, "function syntheticResponse("],
  ["v1.1.1", "src/redteam/runner.ts", 502, "syntheticResponse(attackPrompt)"],
  ["v1.1.1", "src/redteam/jailbreak/tap.ts", 192, "function syntheticResponse("],
  ["v1.1.1", "src/redteam/jailbreak/tap.ts", 324, "input.respondFn ?? syntheticResponse"],
  ["v1.1.1", "src/storage/blobs/blobKeys.ts", 131, "amc-no-sign-fallback-key-32bytes!"],
  ["v1.1.1", "src/storage/blobs/blobKeys.ts", 168, 'process.env.AMC_NO_SIGN === "1"'],
  ["v1.1.1", "src/cli.ts", 1408, '"vault.amcvault"'],
  ["v1.1.1", "src/cli.ts", 1411, "noSign: true"],
  ["v1.1.1", "src/cli.ts", 1735, "state.vault.noSign"],
  ["v1.1.1", "src/cli.ts", 1736, 'process.env.AMC_NO_SIGN = "1"'],
  ["v1.1.1", "src/bundles/bundle.ts", 335, '.amc/blobs/'],
  ["v1.1.1", "src/assurance/certificate.ts", 463, 'getPublicKeyHistoryFromCert(extracted, "auditor")'],
  ["v1.1.1", "src/bundles/bundle.ts", 571, "function collectAuditorKeysFromBundle("],
  ["v1.1.1", "src/passport/passportVerifier.ts", 103, '"signer.pub"'],
  ["v1.1.1", "src/passport/passportVerifier.ts", 138, "params.publicKeyPath"],
  ["v1.1.1", "src/assurance/assuranceVerifier.ts", 100, "params.publicKeyPath"],
  ["v1.1.1", "src/release/releaseVerifier.ts", 62, '"release-signing.pub"'],
  ["v1.1.1", "src/vault/vault.ts", 8, '"monitor" | "auditor" | "lease" | "session"'],
  ["v1.1.1", "src/vault/vault.ts", 109, 'process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST === "1"'],
  ["v1.1.1", "src/vault/vault.ts", 110, '"amc-test-passphrase"'],
  ["v1.1.1", "src/identity/hostVault.ts", 72, 'process.env.NODE_ENV === "test"'],
  ["v1.1.1", "src/identity/hostVault.ts", 73, '"amc-host-vault-test-passphrase"'],
  ["v1.1.1", "src/eval/evalImporters.ts", 78, 'openai: "ATTESTED"'],
  ["v1.1.1", "src/eval/evalImporters.ts", 84, 'langwatch: "ATTESTED"'],
  ["v1.1.1", "src/eval/evalImporters.ts", 1600, "ts: item.ts ?? undefined"],
  ["v1.1.1", "src/cli.ts", 15155, '.command("attest")'],
  ["v1.1.1", "src/vault/vault.ts", 13, "monitorPrivateKeyPem"],
  ["v1.1.1", "src/cli.ts", 6919, "--trust-tier <tier>"],
  ["v1.1.1", "src/domains/domainCliIntegration.ts", 58, "function pseudoRandomScore("],
  ["v1.1.1", "src/domains/domainReportBuilder.ts", 65, "Certification Readiness"],
  // Fixed on the base this draft was written on.
  ["HEAD", "src/storage/blobs/blobKeys.ts", 147, "LEGACY_NO_SIGN_KEY"],
  ["HEAD", "src/trust/amc-distrust.json", 2, '"distrust": []']
];

/** [dist file, text it must contain] in the published npm 1.1.1 package; the same code as LINES, compiled. */
const PUBLISHED = [
  ["dist/assurance/assuranceRunner.js", "function syntheticResponse("],
  ["dist/assurance/assuranceRunner.js", 'let trustTier = "OBSERVED"'],
  ["dist/assurance/assuranceRunner.js", "syntheticResponse(prompt, context)"],
  ["dist/redteam/runner.js", "syntheticResponse(attackPrompt)"],
  ["dist/redteam/jailbreak/tap.js", "input.respondFn ?? syntheticResponse"],
  ["dist/storage/blobs/blobKeys.js", "amc-no-sign-fallback-key-32bytes!"],
  ["dist/cli.js", "Existing vault is locked and no passphrase is available"],
  ["dist/cli.js", "state.vault.noSign"],
  ["dist/bundles/bundle.js", 'startsWith(".amc/blobs/")'],
  ["dist/assurance/certificate.js", 'getPublicKeyHistoryFromCert(extracted, "auditor")'],
  ["dist/bundles/bundle.js", "function collectAuditorKeysFromBundle("],
  ["dist/passport/passportVerifier.js", '"signer.pub"'],
  ["dist/assurance/assuranceVerifier.js", '"signer.pub"'],
  ["dist/release/releaseVerifier.js", '"release-signing.pub"'],
  ["dist/vault/vault.js", '"amc-test-passphrase"'],
  ["dist/vault/vault.js", 'process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST === "1"'],
  ["dist/identity/hostVault.js", '"amc-host-vault-test-passphrase"'],
  ["dist/eval/evalImporters.js", 'openai: "ATTESTED"'],
  ["dist/eval/evalImporters.js", 'langwatch: "ATTESTED"'],
  ["dist/eval/evalImporters.js", "ts: item.ts ?? undefined"],
  ["dist/cli.js", "--trust-tier <tier>"],
  ["dist/cli.js", '.command("attest")'],
  ["dist/domains/domainCliIntegration.js", "function pseudoRandomScore("],
  ["dist/domains/domainReportBuilder.js", "Certification Readiness"]
];
/** Archive readers that run a raw `tar -xzf`: 19 in a build from the v1.1.1 tag, 17 in the npm package. */
const PUBLISHED_RAW_TAR_SITES = 17;
const RAW_TAR = 'spawnSync("tar", ["-xzf"';

/** Commits the draft cites; each must be in HEAD's history. */
const COMMITS = {
  "40358680": "vault first tracked", "cb6bba21": "vault untracked; archive extraction contained", "521f21e7": "second vault tracked; ledger anchoring",
  "7cfcb767": "second vault untracked", "fba5824e": "assurance runs the real agent", "c0ebbf69": "red-team runner real agent",
  "15dc87e2": "evil-MCP red team real agent", "8f9fa7ac": "jailbreak TAP real responder", "3a7c4752": "random blob key",
  "cb7893e1": "test passphrase only under Vitest", "8ca67399": "no test-signal passphrase (P0-37 follow-up)",
  "0e681948": "P0-09 PR 1 (#45)", "0b818f4f": "P0-09 PR 2 (#53)", "6b899a60": "P0-09 PR 3 (#55)", "f4646429": "P0-15 (#67)",
  "2a5d6325": "P0-18 (#70)", "8206fe46": "P0-18 follow-ups", "3aa75a11": "P0-19 grading", "da093617": "P0-19 v1 inconclusive",
  "a32a94b3": "better-sqlite3 ABI (release notes, not advisory)", "2b4e35ff": "v1.0.0", "e71d1373": "v1.1.0", "ff539022": "v1.1.1"
};

/** Tracked files the draft cites at HEAD. */
const FILES = ["tests/assuranceAgentResponder.test.ts", "tests/redteamRealExecution.test.ts", "tests/storage/blobKeyNoVault.test.ts",
  "tests/trust/embeddedKeyForgery.test.ts", "tests/ledgerTrustRootAnchor.test.ts", "tests/ledgerTrustRootAnchorCli.test.ts",
  "tests/vaultPassphraseSource.test.ts", "tests/trustTierWriteGuard.test.ts", "tests/evalImportTrust.test.ts",
  "tests/noFabricatedDomainResults.test.ts", "tests/domainExampleMode.test.ts", "tests/tarTraversalGuard.test.ts",
  "docs/security/verifier-inventory.md", "docs/TRUST_LIST.md", "website/publication-status.json", "docs/PUBLISHING.md", "docs/releases/2.0.0.md", "SECURITY.md"];

const failures = [];
for (const [rev, path, line, text] of LINES) {
  if (!lineAt(rev, path, line).includes(text)) failures.push(`${rev}:${path}:${line} does not contain ${JSON.stringify(text)}`);
}
for (const [sha, what] of Object.entries(COMMITS)) {
  if (tryGit("merge-base", "--is-ancestor", sha, "HEAD") === null) failures.push(`${sha} (${what}) is not in HEAD's history`);
}
for (const path of FILES) if (!tryGit("ls-tree", "HEAD", "--", path)?.trim()) failures.push(`${path} is not tracked at HEAD`);
for (const tag of ["v1.0.0", "v1.1.0", "v1.1.1"]) {
  if (!tryGit("ls-tree", tag, "--", ".amc/vault.amcvault")?.trim()) failures.push(`${tag} does not track .amc/vault.amcvault`);
}
// Newest first: 7cfcb767 deletes --/.amc/, 521f21e7 adds it, cb6bba21 deletes .amc/, 40358680 adds it.
const vaultLife = git("log", "--format=%H", "--diff-filter=AD", "--", ".amc/vault.amcvault", "--/.amc/vault.amcvault").trim().split("\n");
const expectedLife = ["7cfcb767", "521f21e7", "cb6bba21", "40358680"];
if (vaultLife.length !== 4 || vaultLife.some((sha, i) => !sha.startsWith(expectedLife[i]))) failures.push(`vault add/delete history is ${vaultLife.join(" ")}`);

let total = LINES.length + Object.keys(COMMITS).length + FILES.length + 4; // 3 tags + the vault history
const publishedAt = process.argv.indexOf("--published");
if (publishedAt !== -1) {
  const pkg = process.argv[publishedAt + 1];
  const read = (path) => { try { return readFileSync(join(pkg, path), "utf8"); } catch { return ""; } };
  if (JSON.parse(read("package.json") || "{}").version !== "1.1.1") failures.push(`${pkg} is not an extracted 1.1.1 package`);
  for (const [path, text] of PUBLISHED) if (!read(path).includes(text)) failures.push(`published ${path} does not contain ${JSON.stringify(text)}`);
  for (const path of ["dist/cli.js", "dist/ledger/ledger.js"]) {
    if (read(path).includes("EXPECTED_MONITOR")) failures.push(`published ${path} pins a monitor key, so issue 3's ledger forgery claim needs review`);
  }
  const jsFiles = readdirSync(join(pkg, "dist"), { recursive: true }).filter((p) => p.endsWith(".js"));
  const rawTar = jsFiles.filter((p) => read(join("dist", p)).includes(RAW_TAR)).length;
  if (rawTar !== PUBLISHED_RAW_TAR_SITES) failures.push(`published dist has ${rawTar} raw tar -xzf sites, not ${PUBLISHED_RAW_TAR_SITES}`);
  total += PUBLISHED.length + 4; // package version, two anchor checks, tar sites
}
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`advisory facts: ${total - failures.length}/${total} hold at ${git("rev-parse", "HEAD").trim()}`);

if (process.argv.includes("--keys")) {
  const keys = new Map();
  const commits = git("log", "--reverse", "--format=%H %cs", "--", ".amc/keys", "--/.amc/keys").trim().split("\n");
  for (const row of commits) {
    const [sha, date] = row.split(" ");
    for (const entry of git("ls-tree", "-r", sha, "--", ".amc/keys", "--/.amc/keys").trim().split("\n").filter(Boolean)) {
      const [meta, path] = entry.split("\t");
      if (!/(\.pub|_history\.json)$/.test(path)) continue;
      const text = git("cat-file", "-p", meta.split(" ")[2]);
      for (const pem of text.replaceAll("\\n", "\n").match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g) ?? []) {
        const der = createPublicKey(pem).export({ format: "der", type: "spki" });
        const canonical = `-----BEGIN PUBLIC KEY-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----\n`;
        const keyId = createHash("sha256").update(canonical).digest("hex");
        const role = path.split("/").pop().split("_")[0];
        if (!keys.has(keyId)) keys.set(keyId, { role, firstSeen: `${sha.slice(0, 8)} ${date}`, path });
      }
    }
  }
  console.log(`historical public keys: ${keys.size}`);
  for (const [keyId, k] of keys) console.log(`${keyId} ${k.role} first ${k.firstSeen} ${k.path}`);
}
process.exit(failures.length === 0 ? 0 : 1);
