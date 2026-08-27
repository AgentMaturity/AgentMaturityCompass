import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { parseEvidenceEvent } from "../src/diagnostic/gates.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { selectRelevantEvents } from "../src/diagnostic/runner.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * AMC's own natively-executed evidence must not read back as the weakest kind.
 *
 * `docs/SCORING_METHODOLOGY.md` defines the tiers by VERIFICATION METHOD, not by
 * who watched: `OBSERVED` is evidence AMC captured itself, `SELF_REPORTED` is
 * "the agent's own claims" at 0.4x weight and "cannot exceed L3 alone". The
 * native spine wrote no `trustTier` at all, and `trustTierFromMeta` returns
 * `SELF_REPORTED` for anything absent — so AMC's own governed, hash-chained,
 * signed agent-loop rows were scored as unverified agent claims, while a foreign
 * CLI merely watched through `adapters run` was stamped `OBSERVED` and outranked
 * them.
 *
 * ADR-6 says the opposite in as many words: "observation can't reach L4/L5
 * OBSERVED_HARDENED evidence the way native execution can."
 */
const PASS = "native-tier-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-tier-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  return dir;
}

/** Run one native session and read its rows back the way scoring does. */
function nativeRows(dir: string): ReturnType<typeof parseEvidenceEvent>[] {
  const session = new SessionService(dir);
  session.open({
    agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
  });
  session.recordSystemPrompt("you are careful");
  const sessionId = session.sessionId;
  session.close({ reason: "completed" });

  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    const rows = db
      .prepare("SELECT * FROM evidence_events WHERE session_id = ?")
      .all(sessionId) as EvidenceEvent[];
    return rows.map(parseEvidenceEvent);
  } finally {
    db.close();
  }
}

describe("native execution is observed evidence", () => {
  it("reads back as OBSERVED, not as the agent's own claim", () => {
    const dir = workspace();

    const parsed = nativeRows(dir);

    expect(parsed.length, "the session really wrote rows").toBeGreaterThan(0);
    for (const row of parsed) {
      expect(row.trustTier, `${row.event_type} is AMC's own capture, not a claim`).toBe("OBSERVED");
    }
  });

  it("survives the L4 and L5 tier filter", () => {
    // `acceptedTrustTiers` is ["OBSERVED","ATTESTED","SELF_REPORTED"] up to L3,
    // ["OBSERVED","ATTESTED"] at L4 and ["OBSERVED"] at L5, and gates.ts filters
    // events by it — so SELF_REPORTED native rows were dropped entirely above L3.
    //
    // NECESSARY, NOT SUFFICIENT. Surviving the tier filter is not the same as
    // scoring: a second, independent gate still excludes these rows, and the
    // test below pins it. Read this one as "the tier no longer disqualifies
    // them", never as "native evidence now counts".
    const dir = workspace();
    const gates = questionBank[0]?.gates ?? [];
    const parsed = nativeRows(dir);

    for (const level of [4, 5]) {
      const gate = gates.find((g) => g.level === level);
      expect(gate, `gate ${level} exists`).toBeDefined();
      const accepted = new Set(gate?.acceptedTrustTiers ?? []);
      const surviving = parsed.filter((row) => accepted.has(row.trustTier));
      expect(surviving.length, `native evidence survives the L${level} tier filter`)
        .toBeGreaterThan(0);
    }
  });

  it("does not award itself the hardened tier", () => {
    // OBSERVED_HARDENED is documented as "sandbox execution with cryptographic
    // attestation". AMC has the attestation — a signed hash chain — but not the
    // sandbox: `SandboxRunner.run()` has zero production call sites and
    // `ToolsetReadiness.confined` only reports whether a backend COULD be
    // selected. Claiming the top tier here would replace one dishonest label
    // with another, and would open the seven governor rules that require it.
    const dir = workspace();

    const parsed = nativeRows(dir);

    expect(parsed.every((row) => row.trustTier !== "OBSERVED_HARDENED")).toBe(true);
  });
});

describe("the tier was only one of two gates", () => {
  it("still counts toward no question, because the spine tags none", () => {
    // The honest limit of the fix above, pinned so it cannot be mistaken for
    // done. r224 made untagged evidence count toward NO question at any level
    // (`selectRelevantEvents` returns [] when strict binding is on, which is the
    // default) — and nothing under src/session/ ever writes a `questionId`.
    //
    // So the spine's rows now carry the right tier and still score nothing. The
    // tier matters elsewhere regardless: `deriveTrustSummaryFromRun`
    // (src/governor/actionPolicyEngine.ts:897) derives the governor's tier from
    // `evidenceTrustCoverage.observed >= 0.5`, a ratio over the window that owes
    // nothing to question binding.
    //
    // Closing this second gate means projecting spine facts onto questions the
    // way src/tools/toolEvidence.ts already does for tool executions. That is
    // its own change, deliberately not smuggled into a trust-tier fix.
    const dir = workspace();
    const parsed = nativeRows(dir);
    const anyQuestionId = questionBank[0]?.id ?? "AMC-1.7";

    const selected = selectRelevantEvents(anyQuestionId, parsed, 5, new Set<string>());

    expect(parsed.length).toBeGreaterThan(0);
    expect(selected, "untagged spine rows count toward no question").toEqual([]);
  });
});
