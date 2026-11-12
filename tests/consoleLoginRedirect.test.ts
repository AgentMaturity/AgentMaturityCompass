import { expect, test } from "vitest";
import { safeNextPage } from "../src/console/assets/loginView.js";

/** M9: after sign-in the console returns to the requested page: a console-relative page name only, never another origin. */
test("a console page name, with its query, is accepted", () => {
  expect(safeNextPage("budgets")).toBe("budgets");
  expect(safeNextPage("native-tasks?agent=default&task=abc")).toBe("native-tasks?agent=default&task=abc");
});

test("anything that could leave the console, or loop back to login, is refused", () => {
  for (const value of [null, undefined, "", "//evil.example", "https://evil.example", "/etc", "\\\\evil", "javascript:alert(1)",
    "../admin", "a/b", "home#x", "login", "login?next=home", " home", "home\nx"]) {
    expect(safeNextPage(value), String(value)).toBeNull();
  }
});
