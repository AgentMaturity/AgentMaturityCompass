import { parseCookieHeader } from "../auth/sessionTokens.js";
import type { IdentityConfig } from "./identityConfig.js";

export function identityCookieName(config: IdentityConfig): string {
  return config.identity.session.cookieName;
}

export function setIdentitySessionCookie(params: {
  res: { setHeader: (name: string, value: string) => void };
  config: IdentityConfig;
  token: string;
  maxAgeSeconds: number;
}): void {
  const secure = params.config.identity.session.cookieSecure ? "; Secure" : "";
  const sameSite = params.config.identity.session.cookieSameSite;
  const cookie = `${identityCookieName(params.config)}=${encodeURIComponent(params.token)}; HttpOnly; SameSite=${sameSite}; Path=${
    params.config.identity.session.cookiePath
  }; Max-Age=${Math.max(60, params.maxAgeSeconds)}${secure}`;
  params.res.setHeader("set-cookie", cookie);
}

export function clearIdentitySessionCookie(params: {
  res: { setHeader: (name: string, value: string) => void };
  config: IdentityConfig;
}): void {
  const secure = params.config.identity.session.cookieSecure ? "; Secure" : "";
  const sameSite = params.config.identity.session.cookieSameSite;
  params.res.setHeader(
    "set-cookie",
    `${identityCookieName(params.config)}=; HttpOnly; SameSite=${sameSite}; Path=${params.config.identity.session.cookiePath}; Max-Age=0${secure}`
  );
}

export function identitySessionTokenFromCookie(rawCookie: string | undefined, config: IdentityConfig): string | null {
  return parseCookieHeader(rawCookie, identityCookieName(config));
}
