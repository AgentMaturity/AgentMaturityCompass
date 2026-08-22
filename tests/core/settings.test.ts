import { describe, it, expect } from "vitest";
import Schema from "@amc/schemastery";
import {
  SettingsStore,
  SettingsConflictError,
  SettingsPathError
} from "@amc/core";

/**
 * The settings substrate later phases assume: a budget, threshold or redaction
 * rule changed under a running agent, without a restart.
 *
 * Three properties make that safe rather than merely convenient — provenance,
 * optimistic concurrency, and secret redaction — and each is pinned here.
 */
const schema = Schema.object({
  gateway: Schema.object({
    budgetUsd: Schema.number().default(10),
    apiKey: Schema.string().default("")
  }),
  enforce: Schema.object({
    failClosed: Schema.boolean().default(true)
  })
});

const store = (overrides: Partial<ConstructorParameters<typeof SettingsStore>[0]> = {}) =>
  new SettingsStore({
    schema,
    secrets: ["gateway.apiKey"],
    ...overrides
  });

describe("live settings", () => {
  it("resolves schema defaults when no layer overrides them", () => {
    const snapshot = store().snapshot();
    expect(snapshot.values["gateway.budgetUsd"]).toEqual({
      value: 10,
      source: "schema",
      secret: false
    });
  });

  it("reports which layer produced each effective value", () => {
    const snapshot = store({
      base: { gateway: { budgetUsd: 50 } },
      user: { enforce: { failClosed: false } }
    }).snapshot();

    // Provenance is the point: a value that cannot say where it came from
    // cannot be audited.
    expect(snapshot.values["gateway.budgetUsd"]!.source).toBe("base");
    expect(snapshot.values["gateway.budgetUsd"]!.value).toBe(50);
    expect(snapshot.values["enforce.failClosed"]!.source).toBe("user");
    expect(snapshot.values["enforce.failClosed"]!.value).toBe(false);
  });

  it("lets the user layer win over the base layer", () => {
    const snapshot = store({
      base: { gateway: { budgetUsd: 50 } },
      user: { gateway: { budgetUsd: 5 } }
    }).snapshot();
    expect(snapshot.values["gateway.budgetUsd"]).toEqual({
      value: 5,
      source: "user",
      secret: false
    });
  });

  it("redacts secrets on read but still stores them", () => {
    const settings = store();
    settings.set({ path: "gateway.apiKey", value: "sk-real-secret-value" });

    const snapshot = settings.snapshot();
    expect(snapshot.values["gateway.apiKey"]!.secret).toBe(true);
    expect(snapshot.values["gateway.apiKey"]!.value).not.toBe("sk-real-secret-value");
    // A settings dump is exactly the artifact that gets pasted into an issue.
    expect(JSON.stringify(snapshot)).not.toContain("sk-real-secret-value");

    // The value is still there for the thing that needs it.
    expect(settings.userLayer()).toEqual({ gateway: { apiKey: "sk-real-secret-value" } });
  });

  it("sets a secret by path without ever reading it", () => {
    const settings = store({ user: { gateway: { apiKey: "old-secret" } } });
    // Read-modify-write would require reading the secret; a path write does not.
    settings.set({ path: "gateway.budgetUsd", value: 99, expectedRevision: 0 });
    expect(settings.userLayer()).toEqual({
      gateway: { apiKey: "old-secret", budgetUsd: 99 }
    });
  });

  it("rejects a write computed against a stale revision", () => {
    const settings = store();
    const first = settings.set({ path: "gateway.budgetUsd", value: 20 });
    expect(first.revision).toBe(1);

    // A second operator read at revision 0 and is now writing blind.
    expect(() => settings.set({ path: "gateway.budgetUsd", value: 30, expectedRevision: 0 }))
      .toThrow(SettingsConflictError);
    // The rejected write must not have landed.
    expect(settings.snapshot().values["gateway.budgetUsd"]!.value).toBe(20);
  });

  it("accepts a write at the current revision", () => {
    const settings = store();
    const first = settings.set({ path: "gateway.budgetUsd", value: 20 });
    const second = settings.set({
      path: "gateway.budgetUsd",
      value: 30,
      expectedRevision: first.revision
    });
    expect(second.values["gateway.budgetUsd"]!.value).toBe(30);
    expect(second.revision).toBe(2);
  });

  it("validates the whole object, not just the leaf", () => {
    const settings = store();
    // Individually plausible, jointly wrong for the schema's type.
    expect(() => settings.set({ path: "gateway.budgetUsd", value: "not-a-number" })).toThrow();
    // A rejected write leaves the store untouched, including its revision.
    expect(settings.revision).toBe(0);
    expect(settings.snapshot().values["gateway.budgetUsd"]!.value).toBe(10);
  });

  it("refuses malformed paths", () => {
    expect(() => store().set({ path: "", value: 1 })).toThrow(SettingsPathError);
    expect(() => store().set({ path: "gateway..budgetUsd", value: 1 })).toThrow(SettingsPathError);
  });
});
