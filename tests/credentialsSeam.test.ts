import { describe, expect, test } from "vitest";
import {
  CREDENTIAL_LAYER_ORDER,
  CREDENTIAL_SOURCE_PRECEDENCE,
  type CredentialLayer,
  assertSettableCredentialValue,
  credentialRef,
  credentialRefName,
  credentialSourceRank,
  describeCredential,
  describeCredentialLayers,
  isCredentialRefName,
  isCredentialSource,
  isCredentialValuePresent,
  isWritableUnder,
  normalizeCredentialValue,
  resolveCredentialLayers,
  shadowsWrites
} from "../src/credentials/index.js";

// A placeholder that is obviously not a credential. Nothing in this suite
// asserts on a real secret shape; where a value has to exist for the fold to
// have something to resolve, it is this sentinel.
const SENTINEL = "NOT-A-REAL-SECRET-canary";

describe("credential references", () => {
  test("a validated reference is still the same string at runtime", () => {
    const ref = credentialRef("OPENAI_API_KEY");
    expect(credentialRefName(ref)).toBe("OPENAI_API_KEY");
    // Usable as a key, which is why the brand is phantom rather than a wrapper.
    expect({ [ref]: 1 }).toEqual({ OPENAI_API_KEY: 1 });
  });

  test("the grammar is the POSIX environment-variable name grammar", () => {
    for (const name of ["A", "_", "OPENAI_API_KEY", "_private", "KEY_2", "a1_B"]) {
      expect(isCredentialRefName(name)).toBe(true);
      expect(credentialRefName(credentialRef(name))).toBe(name);
    }
  });
});

describe("credential sources", () => {
  test("precedence is environment, then file, then project env, then user env", () => {
    expect([...CREDENTIAL_SOURCE_PRECEDENCE]).toEqual(["env", "file", "project-env", "user-env"]);
    expect(credentialSourceRank("env")).toBeLessThan(credentialSourceRank("file"));
    expect(credentialSourceRank("file")).toBeLessThan(credentialSourceRank("project-env"));
    expect(credentialSourceRank("project-env")).toBeLessThan(credentialSourceRank("user-env"));
    expect(CREDENTIAL_LAYER_ORDER).toEqual(CREDENTIAL_SOURCE_PRECEDENCE);
  });

  test("only the inherited environment blocks writes", () => {
    expect(shadowsWrites("env")).toBe(true);
    expect(isWritableUnder("env")).toBe(false);
    for (const source of ["file", "project-env", "user-env"] as const) {
      expect(shadowsWrites(source)).toBe(false);
      expect(isWritableUnder(source)).toBe(true);
    }
    // An unconfigured reference is writable: there is nothing outranking a write.
    expect(isWritableUnder(null)).toBe(true);
  });

  test("isCredentialSource narrows only the four known layers", () => {
    for (const source of CREDENTIAL_SOURCE_PRECEDENCE) expect(isCredentialSource(source)).toBe(true);
    for (const other of ["ENV", "keychain", "", 0, null, undefined]) {
      expect(isCredentialSource(other)).toBe(false);
    }
  });
});

describe("describe()", () => {
  test("carries exactly configured, source and writable", () => {
    const description = describeCredential("file");
    expect(Object.keys(description).sort()).toEqual(["configured", "source", "writable"]);
    expect(description).toEqual({ configured: true, source: "file", writable: true });
  });

  test("configured and writable are derived, so they cannot contradict the source", () => {
    expect(describeCredential(null)).toEqual({ configured: false, source: null, writable: true });
    expect(describeCredential("env")).toEqual({ configured: true, source: "env", writable: false });
    expect(describeCredential("user-env")).toEqual({
      configured: true,
      source: "user-env",
      writable: true
    });
  });
});

describe("the empty-value-is-absent rule", () => {
  test("a present value normalises to its trimmed form", () => {
    expect(normalizeCredentialValue(SENTINEL)).toBe(SENTINEL);
    expect(normalizeCredentialValue(` ${SENTINEL}\n`)).toBe(SENTINEL);
    expect(isCredentialValuePresent(SENTINEL)).toBe(true);
  });

  test("a settable value is the normalised one, so writes and reads round-trip", () => {
    const ref = credentialRef("OPENAI_API_KEY");
    expect(assertSettableCredentialValue(ref, `\t${SENTINEL}\n`)).toBe(SENTINEL);
  });
});

describe("layer resolution", () => {
  function layers(...entries: readonly CredentialLayer[]): readonly CredentialLayer[] {
    return entries;
  }

  test("the highest configured layer answers", () => {
    const resolved = resolveCredentialLayers(
      layers(
        { source: "env", raw: `${SENTINEL}-env` },
        { source: "file", raw: `${SENTINEL}-file` }
      )
    );
    expect(resolved).toEqual({ value: `${SENTINEL}-env`, source: "env" });
    expect(describeCredentialLayers(layers({ source: "env", raw: `${SENTINEL}-env` }))).toEqual({
      configured: true,
      source: "env",
      writable: false
    });
  });

  test("no configured layer resolves to an absent, writable credential", () => {
    const resolved = resolveCredentialLayers(
      layers({ source: "env", raw: undefined }, { source: "file", raw: null })
    );
    expect(resolved).toEqual({ value: null, source: null });
    expect(describeCredentialLayers([])).toEqual({
      configured: false,
      source: null,
      writable: true
    });
  });

  test("describe agrees with resolve about what is configured", () => {
    const cases: readonly (readonly CredentialLayer[])[] = [
      [],
      [{ source: "user-env", raw: SENTINEL }],
      [{ source: "project-env", raw: "" }, { source: "file", raw: SENTINEL }],
      [{ source: "env", raw: "   " }, { source: "user-env", raw: "  " }]
    ];
    for (const layerSet of cases) {
      const resolved = resolveCredentialLayers(layerSet);
      const described = describeCredentialLayers(layerSet);
      expect(described.configured).toBe(resolved.value !== null);
      expect(described.source).toBe(resolved.source);
    }
  });
});
