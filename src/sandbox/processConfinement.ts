import { randomBytes } from "node:crypto";
import { closeSync, openSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * Is THIS process OS-confined? Measured, never declared.
 *
 * Distinct from "does this machine have a sandbox backend", which is what
 * `SandboxRunner.select()` answers, and the two were conflated once: on every
 * Mac the machine probe said yes and model-written code ran unconfined while
 * the system reported itself sandboxed. Code Mode's guard needs the process
 * question: it runs model-written source through `new Function` in a worker
 * thread, and a worker thread is not a security boundary in Node -- it shares
 * the process's filesystem, environment and ability to spawn. Only an OS
 * confinement around the process itself stops a script that ignores the tools
 * binding.
 *
 * THE MEASUREMENT is one write the kernel either refuses or permits. A launcher
 * that confines AMC (a seatbelt or Landlock profile around the whole process)
 * names, in `AMC_CONFINEMENT_PROBE_DIR`, a directory its profile denies. This
 * process then tries to create a file there:
 *
 *   - refused by the OS, with ordinary permissions ruled out  -> "confined"
 *   - permitted, whatever the launcher declared                -> "unconfined"
 *   - anything that cannot be attributed to a sandbox          -> "unknown"
 *
 * With nothing declared, the same write is tried outside any workspace root
 * (the temp directory): permitted means unconfined, measured; refused cannot be
 * attributed and is unknown. "unknown" is never confined, and every consumer
 * treats it exactly like unconfined -- see {@link processIsConfined}.
 *
 * What this DOES NOT claim: that the profile's writable roots equal the signed
 * write scope. A refused probe proves an OS write boundary is active on this
 * process; the boundary's shape is the launcher's profile, not this function's
 * finding, and the reason string says so.
 *
 * Nothing in AMC re-execs itself under a profile yet. Until a launcher does,
 * this measures "unconfined" everywhere, and it measures it rather than
 * returning it.
 */

/** Set by a launcher that has confined this process: the directory its profile denies writes to. */
export const CONFINEMENT_PROBE_DIR_ENV = "AMC_CONFINEMENT_PROBE_DIR";

export type ConfinementVerdict = "confined" | "unconfined" | "unknown";

export interface ConfinementProbe {
  /** The file the probe tried to create. */
  readonly path: string;
  readonly result: "refused" | "permitted" | "error" | "not-attempted";
  /** The errno name when the create threw, e.g. `EPERM` (seatbelt) or `EACCES` (Landlock). */
  readonly code: string | null;
}

export interface ConfinementMeasurement {
  readonly verdict: ConfinementVerdict;
  /** What the launcher declared, verbatim; `null` when nothing was declared. */
  readonly declaredProbeDir: string | null;
  readonly probe: ConfinementProbe;
  /** How the verdict was reached, naming the path, for an operator. */
  readonly reason: string;
}

export interface MeasureConfinementOptions {
  /** Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Where the undeclared probe writes. Defaults to the OS temp directory. */
  readonly fallbackDir?: string;
}

/** Errno names a kernel write boundary answers with: seatbelt says EPERM, Landlock says EACCES. */
const REFUSAL_CODES: ReadonlySet<string> = new Set(["EPERM", "EACCES"]);

const NOT_ATTEMPTED = (dir: string): ConfinementProbe => ({ path: dir, result: "not-attempted", code: null });

function errnoCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/**
 * Rule out every explanation for a refusal OTHER than an OS sandbox.
 *
 * A refusal counts only where this process owns the directory, holds the
 * owner write bit and can list it. Ownership and the write bit exclude POSIX
 * permissions; listing excludes a read restriction (macOS TCC answers EPERM to
 * both reads and writes of a protected folder, which is not a write boundary
 * around the process). Without these, `chmod 500` would be "confinement".
 */
function refusalWouldBeAttributable(dir: string): { ok: true } | { ok: false; reason: string } {
  if (!isAbsolute(dir)) return { ok: false, reason: `${dir} is not an absolute path` };
  let stat;
  try {
    stat = statSync(dir);
  } catch (error) {
    return { ok: false, reason: `${dir} cannot be stat'ed (${errnoCode(error) ?? "unknown error"})` };
  }
  if (!stat.isDirectory()) return { ok: false, reason: `${dir} is not a directory` };
  const uid = process.getuid?.();
  if (uid === undefined) return { ok: false, reason: "process ownership cannot be established on this platform" };
  if (stat.uid !== uid) return { ok: false, reason: `${dir} is owned by uid ${stat.uid}, not this process's uid ${uid}` };
  if ((stat.mode & 0o200) === 0) {
    return { ok: false, reason: `${dir} has no owner write bit, so a refusal there would be ordinary permissions, not confinement` };
  }
  try {
    readdirSync(dir);
  } catch (error) {
    return { ok: false, reason: `${dir} cannot be listed (${errnoCode(error) ?? "unknown error"}), so a write refusal there could be a read restriction rather than a write boundary` };
  }
  return { ok: true };
}

/** One create, `wx` so nothing pre-existing is touched, removed again when it succeeds. */
function attemptCreate(dir: string): ConfinementProbe {
  const path = join(dir, `.amc-confinement-probe-${process.pid}-${randomBytes(6).toString("hex")}`);
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    const code = errnoCode(error);
    return { path, result: code !== null && REFUSAL_CODES.has(code) ? "refused" : "error", code };
  }
  try {
    closeSync(fd);
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // The probe proved its point when the create succeeded; a leftover
      // zero-byte file is reported through `path` rather than hidden.
    }
  }
  return { path, result: "permitted", code: null };
}

