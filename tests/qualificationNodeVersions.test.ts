// P0-31 (D-12): the installed crash-recovery and Studio browser harnesses admit the
// qualified Node majors, 22 and 24, and nothing else. The patterns are read from the
// committed harness sources, because both scripts act on import and cannot be loaded.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const crashPattern = (): RegExp => {
  const literal = /assert\.match\(process\.version, \/(.+?)\/, "qualification requires Node/.exec(source("scripts/installed-crash-recovery-check.mjs"))?.[1];
  expect(literal, "crash-recovery Node version assertion").toBeDefined();
  return new RegExp(literal!);
};
const studioPattern = (): RegExp => {
  const literal = /assert re\.fullmatch\(r'(.+?)',a\.node_version\)/.exec(source("scripts/installed-studio-browser-check.py"))?.[1];
  expect(literal, "Studio browser --node-version assertion").toBeDefined();
  return new RegExp(`^(?:${literal!})$`); // Python re.fullmatch
};

describe.each([
  ["scripts/installed-crash-recovery-check.mjs", crashPattern],
  ["scripts/installed-studio-browser-check.py", studioPattern]
])("%s Node version pattern", (_name, pattern) => {
  test.each(["v22.22.0", "v22.0.0", "v24.21.0", "v24.0.0"])("accepts %s", (version) => {
    expect(pattern().test(version)).toBe(true);
  });
  test.each(["v20.19.5", "v25.5.0", "v23.11.0", "v26.0.0", "v224.0.0", "v2.4.0", "22.22.0"])("rejects %s", (version) => {
    expect(pattern().test(version)).toBe(false);
  });
});
