import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { signFileWithAuditor } from "../org/orgSigner.js";
import { compilePromptPack } from "./promptCompiler.js";
import {
  promptLintSchema,
  promptPackSchema,
  promptPackSignatureSchema,
  promptProviderAnthropicSchema,
  promptProviderGeminiSchema,
  promptProviderGenericSchema,
  promptProviderOpenAiSchema,
  type PromptLintReport,
  type PromptPack,
  type PromptPackSignature,
  type PromptProviderFiles
} from "./promptPackSchema.js";
import { signPromptPack } from "./promptPackSigner.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function tarCreateDeterministic(sourceDir: string, outFile: string): void {
  ensureDir(dirname(outFile));
  const files = collectFiles(sourceDir);
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create prompt pack: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolvePromptRoot(tmp: string): string {
  const direct = join(tmp, "amc-prompt");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(tmp, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = join(tmp, entry.name);
    if (pathExists(join(candidate, "pack.json")) && pathExists(join(candidate, "pack.sig"))) {
      return candidate;
    }
  }
  return tmp;
}

function parseProviderFiles(root: string): PromptProviderFiles {
  return {
    openai: promptProviderOpenAiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "openai.json"))) as unknown),
    anthropic: promptProviderAnthropicSchema.parse(JSON.parse(readUtf8(join(root, "provider", "anthropic.json"))) as unknown),
    gemini: promptProviderGeminiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "gemini.json"))) as unknown),
    xai: promptProviderOpenAiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "xai.json"))) as unknown),
    openrouter: promptProviderOpenAiSchema.parse(JSON.parse(readUtf8(join(root, "provider", "openrouter.json"))) as unknown),
    generic: promptProviderGenericSchema.parse({
      v: 1,
      systemMessage: readUtf8(join(root, "provider", "openai.json")).length > 0
        ? (JSON.parse(readUtf8(join(root, "provider", "openai.json"))) as { systemMessage: string }).systemMessage
        : ""
    })
  };
}

export interface PromptPackBuildResult {
  outFile: string;
  sha256: string;
  pack: PromptPack;
  signature: PromptPackSignature;
  lint: PromptLintReport;
  providerFiles: PromptProviderFiles;
}

export function buildPromptPackArtifact(params: {
  workspace: string;
  agentId?: string;
  outFile: string;
}): PromptPackBuildResult {
  const compiled = compilePromptPack({
    workspace: params.workspace,
    agentId: params.agentId
  });
  const signature = promptPackSignatureSchema.parse(signPromptPack(params.workspace, compiled.pack));
  const signerPub =
    signature.envelope
      ? Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8")
      : (getPublicKeyHistory(params.workspace, "auditor")[0] ?? "");
  if (!signerPub) {
    throw new Error("missing signer pubkey for prompt pack");
  }

  const temp = mkdtempSync(join(tmpdir(), "amc-prompt-pack-"));
  const outFile = resolve(params.outFile);
  try {
    const root = join(temp, "amc-prompt");
    ensureDir(root);
    ensureDir(join(root, "meta"));
    ensureDir(join(root, "provider"));
    ensureDir(join(root, "lint"));

    writeFileAtomic(join(root, "pack.json"), `${canonicalize(compiled.pack)}\n`, 0o644);
    writeFileAtomic(join(root, "pack.sig"), `${canonicalize(signature)}\n`, 0o644);
    writeFileAtomic(join(root, "signer.pub"), signerPub, 0o644);

    writeFileAtomic(join(root, "meta", "cgx.pack.sha256"), `${compiled.hashes.cgxPackSha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "policy.sha256"), `${compiled.hashes.policySha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "bank.sha256"), `${compiled.hashes.bankSha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "canon.sha256"), `${compiled.hashes.canonSha256}\n`, 0o644);

    writeFileAtomic(join(root, "provider", "openai.json"), `${canonicalize(compiled.providerFiles.openai)}\n`, 0o644);
    writeFileAtomic(join(root, "provider", "anthropic.json"), `${canonicalize(compiled.providerFiles.anthropic)}\n`, 0o644);
    writeFileAtomic(join(root, "provider", "gemini.json"), `${canonicalize(compiled.providerFiles.gemini)}\n`, 0o644);
    writeFileAtomic(join(root, "provider", "xai.json"), `${canonicalize(compiled.providerFiles.xai)}\n`, 0o644);
    writeFileAtomic(join(root, "provider", "openrouter.json"), `${canonicalize(compiled.providerFiles.openrouter)}\n`, 0o644);

    writeFileAtomic(join(root, "lint", "lint.json"), `${canonicalize(promptLintSchema.parse(compiled.lint))}\n`, 0o644);
    const lintSigPath = signFileWithAuditor(params.workspace, join(root, "lint", "lint.json"));
    writeFileAtomic(join(root, "lint", "lint.sig"), readFileSync(lintSigPath), 0o644);

    tarCreateDeterministic(temp, outFile);
    return {
      outFile,
      sha256: sha256Hex(readFileSync(outFile)),
      pack: compiled.pack,
      signature,
      lint: compiled.lint,
      providerFiles: compiled.providerFiles
    };
  } finally {
    cleanupDir(temp);
  }
}

export function inspectPromptPackArtifact(file: string): {
  pack: PromptPack;
  signature: PromptPackSignature;
  lint: PromptLintReport | null;
  lintSignature: unknown | null;
  lintDigestSha256: string | null;
  providerFiles: PromptProviderFiles;
  signerPub: string;
  sha256: string;
} {
  const bundle = resolve(file);
  const temp = mkdtempSync(join(tmpdir(), "amc-prompt-inspect-"));
  try {
    tarExtract(bundle, temp);
    const root = resolvePromptRoot(temp);
    const pack = promptPackSchema.parse(JSON.parse(readUtf8(join(root, "pack.json"))) as unknown);
    const signature = promptPackSignatureSchema.parse(JSON.parse(readUtf8(join(root, "pack.sig"))) as unknown);
    const lintPath = join(root, "lint", "lint.json");
    const lintSigPath = join(root, "lint", "lint.sig");
    const lint = pathExists(lintPath) ? promptLintSchema.parse(JSON.parse(readUtf8(lintPath)) as unknown) : null;
    const lintDigestSha256 = pathExists(lintPath) ? sha256Hex(readFileSync(lintPath)) : null;
    const lintSignature = pathExists(lintSigPath) ? JSON.parse(readUtf8(lintSigPath)) : null;
    const providerFiles = parseProviderFiles(root);
    const signerPub = readUtf8(join(root, "signer.pub"));
    return {
      pack,
      signature,
      lint,
      lintDigestSha256,
      lintSignature,
      providerFiles,
      signerPub,
      sha256: sha256Hex(readFileSync(bundle))
    };
  } finally {
    cleanupDir(temp);
  }
}
