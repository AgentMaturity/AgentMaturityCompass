export const SHELL_COMMAND_PLAN_SCHEMA_VERSION = "2026-07-13" as const;

export type ShellCommandConnector = null | "and" | "or" | "pipe" | "sequence" | "newline";

export type ShellCommandPlanReasonCode =
  | "COMMAND_EMPTY"
  | "COMMAND_TOO_LONG"
  | "COMMAND_TRAILING_SEPARATOR"
  | "COMMAND_EMPTY_SEGMENT"
  | "COMMAND_UNTERMINATED_QUOTE"
  | "COMMAND_UNTERMINATED_ESCAPE"
  | "COMMAND_SYNTAX_UNSUPPORTED"
  | "COMMAND_SEGMENT_LIMIT_EXCEEDED"
  | "COMMAND_TOKEN_LIMIT_EXCEEDED";

export interface ShellCommandSegment {
  index: number;
  connector: ShellCommandConnector;
  binary: string;
  argv: string[];
}

export interface ShellCommandPlan {
  schemaVersion: typeof SHELL_COMMAND_PLAN_SCHEMA_VERSION;
  status: "parsed" | "invalid";
  compound: boolean;
  segments: ShellCommandSegment[];
  reasonCodes: ShellCommandPlanReasonCode[];
}

const MAX_COMMAND_BYTES = 8_192;
const MAX_SEGMENTS = 32;
const MAX_TOKENS_PER_SEGMENT = 128;

function invalidPlan(reason: ShellCommandPlanReasonCode): ShellCommandPlan {
  return {
    schemaVersion: SHELL_COMMAND_PLAN_SCHEMA_VERSION,
    status: "invalid",
    compound: false,
    segments: [],
    reasonCodes: [reason],
  };
}

function connectorAt(command: string, index: number): {
  connector: Exclude<ShellCommandConnector, null>;
  width: number;
} | null {
  const char = command[index];
  const next = command[index + 1];
  if (char === "&" && next === "&") return { connector: "and", width: 2 };
  if (char === "|" && next === "|") return { connector: "or", width: 2 };
  if (char === "|") return { connector: "pipe", width: 1 };
  if (char === ";") return { connector: "sequence", width: 1 };
  if (char === "\n") return { connector: "newline", width: 1 };
  if (char === "\r" && next === "\n") return { connector: "newline", width: 2 };
  if (char === "\r") return { connector: "newline", width: 1 };
  return null;
}

function syntaxUnsupported(char: string): boolean {
  return char === "\0"
    || char === "`"
    || char === "$"
    || char === "<"
    || char === ">"
    || char === "("
    || char === ")"
    || char === "{"
    || char === "}"
    || char === "*"
    || char === "?"
    || char === "["
    || char === "]"
    || char === "~";
}

function expansionUnsupported(char: string): boolean {
  return char === "\0" || char === "`" || char === "$";
}

/**
 * Parses a deliberately bounded shell subset for policy review only.
 * It never expands variables, substitutions, redirections, or shell groups.
 */
export function parseShellCommandPlan(command: string): ShellCommandPlan {
  if (Buffer.byteLength(command, "utf8") > MAX_COMMAND_BYTES) {
    return invalidPlan("COMMAND_TOO_LONG");
  }
  if (!command.trim()) return invalidPlan("COMMAND_EMPTY");

  const segments: ShellCommandSegment[] = [];
  let connector: ShellCommandConnector = null;
  let tokens: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | "\"" | null = null;

  const finishToken = (): ShellCommandPlanReasonCode | null => {
    if (!tokenStarted) return null;
    tokens.push(token);
    token = "";
    tokenStarted = false;
    return tokens.length > MAX_TOKENS_PER_SEGMENT ? "COMMAND_TOKEN_LIMIT_EXCEEDED" : null;
  };

  const finishSegment = (): ShellCommandPlanReasonCode | null => {
    const tokenError = finishToken();
    if (tokenError) return tokenError;
    if (tokens.length === 0) return "COMMAND_EMPTY_SEGMENT";
    const [binary, ...argv] = tokens;
    if (!binary) return "COMMAND_EMPTY_SEGMENT";
    segments.push({ index: segments.length, connector, binary, argv });
    tokens = [];
    if (segments.length > MAX_SEGMENTS) return "COMMAND_SEGMENT_LIMIT_EXCEEDED";
    return null;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? "";

    if (quote === "'") {
      if (char === "'") quote = null;
      else token += char;
      tokenStarted = true;
      continue;
    }

    if (quote === "\"") {
      if (char === "\"") {
        quote = null;
        tokenStarted = true;
        continue;
      }
      if (char === "\\") {
        const next = command[index + 1];
        if (next === undefined) return invalidPlan("COMMAND_UNTERMINATED_ESCAPE");
        if (next === "\n") {
          index += 1;
          continue;
        }
        if (next === "\r" && command[index + 2] === "\n") {
          index += 2;
          continue;
        }
        token += next;
        tokenStarted = true;
        index += 1;
        continue;
      }
      if (expansionUnsupported(char)) return invalidPlan("COMMAND_SYNTAX_UNSUPPORTED");
      token += char;
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      const next = command[index + 1];
      if (next === undefined) return invalidPlan("COMMAND_UNTERMINATED_ESCAPE");
      if (next === "\n") {
        index += 1;
        continue;
      }
      if (next === "\r" && command[index + 2] === "\n") {
        index += 2;
        continue;
      }
      token += next;
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (syntaxUnsupported(char) || (char === "&" && command[index + 1] !== "&")) {
      return invalidPlan("COMMAND_SYNTAX_UNSUPPORTED");
    }

    const nextConnector = connectorAt(command, index);
    if (nextConnector) {
      const segmentError = finishSegment();
      if (segmentError) return invalidPlan(segmentError);
      connector = nextConnector.connector;
      index += nextConnector.width - 1;
      continue;
    }

    if (/\s/.test(char)) {
      const tokenError = finishToken();
      if (tokenError) return invalidPlan(tokenError);
      continue;
    }
    token += char;
    tokenStarted = true;
  }

  if (quote) return invalidPlan("COMMAND_UNTERMINATED_QUOTE");
  if (tokens.length === 0 && !tokenStarted && segments.length > 0) {
    return invalidPlan("COMMAND_TRAILING_SEPARATOR");
  }
  const segmentError = finishSegment();
  if (segmentError) return invalidPlan(segmentError);

  return {
    schemaVersion: SHELL_COMMAND_PLAN_SCHEMA_VERSION,
    status: "parsed",
    compound: segments.length > 1,
    segments,
    reasonCodes: [],
  };
}
