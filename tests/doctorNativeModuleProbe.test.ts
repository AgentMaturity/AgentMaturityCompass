import { describe, expect, it, vi } from "vitest";
import { nativeModuleCheck, type DoctorSqliteConstructor } from "../src/doctor/nativeModuleProbe.js";

describe("doctor native SQLite execution probe", () => {
  it("constructs, queries and closes only an in-memory database before reporting PASS", () => {
    const paths: string[] = [];
    const get = vi.fn(() => ({ amc_probe: 1 }));
    const prepare = vi.fn(() => ({ get }));
    const close = vi.fn();
    class Database {
      constructor(path: string) { paths.push(path); }
      prepare = prepare;
      close = close;
    }
    const load = vi.fn(() => Database);
    const check = nativeModuleCheck(load);
    expect(load).toHaveBeenCalledOnce();
    expect(paths).toEqual([":memory:"]);
    expect(prepare).toHaveBeenCalledWith("SELECT 1 AS amc_probe");
    expect(get).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(check.status).toBe("PASS");
    expect(check.message).toContain("opened, queried and closed");
  });
  it("fails when require succeeds but native construction fails with an ABI mismatch", () => {
    class BrokenDatabase {
      constructor(_path: string) { throw new Error("NODE_MODULE_VERSION mismatch /private/loader-path secret-fixture"); }
      prepare() { return { get: () => ({ amc_probe: 1 }) }; }
      close() {}
    }
    const load = vi.fn(() => BrokenDatabase);
    const check = nativeModuleCheck(load);
    expect(load).toHaveBeenCalledOnce();
    expect(check.status).toBe("FAIL");
    expect(check.message).toContain("different Node version");
    expect(check.fixHint).toContain("npm rebuild better-sqlite3");
    expect(JSON.stringify(check)).not.toContain("secret-fixture");
    expect(JSON.stringify(check)).not.toContain("/private/");
  });
  it.each([null, {}, { amc_probe: 0 }, { amc_probe: "1" }])("rejects a wrong query result and still closes: %j", result => {
    const close = vi.fn();
    class Database { prepare() { return { get: () => result }; } close = close; }
    expect(nativeModuleCheck(() => Database).status).toBe("FAIL");
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes after a query exception without echoing raw loader or database messages", () => {
    const close = vi.fn();
    class Database { prepare() { throw new Error("secret-fixture-query\n/private/path"); } close = close; }
    const check = nativeModuleCheck(() => Database);
    expect(check.status).toBe("FAIL");
    expect(close).toHaveBeenCalledOnce();
    expect(JSON.stringify(check)).not.toMatch(/secret-fixture|\/private/);
  });
  it("does not report PASS if the database cannot close", () => {
    class Database { prepare() { return { get: () => ({ amc_probe: 1 }) }; } close() { throw new Error("close failed"); } }
    expect(nativeModuleCheck(() => Database).status).toBe("FAIL");
  });
  it("retains actionable failure when the JavaScript wrapper cannot load", () => {
    const load = (): DoctorSqliteConstructor => { throw new Error("secret-fixture-loader"); };
    const check = nativeModuleCheck(load);
    expect(check.status).toBe("FAIL");
    expect(check.fixHint).toContain("amc doctor");
    expect(JSON.stringify(check)).not.toContain("secret-fixture-loader");
  });
});
