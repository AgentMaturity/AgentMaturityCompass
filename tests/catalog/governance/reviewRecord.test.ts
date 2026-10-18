/**
 * P1-34 review records through effectiveSupport, the one function that lets a control's support stand above
 * experimental. Each case pairs one good record with one bad one (or breaks the trust or the quorum): none promotes.
 * The reviewer is the pinned key's trust-list subject, never a record field.
 */
import { describe, expect, it } from "vitest";
import type { ReviewRecord } from "../../../src/catalog/governance/reviewRecord.js";
import { effectiveSupport, type ReviewAuthority } from "../../../src/catalog/governance/support.js";
import { digestOf } from "../../../src/catalog/digest.js";
import { loadCatalog } from "../../../src/catalog/loader.js";
import { admitKey, ed25519KeyId, loadTrustContext } from "../../../src/trust/index.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyPurpose } from "../../../src/trust/index.js";
import { AUTHOR, NOW, PINS, ROSTER, author, authority, keyA, keyB, keyC, keyLegal, keypair, operatorHome, reviewedControl, sign, signedList } from "./reviewers.js";

const catalog = loadCatalog();
const control = reviewedControl(catalog.controls.get("L0-ADV-01")!); // all seven stations, AI-drafted, no citations
const HOME = operatorHome();
const a = sign(control, keyA, "fixture-reviewer-a");
const b = sign(control, keyB, "fixture-reviewer-b", { role: "second_reviewer" });
const pinsWith = (key: typeof keyB, over: Partial<(typeof PINS)[number]>) => PINS.map((p) => (p.key === key ? { ...p, ...over } : p));

