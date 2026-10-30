import { describe, expect, it } from "vitest";
import { NATIVE_INTERACTIVE_COMMANDS, nativeInteractiveCompleter } from "../src/setup/nativeInteractiveCommands.js";

describe("native interactive command discovery", () => {
  it("shares canonical built-ins and descriptions for help and reservation", () => {
    const names = NATIVE_INTERACTIVE_COMMANDS.map(command => command.name);
    expect(names).toEqual(["help", "inspect", "verify", "compact", "fork", "sessions", "resume", "mcp", "extensions", "load", "unload", "exit"]);
    expect(new Set(names).size).toBe(names.length);
    expect(NATIVE_INTERACTIVE_COMMANDS.every(command => command.description.length > 0)).toBe(true);
  });

  it("completes /fo to /fork and preserves the readline replacement text", () => {
    expect(nativeInteractiveCompleter("/fo", [])).toEqual([["/fork"], "/fo"]);
  });

  it("offers available extension and skill names alongside built-ins without duplicates", () => {
    const [commands, text] = nativeInteractiveCompleter("/", ["review", "/review", "home_skill", "help"]);
    expect(commands).toEqual([...NATIVE_INTERACTIVE_COMMANDS.map(command => `/${command.name}`), "/review", "/home_skill"]);
    expect(text).toBe("/");
    expect(nativeInteractiveCompleter("/rev", ["review"])).toEqual([["/review"], "/rev"]);
  });

  it("uses the existing REPL subsequence matcher after prefix matches are exhausted", () => {
    expect(nativeInteractiveCompleter("/vfy", [])).toEqual([["/verify"], "/vfy"]);
    expect(nativeInteractiveCompleter("/v", ["validation"])).toEqual([["/verify", "/validation"], "/v"]);
    expect(nativeInteractiveCompleter("/zzzz", [])).toEqual([[], "/zzzz"]);
  });

  it.each(["", "ordinary task", " /fo", "/fork ", "/review argument"])("does not replace task text or command arguments: %j", line => {
    expect(nativeInteractiveCompleter(line, ["review"])).toEqual([[], line]);
  });

  it("never offers control characters or argument text as a command name", () => {
    const [commands] = nativeInteractiveCompleter("/", ["valid-command", "bad\u001b[2J", "two words", "nested/name", "UpperCase"]);
    expect(commands).toContain("/valid-command");
    expect(commands).not.toContain("/bad\u001b[2J");
    expect(commands).not.toContain("/two words");
    expect(commands).not.toContain("/nested/name");
    expect(commands).not.toContain("/UpperCase");
  });
});
