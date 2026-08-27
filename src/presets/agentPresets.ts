import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { DELEGATION_SCOPE_TOKENS } from "../agent/delegationScope.js";

/**
 * Agent presets (plan P6.3): a named composition an operator can invoke.
 *
 * A preset names a model, a tool mode, an approval gate and a delegation
 * posture — which is to say it decides what an agent may do. That makes
 * `.amc/agents.yaml` a policy surface, signed and verified like `.amc/tools.yaml`,
 * `.amc/adapters.yaml` and `.amc/schedules.yaml`, and fail-closed when the
 * signature does not verify. Otherwise anyone who can write a file can compose
 * an agent with capabilities nobody granted.
 *
 * STRICT, AND THAT IS THE POINT. Unknown fields are REFUSED rather than ignored.
 * A preset is read by a person and executed by a machine, and the gap between
 * those two readings is exactly where a typo lives: `deligate: true` silently
 * dropped gives an operator a preset that does not do what it plainly says, with
 * nothing anywhere reporting the difference. Every enum is closed for the same
 * reason.
 *
 * WHAT A PRESET CANNOT DO. It cannot grant a capability the operator's other
 * policy withholds. `delegate.enabled` still requires `delegate` in the signed
 * tool allowlist, because that gate lives in the toolset and this file does not
 * touch it — the two-party grant survives a preset saying yes. A preset chooses
 * a composition; it does not overrule the policies that composition runs under.
 */

const delegateSchema = z
  .object({
    enabled: z.boolean().default(false),
    scope: z.array(z.enum(DELEGATION_SCOPE_TOKENS as unknown as [string, ...string[]])).optional(),
    maxDepth: z.number().int().min(1).optional(),
    provider: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(1_000).optional()
  })
  .strict();

const presetSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    model: z.string().min(1),
    providerId: z.string().min(1),
    maxSteps: z.number().int().min(1).optional(),
    maxTokens: z.number().int().min(1).optional(),
    /** Which tool seam the run composes. Closed on purpose. */
    tools: z.enum(["workspace", "echo", "none"]).optional(),
    /** How a tool call is dispatched. */
    toolMode: z.enum(["native", "code"]).optional(),
    persona: z.string().min(1).optional(),
    /** Gate tool calls of this action class on human approval. */
    approveTools: z.enum(DELEGATION_SCOPE_TOKENS as unknown as [string, ...string[]]).optional(),
    delegate: delegateSchema.optional()
  })
  // `.strict()` is the load-bearing call in this file. See the module note.
  .strict();

export type AgentPreset = z.infer<typeof presetSchema>;

/**
 * Parse one preset, or throw an error naming what was wrong AND what was written.
 *
 * Zod's own message for a closed enum says only what was expected -- "expected
 * one of workspace|echo|none" -- and an operator reading that still does not
 * know which of their fields it means or what they typed. The offending value is
 * the fastest route back to the line they need to edit.
 */
function parsePreset(raw: unknown): AgentPreset {
  const result = presetSchema.safeParse(raw);
  if (result.success) return result.data;

  const detail = result.error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      const wrote = valueAt(raw, issue.path);
      const got = wrote === undefined ? "" : ` (got ${JSON.stringify(wrote)})`;
      return `${where}: ${issue.message}${got}`;
    })
    .join("; ");
  const id = raw !== null && typeof raw === "object" && typeof (raw as Record<string, unknown>)["id"] === "string"
    ? (raw as Record<string, unknown>)["id"] as string
    : "(unnamed)";
  throw new Error(`preset "${id}" is not valid -- ${detail}`);
}

/** The value a zod issue path points at, for quoting it back. */
function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let cursor: unknown = raw;
  for (const key of path) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<PropertyKey, unknown>)[key];
  }
  return cursor;
}

export function presetsPath(workspace: string): string {
  return join(workspace, ".amc", "agents.yaml");
}

export function initPresets(workspace: string): void {
  ensureDir(join(workspace, ".amc"));
  if (!pathExists(presetsPath(workspace))) savePresets(workspace, []);
}

/**
 * Validate, write and sign. Throws on anything the schema does not recognise,
 * so a malformed preset never reaches disk to be discovered at run time.
 */
export function savePresets(workspace: string, presets: readonly unknown[]): void {
  ensureDir(join(workspace, ".amc"));
  const parsed = presets.map((one) => parsePreset(one));
  writeFileAtomic(presetsPath(workspace), YAML.stringify({ presets: parsed }), 0o644);
  signFileWithAuditor(workspace, presetsPath(workspace));
}

export type ReadPresets =
  | { readonly ok: true; readonly presets: readonly AgentPreset[] }
  | { readonly ok: false; readonly reason: string };

export function readPresets(workspace: string): ReadPresets {
  const path = presetsPath(workspace);
  if (!pathExists(path)) return { ok: true, presets: [] };

  const signature = verifySignedFileWithAuditor(workspace, path);
  if (!signature.valid) {
    return {
      ok: false,
      reason: `${path} failed signature verification (${signature.reason ?? "unknown"}); refusing to compose an agent it may define`
    };
  }
  try {
    const parsed = z
      .object({ presets: z.array(presetSchema).default([]) })
      .parse(YAML.parse(readUtf8(path)) ?? {});
    return { ok: true, presets: parsed.presets };
  } catch (error) {
    return { ok: false, reason: `${path} could not be read: ${String(error)}` };
  }
}

export type ResolvedPreset =
  | { readonly ok: true; readonly preset: AgentPreset }
  | { readonly ok: false; readonly reason: string };

/** Look one up by id, or explain why not — naming what the workspace does have. */
export function resolvePreset(workspace: string, id: string): ResolvedPreset {
  const read = readPresets(workspace);
  if (!read.ok) return { ok: false, reason: read.reason };

  const preset = read.presets.find((one) => one.id === id);
  if (preset) return { ok: true, preset };

  return {
    ok: false,
    reason: read.presets.length === 0
      ? `no presets are defined in this workspace, so "${id}" names nothing`
      : `no preset named "${id}"; this workspace has: ${read.presets.map((one) => one.id).join(", ")}`
  };
}