describe("effectiveSupport: the only path to reviewed support (P1-34 steps 3-4)", () => {
  it("two pinned, independent reviewers of the current content let declared reviewed support stand", () => {
    const elsewhere = sign(reviewedControl(catalog.controls.get("L0-ADV-02")!), keyC, "fixture-reviewer-c");
    const result = effectiveSupport(control, authority(HOME, [a, b, elsewhere]));
    expect(result).toMatchObject({ support: "reviewed", reasons: [], rejected: [] });
    expect(result.promotion).toEqual({ controlId: control.id, controlVersion: control.version, controlDigest: a.subject.digest,
      reviewers: ["fixture-reviewer-a", "fixture-reviewer-b"], recordIds: [a.id, b.id], recordDigests: [digestOf(a), digestOf(b)], reviewedAt: "2026-10-15", nextReviewDue: "2027-01-13" });
  });

  const older = { ...control, statement: `${control.statement} (before an edit)` };
  const forged = { ...b, notes: "edited after signing" };
  const unsigned: Partial<ReviewRecord> = { ...b };
  delete unsigned.signature;
  const agent = sign(control, keyB, "fixture-reviewer-b");
  (agent.reviewer.identity as { kind: string }).kind = "agent";
  const records: Array<[string, unknown, string, Partial<{ home: string; auth: Partial<ReviewAuthority> }>?]> = [
    ["an unpinned key", sign(control, keypair(), "fixture-reviewer-b"), "GOV_REVIEW_SIGNER_UNPINNED"],
    ["a self-review by a pinned author", sign(control, author, AUTHOR), "GOV_REVIEW_SELF_REVIEW"],
    ["a self-review matched by the author's git email", sign(control, author, AUTHOR), "GOV_REVIEW_SELF_REVIEW", { auth: { authorsOf: () => ["Another Name", "author@fixture.test"] } }],
    ["a review of older content (digest mismatch)", sign(older, keyB, "fixture-reviewer-b"), "GOV_REVIEW_SUBJECT_CHANGED"],
    ["a missing signature", unsigned, "GOV_REVIEW_RECORD_INVALID"],
    ["a malformed record", { recordVersion: 1, id: "rr-bad" }, "GOV_REVIEW_RECORD_INVALID"],
    ["an agent identity", agent, "GOV_REVIEW_RECORD_INVALID"],
    ["a blank conflicts declaration", sign(control, keyB, "fixture-reviewer-b", { reviewer: { ...b.reviewer, conflictsDeclared: " " } }), "GOV_REVIEW_RECORD_INVALID"],
    ["a forged record (edited after signing)", forged, "GOV_REVIEW_SIGNATURE_INVALID"],
    ["a borrowed signature", { ...b, signature: a.signature }, "GOV_REVIEW_SIGNATURE_INVALID"],
    ["a record naming someone other than its signer", sign(control, keyB, "fixture-reviewer-c"), "GOV_REVIEW_REVIEWER_UNKNOWN"],
    ["a revoked key", b, "GOV_REVIEW_SIGNER_UNPINNED", { home: operatorHome(pinsWith(keyB, { revoked: true })) }],
    ["a distrusted key", b, "GOV_REVIEW_SIGNER_UNPINNED", { home: operatorHome(PINS, { distrust: [{ keyId: ed25519KeyId(keyB.publicKeyPem)!,
      distrustedFrom: null, reason: "key-compromise", note: "fixture", source: "operator" }] }) }],
    ["a key pinned for another purpose", b, "GOV_REVIEW_SIGNER_UNPINNED", { home: operatorHome(pinsWith(keyB, { purposes: ["artifact-seal"] })) }],
    ["a review dated before its key was valid", sign(control, keyB, "fixture-reviewer-b", { decidedAt: "2026-08-15" }), "GOV_REVIEW_SIGNER_UNPINNED",
      { home: operatorHome(pinsWith(keyB, { validFrom: "2026-09-01T00:00:00.000Z" })) }],
    ["a review dated after the server's clock", sign(control, keyB, "fixture-reviewer-b", { decidedAt: "2026-10-19" }), "GOV_REVIEW_IN_FUTURE"],
    ["an overdue review", sign(control, keyB, "fixture-reviewer-b", { decidedAt: "2026-06-01" }), "GOV_REVIEW_OVERDUE"],
    ["an unconfirmed F5 verdict", sign(control, keyB, "fixture-reviewer-b", { aiInputs: [...b.aiInputs, { kind: "f5_verdict", ref: "wealth/fixture-pack/WLT-01", confirmed: true }] }),
      "GOV_REVIEW_F5_UNCONFIRMED"]
  ];
  it.each(records)("%s promotes nothing", (_name, bad, reason, over = {}) => {
    const result = effectiveSupport(control, authority(over.home ?? HOME, [a, bad], over.auth));
    expect(result).toMatchObject({ support: "experimental", promotion: null, reasons: ["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_TWO_HUMANS"] });
    expect(result.rejected).toEqual([{ index: 1, reason }]);
  });

  it("a trust list that does not verify (m-of-n unmet, tampered) or does not exist promotes nothing", () => {
    expect(effectiveSupport(control, authority(operatorHome(PINS, { threshold: 2 }), [a, b])).reasons[1]).toMatch(/^GOV_REVIEW_TRUST_INVALID: .*required/);
    expect(effectiveSupport(control, authority(operatorHome(PINS, { tamper: true }), [a, b])).reasons[1]).toMatch(/^GOV_REVIEW_TRUST_INVALID/);
    const empty = effectiveSupport(control, authority(operatorHome([]), [a, b]));
    expect(empty.support).toBe("experimental");
    expect(empty.rejected.map((r) => r.reason)).toEqual(["GOV_REVIEW_SIGNER_UNPINNED", "GOV_REVIEW_SIGNER_UNPINNED"]);
  });

  it("independence uses the roster's git identities and the declared name, not only the key's subject; off-roster reviewers never count", () => {
    const alice = keypair();
    const home = operatorHome([...PINS, { key: alice, subject: "asmith" }]);
    const authored = { authorsOf: () => ["Alice Smith <alice@corp>"] };
    const roster = (identities: string[]) => new Map([...ROSTER, ["asmith", { domains: ["wealth"], identities }]]);
    const as = (name: string) => sign(control, alice, "asmith", { reviewer: { ...a.reviewer, name, identity: { userId: "asmith", kind: "human" } } });
    expect(effectiveSupport(control, authority(home, [as("A. S."), b], { ...authored, experts: roster(["alice@corp"]) })).rejected)
      .toEqual([{ index: 0, reason: "GOV_REVIEW_SELF_REVIEW" }]);
    expect(effectiveSupport(control, authority(home, [as("Alice Smith"), b], { ...authored, experts: roster(["unrelated@fixture.test"]) })).rejected)
      .toEqual([{ index: 0, reason: "GOV_REVIEW_SELF_REVIEW" }]);
    expect(effectiveSupport(control, authority(home, [as("A. S."), b], authored)).rejected).toEqual([{ index: 0, reason: "GOV_REVIEW_NOT_ON_ROSTER" }]);
  });

  it("identities match after NFKC, whitespace collapsing, casefolding, +tag and trailing-dot stripping", () => {
    const alice = keypair();
    const home = operatorHome([...PINS, { key: alice, subject: "asmith" }]);
    const experts = new Map([...ROSTER, ["asmith", { domains: ["wealth"], identities: ["Alice Smith", "alice@corp.example", "HANS STRAUSS"] }]]);
    const as = sign(control, alice, "asmith", { reviewer: { ...a.reviewer, name: "A. S.", identity: { userId: "asmith", kind: "human" } } });
    const variants = [["ALICE SMITH ", " Alice@Corp.Example"], ["Alice  Smith"], ["alice+cat@corp.example"], ["Alice\u00a0Smith"], ["x <alice@corp.example.>"],
      ["\uff21lice \uff33mith"], ["Hans Strau\u00df"]];
    for (const authors of variants) {
      expect(effectiveSupport(control, authority(home, [as, b], { experts, authorsOf: () => authors })).rejected, JSON.stringify(authors))
        .toEqual([{ index: 0, reason: "GOV_REVIEW_SELF_REVIEW" }]);
    }
  });

  it("a roster entry without a git identity cannot vouch for independence, so its reviewer never counts", () => {
    const experts = new Map([...ROSTER, ["fixture-reviewer-b", { domains: [], identities: [" \u00a0"] }]]);
    expect(effectiveSupport(control, authority(HOME, [a, b], { experts })).rejected).toEqual([{ index: 1, reason: "GOV_REVIEW_ROSTER_NO_IDENTITY" }]);
  });

  it("a key some loaded list pins for another purpose is never admitted for catalog-review, even from a catalog-review-only entry", () => {
    const dir = operatorHome();
    const list = (listId: string, purposes: KeyPurpose[]) => {
      const path = join(dir, "trust", `${listId}.json`);
      writeFileSync(path, JSON.stringify(signedList([...PINS.filter((p) => p.key !== keyB), { key: keyB, subject: "fixture-reviewer-b", purposes }], listId)), { mode: 0o600 });
      return path;
    };
    const trustLists = [list("reviewers", ["catalog-review"]), list("receipts", ["receipt"])];
    expect(effectiveSupport(control, authority(dir, [a, b], { trust: { amcHome: dir, trustLists } })).rejected).toEqual([{ index: 1, reason: "GOV_REVIEW_SIGNER_UNPINNED" }]);
    const context = loadTrustContext({ amcHome: dir, trustLists, now: NOW });
    expect(admitKey({ publicKeyPem: keyB.publicKeyPem, purpose: "catalog-review", signature: "fixture", context }).status).toBe("wrong-purpose");
    expect(admitKey({ publicKeyPem: keyA.publicKeyPem, purpose: "catalog-review", signature: "fixture", context }).status).toBe("admitted");
  });

  it("trust and signatures are judged at the server's clock; asOf only looks ahead for due dates", () => {
    const home = operatorHome(pinsWith(keyB, { supersededAt: "2026-10-18T08:00:00.000Z" }));
    expect(effectiveSupport(control, authority(home, [a, b], { asOf: "2026-10-18" })).rejected).toEqual([{ index: 1, reason: "GOV_REVIEW_SIGNER_UNPINNED" }]);
    expect(effectiveSupport(control, authority(HOME, [a, b], { asOf: "2026-01-01" })).support).toBe("reviewed");
    const lapsed = [sign(control, keyA, "fixture-reviewer-a", { decidedAt: "2026-06-01" }), sign(control, keyB, "fixture-reviewer-b", { decidedAt: "2026-06-01" })];
    expect(effectiveSupport(control, authority(HOME, lapsed, { asOf: "2026-07-01" })).rejected.map((r) => r.reason)).toEqual(["GOV_REVIEW_OVERDUE", "GOV_REVIEW_OVERDUE"]);
    expect(effectiveSupport(control, authority(HOME, [a, b], { asOf: "2027-02-01" })).rejected.map((r) => r.reason)).toEqual(["GOV_REVIEW_OVERDUE", "GOV_REVIEW_OVERDUE"]);
    expect(Date.now()).toBe(NOW.getTime());
  });

  it("a catalog-review key that a list also pins for another purpose is refused for every purpose", () => {
    const home = operatorHome(pinsWith(keyB, { purposes: ["catalog-review", "artifact-seal"] }));
    expect(effectiveSupport(control, authority(home, [a, b])).rejected).toEqual([{ index: 1, reason: "GOV_REVIEW_SIGNER_UNPINNED" }]);
    const context = loadTrustContext({ amcHome: home, now: NOW });
    expect(admitKey({ publicKeyPem: keyB.publicKeyPem, purpose: "artifact-seal", signature: "fixture", context }).status).toBe("wrong-purpose");
    expect(admitKey({ publicKeyPem: keyA.publicKeyPem, purpose: "catalog-review", signature: "fixture", context }).status).toBe("admitted");
  });

  it("without review authority nothing stronger than experimental stands; it never raises a declaration", () => {
    expect(effectiveSupport(control)).toEqual({ support: "experimental", reasons: ["GOV_REVIEW_UNVERIFIED"], promotion: null, rejected: [] });
    const declared = catalog.controls.get("L0-ADV-01")!;
    expect(effectiveSupport(declared, authority(HOME, [sign(declared, keyA, "fixture-reviewer-a"), sign(declared, keyB, "fixture-reviewer-b")])))
      .toMatchObject({ support: "experimental", promotion: null });
    expect(effectiveSupport({ ...control, support: "retired" }, authority(HOME, [a, b])).support).toBe("retired");
  });
});

