import { describe, expect, it } from "vitest";
import { assertSafeTarMemberPath } from "../src/security/safeTarArchive.js";

/**
 * G6-19: seventeen sites extracted archives with a raw `tar -xzf`, bypassing
 * the containment limits a sibling helper already provided. Routing them all
 * through that helper exposed two false positives in it — the archive's own
 * "./" root entry and ordinary "./file" members were rejected as escapes.
 *
 * Relaxing those cases must not weaken traversal protection, which is what
 * these tests pin.
 */
const opts = { label: "test archive", maxPathBytes: 1024 };

describe("tar member path validation", () => {
  it("accepts ordinary members", () => {
    expect(assertSafeTarMemberPath({ rawPath: "a/b/c.txt", ...opts })).toBe("a/b/c.txt");
  });

  it("accepts the archive root entry and leading ./", () => {
    // Emitted by `tar -czf out.tgz -C dir .`
    expect(assertSafeTarMemberPath({ rawPath: "./", ...opts })).toBe(".");
    expect(assertSafeTarMemberPath({ rawPath: "./secret.txt", ...opts })).toBe("secret.txt");
  });

  it("still rejects parent traversal", () => {
    for (const bad of ["../etc/passwd", "a/../../etc/passwd", "..", "./../x", "a/../..", "./.."]) {
      expect(
        () => assertSafeTarMemberPath({ rawPath: bad, ...opts }),
        bad
      ).toThrow(/escapes the extraction root|unsafe member path/);
    }
  });

  it("still rejects absolute paths", () => {
    for (const bad of ["/etc/passwd", "C:/Windows/System32"]) {
      expect(() => assertSafeTarMemberPath({ rawPath: bad, ...opts }), bad).toThrow(/absolute/);
    }
  });

  it("still rejects control characters, backslashes and overlong paths", () => {
    expect(() => assertSafeTarMemberPath({ rawPath: "a\u0000b", ...opts })).toThrow(/unsafe/);
    expect(() => assertSafeTarMemberPath({ rawPath: "a\\b", ...opts })).toThrow(/unsafe/);
    expect(() =>
      assertSafeTarMemberPath({ rawPath: "a".repeat(2000), label: "t", maxPathBytes: 1024 })
    ).toThrow(/unsafe/);
  });
});
