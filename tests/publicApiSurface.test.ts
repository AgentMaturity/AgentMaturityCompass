import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";

/**
 * G2-43: src/index.ts is the published package API, but nothing inside AMC
 * imports it — the CLI, routers and studio all import modules directly. That
 * means a broken or removed export in the barrel would not fail the build, and
 * would only surface for a library consumer after release.
 *
 * These tests are the guard the barrel's own header points at.
 */
describe("public API surface", () => {
  it("loads without throwing", () => {
    expect(publicApi).toBeTruthy();
  });

  it("exports no undefined bindings", () => {
    // A re-export of a symbol that has been renamed or deleted lands here as
    // undefined rather than as a build error.
    const broken = Object.entries(publicApi)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    expect(broken).toEqual([]);
  });

  it("keeps the documented entry points available", () => {
    // A representative slice across the surfaces the README documents.
    for (const name of ["initWorkspace", "runDoctorCli"]) {
      expect(publicApi).toHaveProperty(name);
      expect(typeof (publicApi as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("exposes a non-trivial surface", () => {
    // Guards against an accidental truncation of the barrel.
    expect(Object.keys(publicApi).length).toBeGreaterThan(100);
  });
});
