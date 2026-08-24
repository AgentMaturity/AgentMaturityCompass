/**
 * Negative tests for the credentials seam.
 *
 * Each case is written so that deleting the rule it covers turns this file red.
 * The brand is checked by compiling probe code with the real TypeScript
 * compiler, because "a raw string cannot be passed where a reference is
 * required" is a compile-time guarantee and a runtime test cannot observe it.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import {
  DuplicateCredentialLayerError,
  EmptyCredentialValueError,
  InvalidCredentialRefError,
  ShadowedWriteError,
  assertSettableCredentialValue,
  assertUnshadowedWrite,
  credentialRef,
  describeCredential,
  describeCredentialLayers,
  isCredentialRefName,
  normalizeCredentialValue,
  resolveCredentialLayers
} from "../src/credentials/index.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const probePath = join(repoRoot, "tests", "credentialsBrandProbe.virtual.ts");

/**
 * Typechecks a snippet against the real `src/credentials` sources.
 *
 * The probe file is virtual — overlaid on the compiler host rather than written
 * to disk — so a crashed run cannot leave a stray module behind for the repo's
 * own typecheck to trip over.
 */
function typecheckProbe(code: string): readonly string[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    // Kept in step with the repo's own typecheck so the probe stays green when
    // this directory grows a provider that imports node builtins. Without it a
    // future `node:fs` import would fail the positive control for a reason that
    // has nothing to do with the brand.
    types: ["node"]
  };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (fileName) => (fileName === probePath ? code : readFile(fileName));
  host.fileExists = (fileName) => (fileName === probePath ? true : fileExists(fileName));
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === probePath
      ? ts.createSourceFile(fileName, code, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([probePath], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
}

const REF_IMPORT = `import { credentialRef, type CredentialRef } from "../src/credentials/index.js";`;

describe("the brand makes a raw string unusable as a reference", () => {
  // Positive control. Without it a broken probe harness — a wrong path, a
  // missing lib — would report errors for every snippet and the negative cases
  // below would pass while proving nothing.
  test("the probe harness reports no errors for correct code", () => {
    const diagnostics = typecheckProbe(
      `${REF_IMPORT}\nexport const ref: CredentialRef = credentialRef("OPENAI_API_KEY");\n`
    );
    expect(diagnostics).toEqual([]);
  });

  test("assigning a string to a CredentialRef does not compile", () => {
    const diagnostics = typecheckProbe(
      `${REF_IMPORT}\nconst raw: string = "OPENAI_API_KEY";\nexport const ref: CredentialRef = raw;\n`
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.join(" ")).toContain("not assignable");
  });

  test("passing a string literal where a reference is required does not compile", () => {
    const diagnostics = typecheckProbe(
      `${REF_IMPORT}\n` +
        `declare function needsRef(ref: CredentialRef): void;\n` +
        `export const call = () => needsRef("OPENAI_API_KEY");\n`
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.join(" ")).toContain("not assignable");
  });
});

describe("reference validation rejects what cannot be an environment variable", () => {
  test("names outside the grammar are refused", () => {
    for (const name of ["", " ", "1KEY", "MY-KEY", "MY.KEY", "MY KEY", "KEY=1", "sk-live-abcdef"]) {
      expect(isCredentialRefName(name)).toBe(false);
      expect(() => credentialRef(name)).toThrow(InvalidCredentialRefError);
    }
  });

  test("the rejection never echoes the offending text", () => {
    // The likeliest way to reach this error is passing a value where a name
    // belongs, so the error must not become the leak it exists to prevent.
    const pastedByMistake = "sk-live-4f8a2c9e1b7d6a3f5c0e";
    let thrown: unknown;
    try {
      credentialRef(pastedByMistake);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidCredentialRefError);
    const error = thrown as InvalidCredentialRefError;
    expect(error.code).toBe("AMC_CREDENTIAL_REF_INVALID");
    const serialized = `${error.message} ${error.stack ?? ""}`;
    expect(serialized).not.toContain(pastedByMistake);
    expect(serialized).not.toContain("4f8a2c9e1b7d6a3f5c0e");
    // The length is reported, because it is what separates a typo from a paste.
    expect(error.nameLength).toBe(pastedByMistake.length);
    expect(error.message).toContain(String(pastedByMistake.length));
  });
});

describe("an empty value is an absent value", () => {
  test("blank readings from any layer normalise to null", () => {
    for (const raw of ["", " ", "\t", "\n", "  \r\n ", null, undefined]) {
      expect(normalizeCredentialValue(raw)).toBeNull();
    }
  });

  test("a blank higher layer neither answers nor blocks a lower one", () => {
    const layers = [
      { source: "env", raw: "" },
      { source: "file", raw: "NOT-A-REAL-SECRET-canary" }
    ] as const;
    // Without the rule the environment answers with "" and reports itself as
    // the source, which would also make the reference unwritable.
    expect(resolveCredentialLayers(layers)).toEqual({
      value: "NOT-A-REAL-SECRET-canary",
      source: "file"
    });
    expect(describeCredentialLayers(layers)).toEqual({
      configured: true,
      source: "file",
      writable: true
    });
  });

  test("a reference whose only layer is blank is unconfigured, not configured-with-blank", () => {
    const layers = [{ source: "user-env", raw: "   " }] as const;
    expect(resolveCredentialLayers(layers)).toEqual({ value: null, source: null });
    expect(describeCredentialLayers(layers).configured).toBe(false);
  });

  test("setting a blank value is refused instead of stored", () => {
    const ref = credentialRef("OPENAI_API_KEY");
    for (const blank of ["", "   ", "\n\t"]) {
      expect(() => assertSettableCredentialValue(ref, blank)).toThrow(EmptyCredentialValueError);
    }
    try {
      assertSettableCredentialValue(ref, "");
    } catch (error) {
      expect((error as EmptyCredentialValueError).code).toBe("AMC_CREDENTIAL_VALUE_EMPTY");
      expect((error as EmptyCredentialValueError).message).toContain("unset(OPENAI_API_KEY)");
    }
  });
});

describe("precedence does not depend on the order layers are supplied in", () => {
  test("the environment still wins when it is listed last", () => {
    const resolved = resolveCredentialLayers([
      { source: "user-env", raw: "canary-user" },
      { source: "project-env", raw: "canary-project" },
      { source: "file", raw: "canary-file" },
      { source: "env", raw: "canary-env" }
    ]);
    expect(resolved).toEqual({ value: "canary-env", source: "env" });
  });

  test("the file layer still outranks a project env listed first", () => {
    const resolved = resolveCredentialLayers([
      { source: "project-env", raw: "canary-project" },
      { source: "file", raw: "canary-file" }
    ]);
    expect(resolved).toEqual({ value: "canary-file", source: "file" });
  });

  test("a repeated layer is a caller bug and is reported as one", () => {
    expect(() =>
      resolveCredentialLayers([
        { source: "file", raw: "canary-a" },
        { source: "file", raw: "canary-b" }
      ])
    ).toThrow(DuplicateCredentialLayerError);
  });
});

describe("describe() cannot carry a value", () => {
  test("no resolved value appears anywhere in a description", () => {
    const secretShaped = "NOT-A-REAL-SECRET-canary-9f8e7d";
    const description = describeCredentialLayers([{ source: "file", raw: secretShaped }]);
    expect(JSON.stringify(description)).not.toContain(secretShaped);
    expect(Object.keys(description)).toEqual(["configured", "source", "writable"]);
  });

  test("a description is frozen, so a value cannot be attached after the fact", () => {
    const description = describeCredential("file");
    expect(Object.isFrozen(description)).toBe(true);
    expect(() => {
      (description as unknown as Record<string, unknown>).value = "NOT-A-REAL-SECRET-canary";
    }).toThrow(TypeError);
    expect(Object.keys(description)).toEqual(["configured", "source", "writable"]);
  });
});

describe("writes shadowed by the process environment are refused", () => {
  const ref = credentialRef("OPENAI_API_KEY");

  test("a reference answered by the environment cannot be written", () => {
    expect(() => assertUnshadowedWrite(ref, "env")).toThrow(ShadowedWriteError);
    let thrown: unknown;
    try {
      assertUnshadowedWrite(ref, "env");
    } catch (error) {
      thrown = error;
    }
    const error = thrown as ShadowedWriteError;
    expect(error.code).toBe("AMC_CREDENTIAL_SHADOWED_WRITE");
    expect(error.ref).toBe("OPENAI_API_KEY");
    expect(error.shadowingSource).toBe("env");
    // Loud means actionable: the message names the reference and the fix.
    expect(error.message).toContain("OPENAI_API_KEY");
    expect(error.message).toContain("unset OPENAI_API_KEY");
  });

  test("every other layer, and an unconfigured reference, stay writable", () => {
    // A rule that refused writes whenever anything was configured would break
    // the ordinary case: overriding a project .env is exactly what set() is for.
    for (const source of ["file", "project-env", "user-env", null] as const) {
      expect(() => assertUnshadowedWrite(ref, source)).not.toThrow();
      expect(describeCredential(source).writable).toBe(true);
    }
  });
});
