/**
 * identityRouter.ts — Identity, SCIM token, and enterprise IdP API routes.
 * Full parity with: amc identity *, amc scim token *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError } from './apiHelpers.js';

export async function handleIdentityRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/identity')) return false;

  // POST /api/v1/identity/init — create and sign host-level identity.yaml
  if (pathname === '/api/v1/identity/init' && method === 'POST') {
    try {
      const body = await bodyJson<{ hostDir: string }>(req);
      if (!body.hostDir) { apiError(res, 400, 'hostDir required'); return true; }
      const { identityInitCli } = await import('../identity/identityCli.js');
      const out = identityInitCli(body.hostDir);
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Identity init failed');
    }
    return true;
  }

  // POST /api/v1/identity/verify — verify identity.yaml signature
  if (pathname === '/api/v1/identity/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ hostDir: string }>(req);
      if (!body.hostDir) { apiError(res, 400, 'hostDir required'); return true; }
      const { identityVerifyCli } = await import('../identity/identityCli.js');
      const out = identityVerifyCli(body.hostDir);
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Identity verify failed');
    }
    return true;
  }

  // POST /api/v1/identity/provider/add-oidc — add OIDC identity provider
  if (pathname === '/api/v1/identity/provider/add-oidc' && method === 'POST') {
    try {
      const body = await bodyJson<{
        hostDir: string;
        providerId: string;
        displayName?: string;
        issuer: string;
        clientId: string;
        clientSecretFile: string;
        redirectUri: string;
        scopes?: string[];
        useWellKnown?: boolean;
        authorizationEndpoint?: string;
        tokenEndpoint?: string;
        jwksUri?: string;
      }>(req);
      if (!body.hostDir || !body.providerId || !body.issuer || !body.clientId || !body.clientSecretFile || !body.redirectUri) {
        apiError(res, 400, 'Required: hostDir, providerId, issuer, clientId, clientSecretFile, redirectUri');
        return true;
      }
      const { identityProviderAddOidcCli } = await import('../identity/identityCli.js');
      const out = identityProviderAddOidcCli(body);
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'OIDC provider add failed');
    }
    return true;
  }

  // POST /api/v1/identity/provider/add-saml — add SAML identity provider
  if (pathname === '/api/v1/identity/provider/add-saml' && method === 'POST') {
    try {
      const body = await bodyJson<{
        hostDir: string;
        providerId: string;
        displayName?: string;
        entryPoint: string;
        issuer: string;
        idpCertFile: string;
        spEntityId: string;
        acsUrl: string;
      }>(req);
      if (!body.hostDir || !body.providerId || !body.entryPoint || !body.issuer || !body.idpCertFile || !body.spEntityId || !body.acsUrl) {
        apiError(res, 400, 'Required: hostDir, providerId, entryPoint, issuer, idpCertFile, spEntityId, acsUrl');
        return true;
      }
      const { identityProviderAddSamlCli } = await import('../identity/identityCli.js');
      const out = identityProviderAddSamlCli(body);
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'SAML provider add failed');
    }
    return true;
  }

  // POST /api/v1/identity/mapping/add — add group-to-role mapping rule
  if (pathname === '/api/v1/identity/mapping/add' && method === 'POST') {
    try {
      const body = await bodyJson<{
        hostDir: string;
        group: string;
        providerId?: string;
        workspaceId?: string;
        roles?: Array<'OWNER' | 'OPERATOR' | 'AUDITOR' | 'VIEWER'>;
        hostAdmin?: boolean;
      }>(req);
      if (!body.hostDir || !body.group) {
        apiError(res, 400, 'Required: hostDir, group');
        return true;
      }
      const { identityMappingAddCli } = await import('../identity/identityCli.js');
      const out = identityMappingAddCli(body);
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Identity mapping add failed');
    }
    return true;
  }

  // POST /api/v1/identity/scim/token/create — create SCIM bearer token
  if (pathname === '/api/v1/identity/scim/token/create' && method === 'POST') {
    try {
      const body = await bodyJson<{
        hostDir: string;
        name: string;
        outFile?: string;
      }>(req);
      if (!body.hostDir || !body.name) {
        apiError(res, 400, 'Required: hostDir, name');
        return true;
      }
      const { scimTokenCreateCli } = await import('../identity/identityCli.js');
      const out = scimTokenCreateCli(body);
      apiSuccess(res, { tokenId: out.tokenId, tokenHash: out.tokenHash }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'SCIM token create failed');
    }
    return true;
  }

  return false;
}
