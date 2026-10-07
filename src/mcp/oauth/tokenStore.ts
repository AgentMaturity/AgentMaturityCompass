/**
 * OAuth grants for MCP HTTP servers live in the AMC credential store (its
 * file-permission checks and lock apply), one entry per issuer and canonical
 * resource (spec 2026-07-28, basic/authorization/client-registration
 * §Authorization Server Binding). Values never leave this module except as the
 * access token for the transport's private header snapshot.
 */
import { createHash } from "node:crypto";
import { credentialRef, type CredentialRef } from "../../credentials/credentialRef.js";
import { LocalCredentialsService, type LocalCredentialsOptions } from "../../credentials/localCredentialsService.js";

export interface NativeMcpOAuthGrant {
  readonly v: 1;
  readonly issuer: string;
  readonly resource: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly accessToken: string;
  readonly refreshToken?: string;
  /** ISO time; absent when the authorization server gave no lifetime. */
  readonly expiresAt?: string;
}

export function nativeMcpOAuthGrantRef(issuer: string, resource: string): CredentialRef {
  const digest = createHash("sha256").update(JSON.stringify([issuer, resource])).digest("hex");
  return credentialRef(`AMC_MCP_OAUTH_${digest.slice(0, 32).toUpperCase()}`);
}

function parse(value: string | null, issuer: string, resource: string): NativeMcpOAuthGrant | null {
  if (value === null) return null;
  try {
    const grant = JSON.parse(value) as NativeMcpOAuthGrant;
    // The entry must name the same issuer and resource it is keyed under.
    if (grant?.v !== 1 || grant.issuer !== issuer || grant.resource !== resource || typeof grant.accessToken !== "string"
      || typeof grant.clientId !== "string" || !Array.isArray(grant.scopes)) return null;
    return grant;
  } catch { return null; }
}

export class NativeMcpOAuthTokenStore {
  constructor(private readonly options: Omit<LocalCredentialsOptions, "watch">) {}

  private async with<T>(operation: (store: LocalCredentialsService) => Promise<T> | T): Promise<T> {
    const store = new LocalCredentialsService({ ...this.options, watch: false });
    try { return await operation(store); } finally { await store.close(); }
  }

  load(issuer: string, resource: string): Promise<NativeMcpOAuthGrant | null> {
    return this.with(store => parse(store.resolve(nativeMcpOAuthGrantRef(issuer, resource)), issuer, resource));
  }

  save(grant: NativeMcpOAuthGrant): Promise<void> {
    return this.with(store => store.set(nativeMcpOAuthGrantRef(grant.issuer, grant.resource), JSON.stringify(grant)));
  }
}
