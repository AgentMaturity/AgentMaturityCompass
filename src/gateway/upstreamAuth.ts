/**
 * Outbound upstream authentication, resolved through the credentials seam.
 *
 * The gateway's config has always carried *references* — `{ type: "bearer_env",
 * env: "OPENAI_API_KEY" }` names a variable, never a value — which is the
 * config half of the model P3.0 generalises. What was missing was the other
 * half: the request path read `process.env[auth.env]` directly, so the only
 * layer that could ever answer was the inherited environment, and the only way
 * to rotate a key was to restart the process that inherited it.
 *
 * This module is the join. A reference is resolved on *every* request through
 * `CredentialsService`, which ranks the inherited environment above the
 * AMC-owned store above the project and user `.env` files. Nothing is hoisted:
 * the resolver is a function, not a captured string, because a captured string
 * is exactly the restart-to-rotate behaviour the seam exists to remove.
 *
 * It lives beside the server rather than inside it because src/gateway/server.ts
 * sits on its line-ratchet floor, and because auth resolution is the one part of
 * the proxy worth testing without binding a socket.
 */
import { credentialRef, isCredentialRefName } from "../credentials/credentialRef.js";
import { normalizeCredentialValue } from "../credentials/credentialValue.js";
import type { CredentialsService } from "../credentials/credentialsService.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import type { GatewayConfig } from "./config.js";

/** The auth clause of one upstream, as the gateway config schema defines it. */
export type UpstreamAuth = GatewayConfig["upstreams"][string]["auth"];

/**
 * Resolves an auth reference to its current value, or null when no layer
 * configures one.
 *
 * A function rather than a map so the resolution happens at call time. Every
 * caller in this module invokes it per request for that reason.
 */
export type UpstreamCredentialResolver = (envName: string) => string | null;

/**
 * Resolution through the seam, with a direct-environment fallback.
 *
 * The fallback covers references the seam's grammar rejects. `CredentialRef`
 * requires an identifier (`[A-Za-z_][A-Za-z0-9_]*`), while the gateway config
 * schema accepts any non-empty string, so a hand-edited `gateway.yaml` naming
 * `MY-KEY` would otherwise start throwing where it used to work. Reading such a
 * name straight from the environment preserves exactly what the gateway did
 * before this seam existed — the rollback posture, kept live rather than
 * documented — while every well-formed reference gets the layered store.
 */
export function seamCredentialResolver(
  credentials: CredentialsService,
  env: NodeJS.ProcessEnv = process.env
): UpstreamCredentialResolver {
  return (envName) => {
    if (!isCredentialRefName(envName)) return normalizeCredentialValue(env[envName]);
    return credentials.resolve(credentialRef(envName));
  };
}

/** Environment-only resolution — the seam's behaviour with every other layer removed. */
export function envCredentialResolver(
  env: NodeJS.ProcessEnv = process.env
): UpstreamCredentialResolver {
  return (envName) => normalizeCredentialValue(env[envName]);
}

/**
 * A resolver bound to a store, plus the disposal that store needs.
 *
 * The pairing exists so ownership is not guessable. A gateway that constructed
 * its own store must close it (it holds a file watcher); a gateway handed one
 * by a caller must not, because tearing down another owner's watcher would
 * silently stop *their* hot reload.
 */
export interface UpstreamCredentials {
  readonly resolve: UpstreamCredentialResolver;
  readonly close: () => Promise<void>;
}

/**
 * Binds a gateway to a credentials source.
 *
 * With no `credentials` supplied this constructs the local layered store —
 * which asserts the store's permissions as it boots, so a world-readable
 * `.credentials.yaml` stops the gateway with the chmod that fixes it rather
 * than being served from quietly. The project `.env` layer is anchored on the
 * gateway's workspace, not the process cwd, so a gateway started from elsewhere
 * still reads the workspace it was pointed at.
 */
export function upstreamCredentials(
  workspace: string,
  credentials?: CredentialsService
): UpstreamCredentials {
  if (credentials) {
    return { resolve: seamCredentialResolver(credentials), close: async () => {} };
  }
  // projectDir: null — NOT the workspace. These are the credentials AMC sends
  // upstream on the operator's behalf, and the workspace is writable by the
  // evaluated agent. Sourcing them from <workspace>/.env would let that agent
  // supply its own upstream key, which is exactly what
  // stripAgentProvidedCredentials refuses to accept over the wire; a second
  // door to the same place is still the same escalation. Operator-controlled
  // sources only: process env and the AMC home store.
  const store = new LocalCredentialsService({ projectDir: null });
  return { resolve: seamCredentialResolver(store), close: () => store.close() };
}

export interface UpstreamAuthResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Applies an upstream's auth clause to an outbound request.
 *
 * Mutates `url` and `headers` in place, which is what the request path needs
 * and why this returns a verdict rather than a new request. The error text
 * names the *reference*, never the value — it is rendered into a 500 body and
 * appended to the evidence ledger, both of which are read by people who must
 * not be shown the key.
 */
export function applyUpstreamAuth(
  url: URL,
  headers: Record<string, string>,
  auth: UpstreamAuth,
  resolve: UpstreamCredentialResolver
): UpstreamAuthResult {
  if (auth.type === "none") {
    return { ok: true };
  }

  // Resolved here, per call. Hoisting this to gateway start would restore the
  // restart-to-rotate behaviour even though the seam underneath supports better.
  const value = resolve(auth.env);
  if (value === null) {
    return { ok: false, error: `missing API key env: ${auth.env}` };
  }

  if (auth.type === "bearer_env") {
    headers.authorization = `Bearer ${value}`;
    return { ok: true };
  }
  if (auth.type === "header_env") {
    headers[auth.header.toLowerCase()] = value;
    return { ok: true };
  }
  url.searchParams.set(auth.param, value);
  return { ok: true };
}

/**
 * The references no layer answers, for the gateway's start-up report.
 *
 * Replaces the config module's env-only probe on this path. That one asks
 * `process.env` and nothing else, so with the seam wired it would announce
 * `missingEnvVars: ["OPENAI_API_KEY"]` about a key the AMC-owned store holds
 * and the very next request would use — a start-up report contradicted by the
 * system it describes. The config module's version stays for callers that have
 * no store, such as workspace doctor output.
 */
export function missingUpstreamAuthRefs(
  config: GatewayConfig,
  resolve: UpstreamCredentialResolver
): string[] {
  const missing = new Set<string>();
  for (const upstream of Object.values(config.upstreams)) {
    if (upstream.auth.type === "none") continue;
    if (resolve(upstream.auth.env) === null) missing.add(upstream.auth.env);
  }
  return [...missing].sort();
}
