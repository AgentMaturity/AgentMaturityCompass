import { z } from "zod";
import { collectAgentFacts } from "../aibom/collect.js";
import { latestAssuranceReports } from "../assurance/assuranceRunner.js";
import { RUNNER_BINARY_PATH } from "../assurance/evidenceWriters.js";
import { openLedger } from "../ledger/ledger.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { verifiedRedTeamReports } from "../redteam/redteamStore.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { passportSignatureSchema, type PassportJson } from "./passportSchema.js";

/**
 * The passport's harness companion (SH-TRUST-05): what model route, tools and signed policies the agent runs with, and
 * which sealed assurance and red-team runs its scores come from, as a SEPARATE signed member of the `.amcpass` tar
 * (`harness/harness.json` + `harness/harness.sig`). `passport.json` keeps its `v: 1` shape and digest, so a verifier
 * built before this change still verifies a new passport and simply never looks at the companion; a verifier that
 * knows it checks its signature and that `passportSha256` binds it to this passport.
 *
 * Every value comes from a signature-verified file (`collectAgentFacts`), a sealed report the readers already refuse
 * when unbacked (`latestAssuranceReports`, `verifiedRedTeamReports`, both behind the provenance gate) or the ledger's
 * own sessions table. Anything not recorded is null and named in `unknown`; nothing is 0 for "not measured".
 */
const sha = z.string().length(64);
const scoreRef = z.strictObject({ runId: z.string().min(1), reportSha256: sha, sessionId: z.string().min(1).nullable(), ts: z.number().int(),
  overallScore0to100: z.number().min(0).max(100).nullable(), evidenceStatus: z.enum(["MEASURED", "INSUFFICIENT_EVIDENCE"]).nullable() });

export const passportHarnessSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("amc.passport-harness"),
  passportId: z.string().min(1),
  /** sha256 of the canonical passport.json this companion belongs to. */
  passportSha256: sha,
  agentId: z.string().min(1),
  generatedTs: z.number().int(),
  model: z.strictObject({ providerTemplate: z.string(), providerRoute: z.string(), upstreamId: z.string(),
    declaredModels: z.array(z.strictObject({ id: z.string(), preferred: z.boolean(), route: z.string() })) }).nullable(),
  tools: z.strictObject({ names: z.array(z.string()), actionClasses: z.array(z.string()), mcpServers: z.array(z.string()), catalogDigest: sha }).nullable(),
  /** Every signed configuration file read for this agent, with its digest and signature status; only verified ones fed `model` and `tools`. */
  policy: z.strictObject({ signedFiles: z.array(z.strictObject({ path: z.string(), sha256: sha, signature: z.string() })) }),
  scores: z.strictObject({ assurance: scoreRef.nullable(), redteam: scoreRef.nullable() }),
  /** Sealed sessions in the workspace ledger that are not runner sessions: a workspace count, since sessions carry no agent id. */
  nativeSessions: z.strictObject({ scope: z.literal("workspace"), sealedCount: z.number().int().min(0), lastSealedTs: z.number().int().nullable() }).nullable(),
  unknown: z.array(z.string())
});
export type PassportHarness = z.infer<typeof passportHarnessSchema>;
export type PassportHarnessSignature = z.infer<typeof passportSignatureSchema>;

export const passportDigest = (passport: PassportJson): string => sha256Hex(Buffer.from(canonicalize(passport), "utf8"));

