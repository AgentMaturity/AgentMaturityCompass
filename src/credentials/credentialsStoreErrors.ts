/**
 * The two ways the AMC-owned credentials file can refuse to be used.
 *
 * Both messages are written under a constraint the rest of the seam does not
 * have: they describe a *file whose every line is a secret*. A permission error
 * may name the path and the mode, because neither is secret and an operator
 * cannot act without both. A parse error may name a position and a rule, and
 * nothing else — the one thing an ordinary parser would print, the offending
 * line, is the credential itself. Getting that wrong turns a syntax mistake
 * into a disclosure, in the log, in the terminal scrollback, and in the bug
 * report the operator files with the output pasted in.
 */
import { CredentialsError } from "./credentialsErrors.js";

/** Where a bad position was found, when the parser could locate one. */
export interface CredentialsFilePosition {
  readonly line: number;
  readonly column: number;
}

/**
 * Why a credentials file was rejected. Codes, never prose built from the file.
 *
 *   yaml               the YAML itself does not parse (syntax, duplicate keys)
 *   not-a-mapping      the document is a list or a scalar, not `REF: value`
 *   key-not-a-reference a key is not a legal credential reference name
 *   value-not-a-string a value is a number, list or map rather than a string
 */
export type CredentialsFileParseReason =
  | "yaml"
  | "not-a-mapping"
  | "key-not-a-reference"
  | "value-not-a-string";

const REASON_TEXT: Readonly<Record<CredentialsFileParseReason, string>> = Object.freeze({
  yaml: "the YAML is malformed",
  "not-a-mapping": "the document is not a mapping of reference names to values",
  "key-not-a-reference": "a key is not a valid credential reference name",
  "value-not-a-string": "a value is not a string"
});

function positionText(position: CredentialsFilePosition | null): string {
  return position === null
    ? ""
    : ` at line ${position.line}, column ${position.column}`;
}

/**
 * Thrown when the credentials file cannot be turned into a reference→value map.
 *
 * `detail` carries a machine code — the YAML library's own error code, or the
 * reference name when the key was well-formed enough to be one. It is never
 * free text lifted from the file.
 */
export class CredentialsFileParseError extends CredentialsError {
  readonly path: string;
  readonly reason: CredentialsFileParseReason;
  readonly position: CredentialsFilePosition | null;
  readonly detail: string | null;

  constructor(input: {
    readonly path: string;
    readonly reason: CredentialsFileParseReason;
    readonly position?: CredentialsFilePosition | null;
    readonly detail?: string | null;
  }) {
    const position = input.position ?? null;
    const detail = input.detail ?? null;
    super(
      "AMC_CREDENTIAL_FILE_UNPARSABLE",
      `credentials file ${input.path} could not be read: ${REASON_TEXT[input.reason]}` +
        `${positionText(position)}${detail === null ? "" : ` (${detail})`}. ` +
        `The offending text is withheld on purpose — every value in this file is ` +
        `a credential, so quoting the line would disclose one. Open the file at ` +
        `that position to fix it.`
    );
    this.name = "CredentialsFileParseError";
    this.path = input.path;
    this.reason = input.reason;
    this.position = position;
    this.detail = detail;
  }
}

/**
 * Thrown when the credentials file, or the directory holding it, is reachable
 * by anyone but its owner.
 *
 * Refusing rather than silently repairing is the deliberate choice. A store
 * this process quietly chmods was, until that moment, readable by every account
 * on the machine — the keys in it should be treated as exposed, and an operator
 * who never sees an error never learns that. The message therefore names the
 * exact command rather than describing the fix, because an error an operator
 * has to research is an error they work around.
 */
export class CredentialsFilePermissionsError extends CredentialsError {
  readonly path: string;
  readonly kind: "file" | "directory";
  /** The offending mode, permission bits only. */
  readonly mode: number;
  /** The command that fixes it, also embedded in the message. */
  readonly fixCommand: string;

  constructor(input: {
    readonly path: string;
    readonly kind: "file" | "directory";
    readonly mode: number;
    readonly requiredMode: number;
  }) {
    const fixCommand = `chmod ${input.requiredMode.toString(8).padStart(3, "0")} ${input.path}`;
    super(
      "AMC_CREDENTIAL_FILE_PERMISSIONS",
      `credentials ${input.kind} ${input.path} is mode ` +
        `0${input.mode.toString(8).padStart(3, "0")}, which grants access to group or ` +
        `other. It holds API keys, so it must be reachable by its owner alone. AMC ` +
        `refuses to read it rather than repairing it silently: until this is fixed the ` +
        `keys in it must be treated as exposed. Fix: ${fixCommand}`
    );
    this.name = "CredentialsFilePermissionsError";
    this.path = input.path;
    this.kind = input.kind;
    this.mode = input.mode;
    this.fixCommand = fixCommand;
  }
}
