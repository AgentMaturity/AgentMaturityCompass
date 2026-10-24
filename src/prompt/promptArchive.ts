import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { collectFiles } from "../utils/archiveFiles.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { promptLintSchema, type PromptPackSignature } from "./promptPackSchema.js";
import type { CompiledPromptPack } from "./promptCompiler.js";

/** Exact existing archive members, including the historical lint.json.sig copy. No signing is performed here. */
export function promptArchiveBytes(compiled: CompiledPromptPack, signature: PromptPackSignature, signerPub: string, lintSignatureBytes: string): Buffer {
  const temp = mkdtempSync(join(tmpdir(), "amc-prompt-pack-"));
  let failure: unknown;
  try {
    const root = join(temp, "amc-prompt"); for (const dir of [root, join(root, "meta"), join(root, "provider"), join(root, "lint")]) ensureDir(dir);
    writeFileAtomic(join(root, "pack.json"), `${canonicalize(compiled.pack)}\n`, 0o644);
    writeFileAtomic(join(root, "pack.sig"), `${canonicalize(signature)}\n`, 0o644);
    writeFileAtomic(join(root, "signer.pub"), signerPub, 0o644);
    for (const [name, hash] of [["cgx.pack", compiled.hashes.cgxPackSha256], ["policy", compiled.hashes.policySha256], ["bank", compiled.hashes.bankSha256], ["canon", compiled.hashes.canonSha256]])
      writeFileAtomic(join(root, "meta", `${name}.sha256`), `${hash}\n`, 0o644);
    for (const provider of ["openai", "anthropic", "gemini", "xai", "openrouter"] as const)
      writeFileAtomic(join(root, "provider", `${provider}.json`), `${canonicalize(compiled.providerFiles[provider])}\n`, 0o644);
    writeFileAtomic(join(root, "lint", "lint.json"), `${canonicalize(promptLintSchema.parse(compiled.lint))}\n`, 0o644);
    writeFileAtomic(join(root, "lint", "lint.json.sig"), lintSignatureBytes, 0o644);
    writeFileAtomic(join(root, "lint", "lint.sig"), lintSignatureBytes, 0o644);
    // Collect before creating the candidate, so it can never include itself.
    const files = collectFiles(temp), target = join(temp, ".candidate.amcprompt"), out = spawnSync("tar", ["-czf", target, "-C", temp, ...files], { encoding: "utf8" });
    if (out.status !== 0) throw new Error("failed to create prompt pack archive", { cause: out.error ?? new Error(out.stderr || out.stdout || "tar did not complete") });
    return readFileSync(target);
  } catch (cause) { failure = cause; throw cause; }
  finally { try { rmSync(temp, { recursive: true, force: true }); } catch (cleanup) { throw new Error("prompt archive staging cleanup did not complete", { cause: failure === undefined ? cleanup : new AggregateError([failure, cleanup]) }); } }
}