function nativeSessions(workspace: string, unknown: string[]): PassportHarness["nativeSessions"] {
  try {
    const ledger = openLedger(workspace, { readonly: true });
    try {
      const row = ledger.db.prepare("SELECT COUNT(*) AS n, MAX(ended_ts) AS last FROM sessions WHERE session_seal_sig IS NOT NULL AND ended_ts IS NOT NULL AND binary_path NOT IN (?, ?)")
        .get(RUNNER_BINARY_PATH.assurance, RUNNER_BINARY_PATH.redteam) as { n: number; last: number | null };
      return { scope: "workspace", sealedCount: row.n, lastSealedTs: row.last };
    } finally { ledger.close(); }
  } catch (error) {
    unknown.push(`nativeSessions: ledger not readable (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

/** Builds the companion for an AGENT-scoped passport from signed artifacts and sealed, provenance-gated runs only. */
export function buildPassportHarness(workspace: string, passport: PassportJson, agentId: string, generatedTs = Date.now()): PassportHarness {
  const facts = collectAgentFacts(workspace, agentId);
  const unknown = [...facts.unknown];
  const window = { workspace, agentId, windowStartTs: 0, windowEndTs: generatedTs };
  let assurance: PassportHarness["scores"]["assurance"] = null;
  try {
    const latest = latestAssuranceReports(window)[0];
    if (latest) assurance = { runId: latest.assuranceRunId, reportSha256: latest.reportJsonSha256, sessionId: latest.sessionId ?? null, ts: latest.ts,
      overallScore0to100: latest.evidenceStatus === "MEASURED" ? latest.overallScore0to100 : null, evidenceStatus: latest.evidenceStatus ?? null };
    else unknown.push("assurance: no sealed, backed assurance run");
  } catch (error) {
    unknown.push(`assurance: ${error instanceof Error ? error.message : String(error)}`);
  }
  // A tampered, unreadable or newer unsigned run blocks the newest verified one (refusedRunsBlocking): never roll back to older evidence.
  const redteamRuns = verifiedRedTeamReports(window);
  const redteam = redteamRuns.blocking.length === 0 ? redteamRuns.reports[0] : undefined;
  if (redteamRuns.blocking.length > 0) unknown.push(`redteam: INSUFFICIENT_EVIDENCE, ${redteamRuns.blocking.length} refused run(s) block the newest verified one (${[...new Set(redteamRuns.blocking.map((row) => row.reason))].join(", ")})`);
  else if (!redteam) unknown.push("redteam: no signed, sealed, backed red-team run");
  const tools = facts.tools.length === 0 && facts.unknown.some((row) => row.startsWith("tools:")) ? null : {
    names: facts.tools.map((tool) => tool.name), actionClasses: [...new Set(facts.tools.map((tool) => tool.actionClass))].sort(),
    mcpServers: [...new Set(facts.tools.flatMap((tool) => tool.mcp === null ? [] : [tool.mcp.id]))].sort(),
    catalogDigest: sha256Hex(canonicalize(facts.tools))
  };
  return passportHarnessSchema.parse({
    v: 1, kind: "amc.passport-harness", passportId: passport.passportId, passportSha256: passportDigest(passport), agentId, generatedTs,
    model: facts.agent === null ? null : { providerTemplate: facts.agent.providerTemplate, providerRoute: facts.agent.providerRoute, upstreamId: facts.agent.upstreamId, declaredModels: facts.models },
    tools,
    policy: { signedFiles: facts.signedFiles },
    scores: { assurance, redteam: redteam === undefined ? null : { runId: redteam.runId, reportSha256: redteam.reportJsonSha256!, sessionId: redteam.sessionId ?? null, ts: redteam.ts,
      overallScore0to100: redteam.evidenceStatus === "MEASURED" ? redteam.overallScore0to100 : null, evidenceStatus: redteam.evidenceStatus ?? null } },
    nativeSessions: nativeSessions(workspace, unknown),
    unknown
  });
}

export function signPassportHarness(workspace: string, harness: PassportHarness): PassportHarnessSignature {
  return passportSignatureSchema.parse(signSerializedPayloadWithAuditor(workspace, canonicalize(harness)));
}

export async function preparePassportHarnessSignatureAsync(workspace: string, harness: PassportHarness, beforeSign?: () => void) {
  const prepared = await prepareFileSignatureWithAuditor(workspace, "harness.json", Buffer.from(canonicalize(harness)), "BUNDLE", beforeSign);
  return Object.freeze({ signature: passportSignatureSchema.parse(JSON.parse(prepared.signatureBytes)), assertCurrent: prepared.assertCurrent });
}

/** The two archive members of a signed companion. */
export function passportHarnessMembers(harness: PassportHarness, signature: PassportHarnessSignature): Array<{ path: string; bytes: Buffer<ArrayBuffer> }> {
  return [
    { path: "harness/harness.json", bytes: Buffer.from(`${canonicalize(harness)}\n`) },
    { path: "harness/harness.sig", bytes: Buffer.from(`${canonicalize(signature)}\n`) }
  ];
}
