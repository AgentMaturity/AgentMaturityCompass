import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { capturePublicConfigAuthority, withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { validateContextGraph } from "../context/contextGraph.js";
import { getAgentPaths, resolveAgentId, type AgentPaths } from "../fleet/paths.js";
import { assertKeysetComplete, keysetDeclared } from "../keys/keyset.js";
import { assertOwnerMode } from "../mode/mode.js";
import { assertOrgPairsCurrent, captureOrgFiles, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { prepareTargetProfileSignatureAsync } from "../targets/targetProfilePublication.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  applyArchetype, describeArchetype, mergeContextGraph, recordArchetypeAudit,
  renderEvalHarness, renderGuardrails, renderPromptAddendum, topLevelDiff
} from "./index.js";

interface NativeAttempt {
  kind: "directory" | "member";
  path: string;
  returned: boolean;
  validated: boolean;
  sha256: string | null;
}

/** Earlier native and ledger effects remain on failure; this is not a rollback receipt. */
export class ArchetypePublicationError extends Error {
  readonly code = "ARCHETYPE_PUBLICATION_PARTIAL";
  constructor(readonly phase: string, readonly attempts: readonly Readonly<NativeAttempt>[],
    readonly contextGraphHash: string | null, readonly preparedTargetSha256: string | null,
    readonly auditAttempted: boolean, readonly auditSessionId: string | null, cause: unknown) {
    super("archetype application is incomplete; earlier native or ledger effects may remain", { cause });
    this.name = "ArchetypePublicationError";
  }
}

/** Fixed maintained CLI continuation. Inputs and completed authority are never supplied by a caller receipt. */
export function captureArchetypeApply(params: { workspace: string; agentId?: string; archetypeId: string }) {
  const rawWorkspace = params.workspace, root = resolve(rawWorkspace), agentInput = params.agentId, archetypeId = params.archetypeId;
  const initialNoSign = process.env.AMC_NO_SIGN === "1";
  let refused = false, refusal: unknown, selection: AgentPaths | null = null;
  const retain = (cause: unknown) => { if (!refused) { refused = true; refusal = cause; } };
  const select = () => getAgentPaths(root, resolveAgentId(root, agentInput));
  try { selection = Object.freeze({ ...select() }); } catch (cause) { retain(cause); }
  const selectionWire = selection === null ? null : canonicalize(selection);
  const fixed = () => {
    if ((process.env.AMC_NO_SIGN === "1") !== initialNoSign) throw new Error("original archetype signing mode changed");
    if (resolve(rawWorkspace) !== root) throw new Error("original archetype workspace changed");
    assertOwnerMode(root, "archetype apply");
    if (selectionWire === null || canonicalize(select()) !== selectionWire)
      throw new Error("original archetype agent or selected paths changed");
  };
  try { fixed(); } catch (cause) { retain(cause); }
  let compatibility = initialNoSign, fresh = false, publicCurrent: (() => void) | null = null;
  if (!initialNoSign) {
    try {
      const complete = assertKeysetComplete(root), declared = keysetDeclared(root);
      if (complete === null && !declared) { compatibility = true; fresh = true; }
      else publicCurrent = capturePublicConfigAuthority(root);
    } catch (cause) { retain(cause); }
  }
  const negative = () => {
    if (refused) throw refusal;
    try { fixed(); publicCurrent?.(); } catch (cause) { retain(cause); throw cause; }
  };
  let used = false, completed: (() => void) | null = null;
  return Object.freeze({
    async apply(): Promise<ReturnType<typeof applyArchetype>> {
      if (used) throw new Error("archetype application is single-use");
      used = true;
      if (compatibility) {
        // Compatibility deliberately refuses before the literal legacy native prefix.
        negative();
        if (fresh && (assertKeysetComplete(root) !== null || keysetDeclared(root)))
          throw new Error("original fresh archetype compatibility is no longer fresh");
        negative();
        const result = applyArchetype({ workspace: rawWorkspace, agentId: agentInput, archetypeId });
        // The old call may initialize its own key set. Do not replay the obsolete fresh classifier.
        completed = negative;
        completed();
        return result;
      }
      if (selection === null) throw refusal;
      const agentId = selection.agentId;
      const archetype = describeArchetype(archetypeId);
      const agentPaths = selection;
      const attempts: NativeAttempt[] = [], own = new Map<string, OrgPairsSnapshot["members"][number]>();
      let phase = "root-directory", contextHash: string | null = null, targetHash: string | null = null;
      let auditAttempted = false, auditSessionId: string | null = null;
      const failure = (cause: unknown) => attempts.length === 0 && !auditAttempted ? cause : new ArchetypePublicationError(
        phase, Object.freeze(attempts.map(row => Object.freeze({ ...row }))), contextHash, targetHash, auditAttempted, auditSessionId, cause);
      const directory = (path: string) => {
        const attempt: NativeAttempt = { kind: "directory", path, returned: false, validated: false, sha256: null };
        attempts.push(attempt); ensureDir(path); attempt.returned = true;
      };
      const member = (path: string, bytes: Buffer) => {
        const attempt: NativeAttempt = { kind: "member", path, returned: false, validated: false, sha256: sha256Hex(bytes) };
        attempts.push(attempt); writeFileAtomic(path, bytes, 0o644); attempt.returned = true;
        const row = captureOrgFiles([path]).members[0];
        if (row === undefined || row.mode !== 0o644 || row.bytes === null || !row.bytes.equals(bytes))
          throw new Error("published archetype member differs from its actual bytes or mode");
        own.set(path, row); attempt.validated = true;
      };
      const ownCurrent = () => assertOrgPairsCurrent({ members: [...own.values()] });
      try {
        directory(agentPaths.rootDir);
        phase = "targets-directory"; directory(agentPaths.targetsDir);
        phase = "context-render";
        // Bind the actual loader recipe to the captured original path, not a later default-path redirect.
        const existingContext = (() => {
          try {
            return validateContextGraph(JSON.parse(readFileSync(agentPaths.contextGraph, "utf8")) as unknown);
          } catch (error) {
            if ((error as { code?: string })?.code === "ENOENT") {
              throw new Error([
                `Context graph not found for agent '${agentPaths.agentId}'.`,
                `Expected file: ${agentPaths.contextGraph}`,
                "Run one of the following first:",
                "  amc setup",
                "  amc init"
              ].join("\n"));
            }
            throw error;
          }
        })();
        const mergedContext = mergeContextGraph(existingContext, archetype);
        const contextDiff = topLevelDiff(existingContext, mergedContext);
        phase = "context-write"; member(agentPaths.contextGraph, Buffer.from(JSON.stringify(mergedContext, null, 2)));

        phase = "guardrails-render";
        const guardrails = renderGuardrails(archetype, pathExists(agentPaths.guardrails) ? readUtf8(agentPaths.guardrails) : null);
        phase = "guardrails-write"; member(agentPaths.guardrails, Buffer.from(guardrails));
        phase = "prompt-render";
        const prompt = renderPromptAddendum(archetype, pathExists(agentPaths.promptAddendum) ? readUtf8(agentPaths.promptAddendum) : null);
        phase = "prompt-write"; member(agentPaths.promptAddendum, Buffer.from(prompt));
        phase = "eval-render";
        const evalHarness = renderEvalHarness(archetype, pathExists(agentPaths.evalHarness) ? readUtf8(agentPaths.evalHarness) : null);
        phase = "eval-write"; member(agentPaths.evalHarness, Buffer.from(evalHarness));

        phase = "target-prepare";
        contextHash = sha256Hex(canonicalize(mergedContext));
        const targetPath = join(agentPaths.targetsDir, "default.target.json");
        let previousTarget: OrgPairsSnapshot | null = null;
        const beforeSign = () => {
          // The primitive invokes this after its real UUID/clock payload and before private capture.
          negative(); ownCurrent();
          if (previousTarget === null) previousTarget = captureOrgFiles([targetPath]);
          else assertOrgPairsCurrent(previousTarget);
        };
        const prepared = await prepareTargetProfileSignatureAsync({
          workspace: root, name: "default", contextGraphHash: contextHash, mapping: archetype.recommendedTarget
        }, beforeSign);
        const bytes = prepared.bytes;
        targetHash = sha256Hex(bytes);
        let targetPublished = false;
        const stable = () => {
          try {
            negative(); prepared.assertCurrent(); ownCurrent();
            if (!targetPublished) {
              if (previousTarget === null) throw new Error("target preparation did not capture its actual destination");
              assertOrgPairsCurrent(previousTarget);
            }
          } catch (cause) { retain(cause); throw cause; }
        };
        phase = "target-publication";
        withConfigSignaturePairLock(root, () => {
          stable();
          directory(agentPaths.targetsDir);
          stable(); member(targetPath, bytes);
          targetPublished = true; // Retire old absence only after the actual writer and validated own postimage.
          stable();
        });
        const changedFiles = [
          agentPaths.contextGraph,
          agentPaths.guardrails,
          agentPaths.promptAddendum,
          agentPaths.evalHarness,
          targetPath
        ];
        phase = "file-hashes";
        const fileHashes: Record<string, string> = {};
        for (const file of changedFiles) {
          fileHashes[file] = sha256Hex(readFileSync(file));
        }
        phase = "audit"; stable(); auditAttempted = true;
        auditSessionId = recordArchetypeAudit({ workspace: root, agentId, archetypeId: archetype.id, fileHashes });
        phase = "post-audit"; stable();
        phase = "presentation";
        completed = () => { try { stable(); } catch (cause) { throw failure(cause); } };
        return { agentId, archetypeId: archetype.id, contextDiff, changedFiles, targetPath, auditSessionId };
      } catch (cause) { throw failure(cause); }
    },
    assertCurrent() {
      if (completed === null) throw new Error("archetype application has no genuine completed continuation");
      completed();
    }
  });
}
