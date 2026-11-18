import { fuzzyMatch } from "../repl/replParser.js";

/** Shared command names for help, terminal completion and extension reservation. */
export const NATIVE_INTERACTIVE_COMMANDS = [
  { name: "help", description: "Show session scope and available commands." },
  { name: "status", description: "Show the session, settings, workspace limits, usage and how to resume." },
  { name: "cost", description: "Show tokens used and the estimated cost of this session." },
  { name: "model", description: "Show the model; /model <name> uses another model from the next task." },
  { name: "plan", description: "Turn plan mode on or off from the next task: the agent can only read and hands you a plan." },
  { name: "clear", description: "Clear the screen and start a new conversation; the current session is kept." },
  { name: "inspect", description: "Inspect the current recorded session." },
  { name: "verify", description: "Check the current session's evidence." },
  { name: "compact", description: "Review and summarize a recorded event range." },
  { name: "fork", description: "Queue a child session; /fork cancel clears the queue." },
  { name: "withdraw", description: "List queued submissions and withdraw one not yet dispatched." },
  { name: "sessions", description: "Browse recorded sessions without acquiring a writer." },
  { name: "resume", description: "Inspect and select a recorded session to resume." },
  { name: "bookmark", description: "Name a verified sealed turn in the current session." },
  { name: "bookmarks", description: "Browse signed bookmarks and inspect a verified turn." },
  { name: "mcp", description: "Show the last mounted MCP receipt and tool grants." },
  { name: "extensions", description: "List loaded signed extensions and their commands." },
  { name: "load", description: "Load an already signed extension manifest." },
  { name: "unload", description: "Unload an extension for future turns." },
  { name: "exit", description: "Leave chat and print continuation commands." }
] as const;

/** Complete command names only; task text and command arguments remain untouched. */
export function nativeInteractiveCompleter(line: string, dynamicNames: readonly string[] = []): [string[], string] {
  if (!/^\/[a-z0-9_-]*$/.test(line)) return [[], line];
  const commands = [...new Set([
    ...NATIVE_INTERACTIVE_COMMANDS.map(command => `/${command.name}`),
    ...dynamicNames.map(name => name.startsWith("/") ? name : `/${name}`)
  ].filter(name => /^\/[a-z][a-z0-9_-]*$/.test(name)))];
  const exact = commands.filter(command => command.startsWith(line));
  return [exact.length > 0 ? exact : commands.filter(command => fuzzyMatch(line, command)).slice(0, 8), line];
}
