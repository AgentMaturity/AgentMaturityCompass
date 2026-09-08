import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createImportedExternalEvidence } from "../../dist/standard/externalEvidenceProfile.js";

// Synthetic fixtures only. This generator does not invoke Pi, DSH or any model.
const directory = resolve(process.argv[2] ?? "tmp/external-evidence-examples");
mkdirSync(directory, { recursive: true });
for (const [producer, version] of [["pi-session", "3"], ["dsh-session", "2"]]) {
  const original = Buffer.from(`${JSON.stringify({ synthetic: true, producer, version, scenario: "failed-tool-then-cancelled" })}\n`);
  const event = (id, kind, parentId, toolCallId, outcome) => ({
    id, kind, parentId, toolCallId, outcome, sourceTime: null, durationNs: null, cost: null, attributes: { synthetic: true }
  });
  const profile = createImportedExternalEvidence({
    source: { producer, version, originalSha256: createHash("sha256").update(original).digest("hex"), mediaType: "application/json" },
    session: { id: `synthetic:${producer}:child`, parentSessionId: `synthetic:${producer}:parent` },
    normalizer: "amc-profile-example/1", ingestedAt: "2026-09-08T00:00:00.000Z",
    losses: ["Synthetic conformance example, not a runtime capture. Parent session evidence is not included. Source timing and cost are unknown."],
    events: [event("e1", "input", null, null, null), event("e2", "tool-call", "e1", "call1", null),
      event("e3", "tool-result", "e2", "call1", "failure"), event("e4", "cancel", "e1", null, "cancelled")]
  });
  writeFileSync(resolve(directory, `${producer}.original.json`), original);
  writeFileSync(resolve(directory, `${producer}.profile.json`), `${JSON.stringify(profile, null, 2)}\n`);
}
console.log(`Synthetic evidence examples written to ${directory}`);
