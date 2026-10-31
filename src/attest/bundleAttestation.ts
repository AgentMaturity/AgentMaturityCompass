/**
 * `amc bundle export --attest`: writes the agent's AIBOM and a signed in-toto statement about the run into a bundle being
 * built, before its manifest is gathered, so the signed manifest lists both. The statement is DSSE-signed with the
 * workspace's artifact-seal key in a key-based Sigstore bundle. The claim comes from the run report bytes the bundle
 * carries (the same bytes its subject digest names), never from a second read.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAibom } from "../aibom/aibom.js";
import { collectAgentFacts } from "../aibom/collect.js";
import { envelopeForStoredRun } from "../claims/eligibility/adapters/results.js";
import { assertNotExample } from "../claims/eligibility/exampleMode.js";
import { getSigningKey } from "../crypto/keys.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import type { DiagnosticReport } from "../types.js";
import { writeFileAtomic, ensureDir } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { ed25519Signer, INTOTO_PAYLOAD_TYPE, signDsse } from "./dsse.js";
import { toSigstoreBundle } from "./sigstoreBundle.js";
import { buildControlResultsStatement, type InTotoStatement } from "./statement.js";

export const AIBOM_BUNDLE_PATH = "attestations/aibom.cdx.json";
export const ATTESTATION_BUNDLE_PATH = "attestations/control-results.sigstore.json";

/** True when the run is a labelled synthetic example (assertNotExample's rule). */
function isExampleRun(run: DiagnosticReport): boolean {
  try { assertNotExample(run, "attested"); return false; } catch { return true; }
}

export function attestBundleRoot(input: { workspace: string; root: string; agentId: string; now?: Date }): { statement: InTotoStatement; keyid: string } {
  const runBytes = readFileSync(join(input.root, "run.json"));
  const run = JSON.parse(runBytes.toString("utf8")) as DiagnosticReport;
  const envelope = envelopeForStoredRun(run, { sealVerified: sealedRunReportVerifies(input.workspace, run as unknown as Record<string, unknown>), now: Date.now() });
  const aibomBytes = Buffer.from(`${JSON.stringify(buildAibom(collectAgentFacts(input.workspace, input.agentId)), null, 2)}\n`, "utf8");
  const ledgerPath = join(input.root, "evidence", "evidence.sqlite");
  const statement = buildControlResultsStatement({
    subjects: [{ name: AIBOM_BUNDLE_PATH, bytes: aibomBytes }, { name: "run.json", bytes: runBytes }],
    // The run's seal-checked claim; an example run adds synthetic_example, which refuses the attestation.
    claimKinds: isExampleRun(run) ? [envelope.claimKind, "synthetic_example"] : [envelope.claimKind],
    signerPurpose: "artifact-seal",
    scope: { tenant: null, deployment: null, workspace: workspaceIdFromDirectory(input.workspace), agent: input.agentId, snapshot: sha256Hex(runBytes),
      profile: run.methodology?.id ?? "amc.diagnostic", profileVersion: run.methodology?.version ?? null,
      window: { start: new Date(run.windowStartTs).toISOString(), end: new Date(run.windowEndTs).toISOString() }, exclusions: [] },
    controls: [{ controlId: "amc.diagnostic", dimensions: envelope.statusDimensions }],
    evidence: existsSync(ledgerPath) ? [{ sha256: sha256Hex(readFileSync(ledgerPath)), kind: "ledger-slice" }] : [],
    verifierReport: null,
    issuedAt: input.now ?? new Date()
  });
  const signer = ed25519Signer(getSigningKey(input.workspace, "artifact-seal"));
  const bundle = toSigstoreBundle(signDsse(INTOTO_PAYLOAD_TYPE, Buffer.from(JSON.stringify(statement), "utf8"), signer));
  ensureDir(join(input.root, "attestations"));
  writeFileAtomic(join(input.root, AIBOM_BUNDLE_PATH), aibomBytes, 0o644);
  writeFileAtomic(join(input.root, ATTESTATION_BUNDLE_PATH), `${JSON.stringify(bundle, null, 2)}\n`, 0o644);
  return { statement, keyid: signer.keyid };
}