function measureDeclared(declared: string): ConfinementMeasurement {
  const attributable = refusalWouldBeAttributable(declared);
  if (!attributable.ok) {
    return {
      verdict: "unknown", declaredProbeDir: declared, probe: NOT_ATTEMPTED(declared),
      reason: `confinement cannot be measured: ${CONFINEMENT_PROBE_DIR_ENV} names ${declared}, but ${attributable.reason}`
    };
  }
  const probe = attemptCreate(declared);
  switch (probe.result) {
    case "refused":
      return {
        verdict: "confined", declaredProbeDir: declared, probe,
        reason: `the OS refused this process's write to ${probe.path} (${probe.code ?? "refused"}) in a directory it owns and may write by mode; `
          + "a kernel write boundary is active on this process (its shape is the launcher's profile)"
      };
    case "permitted":
      return {
        verdict: "unconfined", declaredProbeDir: declared, probe,
        reason: `${CONFINEMENT_PROBE_DIR_ENV} declared ${declared} denied, but this process created and removed ${probe.path}; the declaration is not honoured by the OS`
      };
    default:
      return {
        verdict: "unknown", declaredProbeDir: declared, probe,
        reason: `confinement cannot be measured: creating ${probe.path} failed with ${probe.code ?? "an unknown error"}, which no sandbox answers with`
      };
  }
}

function measureUndeclared(dir: string): ConfinementMeasurement {
  const probe = attemptCreate(dir);
  if (probe.result === "permitted") {
    return {
      verdict: "unconfined", declaredProbeDir: null, probe,
      reason: `no launcher declared an OS confinement (${CONFINEMENT_PROBE_DIR_ENV} unset) and this process created and removed ${probe.path} outside any workspace root; `
        + "AMC does not re-exec itself under a sandbox profile, and a worker thread cannot be confined by a subprocess sandbox"
    };
  }
  return {
    verdict: "unknown", declaredProbeDir: null, probe,
    reason: `confinement cannot be measured: creating ${probe.path} was refused (${probe.code ?? "unknown error"}) but no launcher declared an OS confinement `
      + `(${CONFINEMENT_PROBE_DIR_ENV} unset), so the refusal cannot be attributed to a sandbox`
  };
}

/**
 * Measure whether THIS process is OS-confined. One filesystem write, see above.
 *
 * Deterministic in its inputs and side-effect free on success paths beyond a
 * create-then-unlink of one zero-byte hidden file.
 */
export function measureProcessConfinement(options: MeasureConfinementOptions = {}): ConfinementMeasurement {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return {
      verdict: "unknown", declaredProbeDir: null, probe: NOT_ATTEMPTED(options.fallbackDir ?? tmpdir()),
      reason: `confinement cannot be measured: no OS write boundary is known to AMC on ${process.platform}`
    };
  }
  const env = options.env ?? process.env;
  const declared = env[CONFINEMENT_PROBE_DIR_ENV];
  if (declared !== undefined && declared !== "") return measureDeclared(declared);
  return measureUndeclared(options.fallbackDir ?? tmpdir());
}

/**
 * The single fail-closed derivation every consumer shares.
 *
 * True for exactly one verdict. "unknown" is a refusal to claim, and a
 * consumer that treated it as anything but unconfined would be running
 * ungoverned code with a governance story attached to it.
 */
export function processIsConfined(measurement: ConfinementMeasurement): boolean {
  return measurement.verdict === "confined";
}

/** The measurement's own account, for a message an operator can act on. */
export function processConfinementReason(measurement: ConfinementMeasurement): string {
  return measurement.reason;
}
