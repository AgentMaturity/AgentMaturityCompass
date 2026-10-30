/**
 * The agent's latest prompt pack (Score's signed `.amcprompt`) from one read of its bytes: verifyWorkspacePromptPack
 * runs over a private copy of exactly those bytes and their `.sha256` sidecar, and the system texts are taken from the
 * same copy, so the verdict, the recorded sha256 and any text a caller loads describe the same bytes. Used by A4
 * Adapt's integrity check and by the Studio native-task loader (P2-37).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { inspectPromptPackArtifact } from "./promptPackArtifact.js";
import { verifyWorkspacePromptPack } from "./promptPackVerifier.js";
import { promptLatestPackPath } from "./promptPolicyStore.js";

interface PromptPackSystemTexts { readonly openai: string; readonly anthropic: string; readonly gemini: string }
export type PromptPackSnapshot =
  | { readonly present: false; readonly sha256: null; readonly packId: null; readonly verified: null; readonly problems: 0; readonly system: null }
  | { readonly present: true; readonly sha256: string | null; readonly packId: string | null; readonly verified: boolean; readonly problems: number;
    /** Only when verified: the provider system texts of the verified bytes. */
    readonly system: PromptPackSystemTexts | null };

export function readPromptPackSnapshot(workspace: string, agentId: string): PromptPackSnapshot {
  const path = promptLatestPackPath(workspace, agentId);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { present: false, sha256: null, packId: null, verified: null, problems: 0, system: null }
      : { present: true, sha256: null, packId: null, verified: false, problems: 1, system: null };
  }
  let sidecar: Buffer | null;
  try {
    sidecar = readFileSync(`${path}.sha256`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { present: true, sha256: sha256Hex(bytes), packId: null, verified: false, problems: 1, system: null };
    sidecar = null;
  }
  const dir = mkdtempSync(join(tmpdir(), "amc-prompt-pack-"));
  try {
    const file = join(dir, basename(path));
    writeFileSync(file, bytes, { mode: 0o600 });
    if (sidecar !== null) writeFileSync(`${file}.sha256`, sidecar, { mode: 0o600 });
    const checked = verifyWorkspacePromptPack(workspace, file);
    let system: PromptPackSystemTexts | null = null;
    if (checked.ok) {
      const files = inspectPromptPackArtifact(file).providerFiles;
      system = { openai: files.openai.systemMessage, anthropic: files.anthropic.system, gemini: files.gemini.systemInstruction };
    }
    return { present: true, sha256: sha256Hex(bytes), packId: checked.packId, verified: checked.ok, problems: checked.errors.length, system };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
