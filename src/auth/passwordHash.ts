import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

interface ParsedPasswordHash {
  algo: "scrypt";
  n: number;
  r: number;
  p: number;
  keylen: number;
  saltB64: string;
  hashB64: string;
}

/**
 * LIVE-VAULT-13: scrypt N=2^15 (32 MiB, about 60 ms): the most the synchronous login path can afford. OWASP's floor of
 * N=2^17 blocks Studio's event loop for about a quarter of a second per login, so it waits for an asynchronous login path.
 */
const DEFAULT_PARAMS = {
  n: 32768,
  r: 8,
  p: 1,
  keylen: 64
};
/** A stored hash asking for more is refused, so a hostile hash string cannot ask scrypt for gigabytes. */
const MAX_N = 2 ** 20;
const MAX_R = 32;
export const MIN_PASSWORD_LENGTH = 12;

/** A new password the policy refuses; the console account routes answer it with 400. */
export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

/** Node refuses scrypt when 128·N·r exceeds maxmem (32 MiB by default, which N=2^15 with r=8 just reaches); twice that is set explicitly. */
function scryptOptions(parsed: { n: number; r: number; p: number }): { N: number; r: number; p: number; maxmem: number } {
  return { N: parsed.n, r: parsed.r, p: parsed.p, maxmem: 256 * parsed.n * parsed.r };
}

function parsePasswordHash(encoded: string): ParsedPasswordHash {
  const parts = encoded.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt") {
    throw new Error("invalid password hash format");
  }
  const algo = parts[0]!;
  const n = parts[1]!;
  const r = parts[2]!;
  const p = parts[3]!;
  const keylen = parts[4]!;
  const saltB64 = parts[5]!;
  const hashB64 = parts[6]!;
  if (!(Number(n) <= MAX_N) || !(Number(r) <= MAX_R)) {
    throw new Error("password hash parameters out of range");
  }
  return {
    algo: algo as "scrypt",
    n: Number(n),
    r: Number(r),
    p: Number(p),
    keylen: Number(keylen),
    saltB64,
    hashB64
  };
}

function derive(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, DEFAULT_PARAMS.keylen, scryptOptions(DEFAULT_PARAMS));
  return [
    "scrypt",
    String(DEFAULT_PARAMS.n),
    String(DEFAULT_PARAMS.r),
    String(DEFAULT_PARAMS.p),
    String(DEFAULT_PARAMS.keylen),
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
}

/** A verifier for a new password: at least MIN_PASSWORD_LENGTH characters and, when the account is named, not its username. */
export function hashPassword(password: string, options: { username?: string } = {}): string {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (options.username !== undefined && password.toLowerCase() === options.username.toLowerCase()) {
    throw new PasswordPolicyError("password must not be the username");
  }
  return derive(password);
}

/** A stored verifier made with less work than new ones; the next successful login replaces it (rehashPassword). */
export function passwordHashNeedsUpgrade(encodedHash: string): boolean {
  try {
    return parsePasswordHash(encodedHash).n < DEFAULT_PARAMS.n;
  } catch {
    return false;
  }
}

/** The same, already verified password at the current cost; no policy check, since the password is not new. */
export function rehashPassword(password: string): string {
  return derive(password);
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  try {
    const parsed = parsePasswordHash(encodedHash);
    const salt = Buffer.from(parsed.saltB64, "base64");
    const expected = Buffer.from(parsed.hashB64, "base64");
    const actual = scryptSync(password, salt, parsed.keylen, scryptOptions(parsed));
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
