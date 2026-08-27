import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { ingestAttachment } from "../src/attachments/attachmentIngest.js";

/**
 * Content-addressed attachments (plan P6.3).
 *
 * An attachment is untrusted content entering the model's context, so it gets
 * two things: a content address, and a gate.
 *
 * THE GATE IS `detonateAttachment`, which until now had no production consumer
 * at all -- one re-export and one test. Gating on a crude detector is defensible
 * HERE and was not for the MCP security score, and the difference is which way
 * the errors fall: detonation's failure mode is a false REFUSAL, which is
 * annoying, while the MCP score's was false TRUST -- a hostile manifest reading
 * SECURE. A detector may gate when it fails closed.
 */
const PASS = "attachment-test-passphrase";
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function session(): { dir: string; session: SessionService } {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-attach-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  const s = new SessionService(dir);
  s.open({ agentId: "a", harnessVersion: "1", compositionDigest: "c", policyDigest: "p" });
  s.startTurn({ trigger: "user" });
  return { dir, session: s };
}

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("an attachment is addressed by its content", () => {
  it("records it with its own digest as the surface part", () => {
    // The SurfacePartRef invariant again: a projected part's sha256 is some
    // row's payload_sha256. For an attachment that row IS the attachment, which
    // is what content-addressing means here -- the bytes are the address.
    const { dir, session: s } = session();

    const result = ingestAttachment({ session: s, filename: "notes.txt", content: "hello there" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sha256).toBe(sha("hello there"));

    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const row = db.prepare("SELECT event_type FROM evidence_events WHERE payload_sha256 = ?")
      .get(result.sha256) as { event_type: string } | undefined;
    db.close();
    expect(row?.event_type).toBe("user/attachment");
    s.close({ reason: "completed" });
  });

  it("gives the same bytes the same address twice", () => {
    const { session: s } = session();

    const first = ingestAttachment({ session: s, filename: "a.txt", content: "same bytes" });
    const second = ingestAttachment({ session: s, filename: "b.txt", content: "same bytes" });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.sha256, "the address is the content, not the name").toBe(first.sha256);
    s.close({ reason: "completed" });
  });

  it("keeps two same-named files with different content separately addressable", () => {
    // Stated behaviourally rather than as a slot format, because the slot is the
    // key `replace`/`retract` target by: two versions of `notes.txt` that shared
    // one slot could not be told apart, and an operation meant for one would
    // land on the other.
    const { dir, session: s } = session();
    ingestAttachment({ session: s, filename: "notes.txt", content: "first version" });
    ingestAttachment({ session: s, filename: "notes.txt", content: "second version" });
    s.close({ reason: "completed" });

    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const rows = db
      .prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'user/attachment'")
      .all() as Array<{ meta_json: string }>;
    db.close();

    const slots = rows.map((row) => {
      const meta = JSON.parse(row.meta_json) as { amcSession?: { surface?: { slot?: string } } };
      return meta.amcSession?.surface?.slot ?? "";
    });
    expect(slots).toHaveLength(2);
    expect(new Set(slots).size, "same name, different content, different slots").toBe(2);
  });

  it("puts it on the surface where the model will read it", () => {
    const { session: s } = session();
    ingestAttachment({ session: s, filename: "notes.txt", content: "hello there" });

    const history = s.projectHistory();
    const parts = history.flatMap((message) => message.parts);

    expect(parts.some((part) => part.sha256 === sha("hello there"))).toBe(true);
    s.close({ reason: "completed" });
  });
});

describe("an attachment is gated before it reaches the model", () => {
  it("refuses an executable", () => {
    const { session: s } = session();

    const result = ingestAttachment({ session: s, filename: "payload.exe", content: "MZ..." });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/payload\.exe/);
    s.close({ reason: "completed" });
  });

  it("records nothing at all when it refuses", () => {
    // A refused attachment must not reach the surface by a side door. The whole
    // point of the gate is that the model never sees it.
    const { dir, session: s } = session();
    const before = s.projectHistory().flatMap((m) => m.parts).length;

    ingestAttachment({ session: s, filename: "payload.exe", content: "MZ..." });

    expect(s.projectHistory().flatMap((m) => m.parts).length, "nothing was added")
      .toBe(before);
    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const n = (db.prepare("SELECT COUNT(*) n FROM evidence_events WHERE event_type = 'user/attachment'")
      .get() as { n: number }).n;
    db.close();
    expect(n, "and no attachment row was written").toBe(0);
    s.close({ reason: "completed" });
  });

  it("names what it found, not just that it refused", () => {
    const { session: s } = session();
    const result = ingestAttachment({ session: s, filename: "macro.docm", content: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.length, "the operator is told why").toBeGreaterThan(20);
    s.close({ reason: "completed" });
  });

  it("lets an ordinary document through", () => {
    const { session: s } = session();
    const result = ingestAttachment({ session: s, filename: "report.pdf", content: "%PDF-1.4" });
    expect(result.ok, result.ok ? "" : result.reason).toBe(true);
    s.close({ reason: "completed" });
  });
});
