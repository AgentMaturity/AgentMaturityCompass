/**
 * Failed-login throttle shared by Studio's /auth/login and the host router's two login routes (LIVE-RUNTIME-04, D-R5).
 *
 * On an address that stands for one client (no proxy declared, or a trusted proxy named the client), the hard refusal
 * is keyed on (username, client address): 10 failures in 15 minutes refuse that pair only, so a client at another
 * address can never lock the owner out of their own address, and 30 failures for the username from any addresses add
 * a fixed delay to every attempt for it, right or wrong. On an address that may be a proxy's own, shared by everyone
 * behind it (AMC_TRUSTED_PROXY_HOPS set but this peer is not a trusted proxy), the two swap: the pair only delays, so
 * one client cannot lock out every client behind the proxy (SR-2), and the 30 failures refuse further attempts for
 * the username from such addresses, so rotating addresses buys no extra guesses (SR-1). Attempts that a trusted proxy
 * forwards are never refused because of them. Behind an undeclared proxy (hops 0) every client shares its address.
 *
 * ponytail: in-memory and per process, so a restart clears it and replicas do not share it; a shared store when one
 * Studio serves a workspace from several processes.
 */
const MAX_ENTRIES = 50_000;
const LOGIN_THROTTLED_ERROR = "too many failed logins for this account from this address";
const LOGIN_THROTTLED_ACCOUNT_ERROR = "too many failed logins for this account";

interface Window {
  count: number;
  resetTs: number;
  refused: boolean;
}

type LoginGate =
  | { allowed: true; delayMs: number }
  | { allowed: false; retryAfterSeconds: number; firstRefusal: boolean; error: string };

export interface LoginThrottle {
  /** `addressTrusted`: the address stands for one client (resolveClientAddress); false when it may be a shared proxy's. */
  check(username: string, clientIp: string, addressTrusted?: boolean): LoginGate;
  fail(username: string, clientIp: string): void;
  succeed(username: string, clientIp: string): void;
}

const userKey = (username: string): string => username.trim().toLowerCase();
const pairKey = (username: string, clientIp: string): string => `${userKey(username)}\u0000${clientIp}`;

export function createLoginThrottle(options: {
  maxPairFailures?: number;
  delayAfterUserFailures?: number;
  windowMs?: number;
  delayMs?: number;
  now?: () => number;
} = {}): LoginThrottle {
  const { maxPairFailures = 10, delayAfterUserFailures = 30, windowMs = 15 * 60_000, delayMs = 2_000, now = Date.now } = options;
  const pairs = new Map<string, Window>();
  const users = new Map<string, Window>();
  const live = (map: Map<string, Window>, key: string, at: number): Window | null => {
    const entry = map.get(key);
    if (entry && entry.resetTs > at) return entry;
    if (entry) map.delete(key);
    return null;
  };
  const count = (map: Map<string, Window>, key: string, at: number): void => {
    const entry = live(map, key, at);
    if (entry) { entry.count += 1; return; }
    if (map.size >= MAX_ENTRIES) {
      for (const [name, window] of map) if (window.resetTs <= at) map.delete(name);
      // Full of live windows: drop the oldest, so the newest failures (the attack in progress) keep counting.
      if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value as string);
    }
    map.set(key, { count: 1, resetTs: at + windowMs, refused: false });
  };
  return {
    check(username, clientIp, addressTrusted = true) {
      const at = now();
      const pair = live(pairs, pairKey(username, clientIp), at);
      const user = live(users, userKey(username), at);
      const pairOver = pair !== null && pair.count >= maxPairFailures;
      const userOver = user !== null && user.count >= delayAfterUserFailures;
      const refusing = addressTrusted ? (pairOver ? pair : null) : (userOver ? user : null);
      if (refusing) {
        const firstRefusal = !refusing.refused;
        refusing.refused = true;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((refusing.resetTs - at) / 1000)), firstRefusal,
          error: addressTrusted ? LOGIN_THROTTLED_ERROR : LOGIN_THROTTLED_ACCOUNT_ERROR };
      }
      return { allowed: true, delayMs: (addressTrusted ? userOver : pairOver) ? delayMs : 0 };
    },
    fail(username, clientIp) {
      const at = now();
      count(pairs, pairKey(username, clientIp), at);
      count(users, userKey(username), at);
    },
    // Per pair: the per-username count is the distributed-attack signal, and one owner login must not restart it.
    succeed(username, clientIp) {
      pairs.delete(pairKey(username, clientIp));
    }
  };
}

/**
 * One login attempt's admission: false after `refuse` has answered (429 with Retry-After), otherwise true once any
 * per-username delay has passed. `audit` runs on the first refusal of a window only.
 */
export async function admitLoginAttempt(throttle: LoginThrottle, input: {
  username: string;
  clientIp: string;
  addressTrusted: boolean;
  refuse: (retryAfterSeconds: number, error: string) => void;
  audit: () => unknown;
}): Promise<boolean> {
  const gate = throttle.check(input.username, input.clientIp, input.addressTrusted);
  if (!gate.allowed) {
    // The refusal is answered first: an audit write that fails must not turn a throttled attempt into anything else.
    input.refuse(gate.retryAfterSeconds, gate.error);
    if (gate.firstRefusal) await input.audit();
    return false;
  }
  if (gate.delayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, gate.delayMs));
  return true;
}

