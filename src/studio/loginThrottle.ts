/**
 * Failed-login throttle shared by Studio's /auth/login and the host router's two login routes (LIVE-RUNTIME-04, D-R5).
 *
 * The hard refusal is keyed on (username, client address): 10 failures in 15 minutes refuse that pair only, so a
 * client at another address can never lock the owner out of their own address. By username alone, 30 failures in the
 * window from any addresses add a fixed delay to every attempt for that username, right or wrong; never a refusal.
 * Behind a proxy whose hops are not trusted (AMC_TRUSTED_PROXY_HOPS=0) every client shares the proxy's address, and
 * the pair key degrades to per-username-per-proxy.
 *
 * ponytail: in-memory and per process, so a restart clears it and replicas do not share it; a shared store when one
 * Studio serves a workspace from several processes.
 */
const MAX_ENTRIES = 50_000;

interface Window {
  count: number;
  resetTs: number;
  refused: boolean;
}

type LoginGate =
  | { allowed: true; delayMs: number }
  | { allowed: false; retryAfterSeconds: number; firstRefusal: boolean };

export interface LoginThrottle {
  check(username: string, clientIp: string): LoginGate;
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
    check(username, clientIp) {
      const at = now();
      const pair = live(pairs, pairKey(username, clientIp), at);
      if (pair && pair.count >= maxPairFailures) {
        const firstRefusal = !pair.refused;
        pair.refused = true;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((pair.resetTs - at) / 1000)), firstRefusal };
      }
      const user = live(users, userKey(username), at);
      return { allowed: true, delayMs: user && user.count >= delayAfterUserFailures ? delayMs : 0 };
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
 * per-username delay has passed. `audit` runs on the first refusal of a (username, address) window only.
 */
export async function admitLoginAttempt(throttle: LoginThrottle, input: {
  username: string;
  clientIp: string;
  refuse: (retryAfterSeconds: number) => void;
  audit: () => unknown;
}): Promise<boolean> {
  const gate = throttle.check(input.username, input.clientIp);
  if (!gate.allowed) {
    // The refusal is answered first: an audit write that fails must not turn a throttled attempt into anything else.
    input.refuse(gate.retryAfterSeconds);
    if (gate.firstRefusal) await input.audit();
    return false;
  }
  if (gate.delayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, gate.delayMs));
  return true;
}

export const LOGIN_THROTTLED_ERROR = "too many failed logins for this account from this address";