describe("the quorum (P1-34 step 4)", () => {
  const reasons = (records: unknown[], over: Partial<ReviewAuthority> = {}, c = control) => effectiveSupport(c, authority(HOME, records, over)).reasons;

  it("one reviewer, or one reviewer twice, is not two humans", () => {
    expect(reasons([a])).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_TWO_HUMANS"]);
    expect(reasons([a, sign(control, keyA, "fixture-reviewer-a", { id: "rr-again" })])).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_TWO_HUMANS"]);
  });

  it("needs a reviewer the D-08 roster credentials for the control's domain; the roster is empty until D-08", () => {
    expect(reasons([sign(control, keyB, "fixture-reviewer-b"), sign(control, keyC, "fixture-reviewer-c")])).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_DOMAIN_EXPERT"]);
    const uncredentialed = new Map([...ROSTER].map(([subject, entry]) => [subject, { ...entry, domains: [] }]));
    expect(reasons([a, b], { experts: uncredentialed })).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_DOMAIN_EXPERT"]);
  });

  it("reviewers who share any normalized identifier (subject or roster git identity) are one person", () => {
    const [k1, k2] = [keypair(), keypair()];
    const home = operatorHome([...PINS, { key: k1, subject: "bob@corp.example" }, { key: k2, subject: "Bob <bob@corp.example>" }]);
    const roster = new Map([...ROSTER, ["bob@corp.example", { domains: ["wealth"], identities: ["bob-work@corp.example"] }],
      ["Bob <bob@corp.example>", { domains: ["wealth"], identities: ["bob-home@corp.example"] }]]);
    const bob = [sign(control, k1, "bob@corp.example"), sign(control, k2, "Bob <bob@corp.example>")];
    expect(effectiveSupport(control, authority(home, bob, { experts: roster })).reasons).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_TWO_HUMANS"]);
    const sameGit = new Map([...ROSTER, ["fixture-reviewer-b", { domains: [], identities: ["Reviewer A <a@fixture.test>"] }]]);
    expect(reasons([a, b], { experts: sameGit })).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_TWO_HUMANS"]);
  });

  it("AI-drafted content needs a confirmation naming this control (id@version or digest); any verified objection blocks", () => {
    const vague = (key: typeof keyA, id: string) => sign(control, key, id, { aiInputs: [{ kind: "draft", ref: "some draft", confirmed: true }] });
    expect(reasons([vague(keyA, "fixture-reviewer-a"), vague(keyB, "fixture-reviewer-b")])).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_AI_DRAFT"]);
    const byDigest = sign(control, keyA, "fixture-reviewer-a", { aiInputs: [{ kind: "draft", ref: a.subject.digest, confirmed: true }] });
    expect(effectiveSupport(control, authority(HOME, [byDigest, vague(keyB, "fixture-reviewer-b")])).support).toBe("reviewed");
    const plain = (key: typeof keyA, id: string) => sign(control, key, id, { aiInputs: [] });
    expect(reasons([plain(keyA, "fixture-reviewer-a"), plain(keyB, "fixture-reviewer-b")])).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_AI_DRAFT"]);
    expect(reasons([a, b, sign(control, keyC, "fixture-reviewer-c", { decision: "request_changes" })])).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_OBJECTION"]);
  });

  it("content that cites law needs a credentialed legal reviewer, and no open re-verify item", () => {
    const wealth = reviewedControl(catalog.controls.get("L1-WLT-US-01")!); // cites Regulation E
    const two = [sign(wealth, keyA, "fixture-reviewer-a"), sign(wealth, keyB, "fixture-reviewer-b")];
    expect(reasons(two, {}, wealth)).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_LEGAL_REVIEWER"]);
    const withLegal = [sign(wealth, keyA, "fixture-reviewer-a"), sign(wealth, keyLegal, "fixture-legal", { role: "legal_reviewer" })];
    expect(effectiveSupport(wealth, authority(HOME, withLegal)).support).toBe("reviewed");
    const open = [{ id: "fixture", fact: "f", sourceToCheck: "s", owner: null, status: "open" as const, checkedAt: null, reviewRecordId: null, affects: ["us-reg-e"] }];
    expect(reasons(withLegal, { reverify: open }, wealth)).toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_REVERIFY_OPEN"]);
  });

  it("a confirmed F5 verdict counts once a confirmation row names the record", () => {
    const f5 = sign(control, keyB, "fixture-reviewer-b", { aiInputs: [...b.aiInputs, { kind: "f5_verdict", ref: "wealth/fixture-pack/WLT-01", confirmed: true }] });
    const row = { station: "wealth", packId: "fixture-pack", questionId: "WLT-01", verdict: "rewrite" as const, reviewRecordId: f5.id };
    expect(effectiveSupport(control, authority(HOME, [a, f5], { f5Confirmations: [row] })).support).toBe("reviewed");
  });
});
