/**
 * cryptoRouter.ts — Cryptographic operations API routes.
 * Full parity with: amc notary *, amc cert *, amc transparency merkle *,
 *   amc receipts-chain, amc certify, amc sign (notary), amc pubkey (notary)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleCryptoRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/crypto')) return false;

  // ── Notary endpoints ──────────────────────────────────────────

  // GET /api/v1/crypto/notary/status — notary backend and log status
  if (pathname === '/api/v1/crypto/notary/status' && method === 'GET') {
    try {
      const notaryDir = queryParam(req.url ?? '', 'notaryDir');
      const { notaryStatusCli } = await import('../notary/notaryCli.js');
      const status = notaryStatusCli({ notaryDir });
      apiSuccess(res, status);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary status failed');
    }
    return true;
  }

  // GET /api/v1/crypto/notary/pubkey — notary public key and fingerprint
  if (pathname === '/api/v1/crypto/notary/pubkey' && method === 'GET') {
    try {
      const notaryDir = queryParam(req.url ?? '', 'notaryDir');
      const { notaryPubkeyCli } = await import('../notary/notaryCli.js');
      const out = notaryPubkeyCli({ notaryDir });
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary pubkey failed');
    }
    return true;
  }

  // POST /api/v1/crypto/notary/attest — generate signed attestation bundle
  if (pathname === '/api/v1/crypto/notary/attest' && method === 'POST') {
    try {
      const body = await bodyJson<{ outFile: string; notaryDir?: string; workspace?: string }>(req);
      if (!body.outFile) { apiError(res, 400, 'outFile required'); return true; }
      const { notaryAttestCli } = await import('../notary/notaryCli.js');
      const out = notaryAttestCli({
        notaryDir: body.notaryDir,
        workspace: body.workspace ?? workspace,
        outFile: body.outFile
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary attest failed');
    }
    return true;
  }

  // POST /api/v1/crypto/notary/verify-attest — verify .amcattest bundle
  if (pathname === '/api/v1/crypto/notary/verify-attest' && method === 'POST') {
    try {
      const body = await bodyJson<{ file: string }>(req);
      if (!body.file) { apiError(res, 400, 'file required'); return true; }
      const { notaryVerifyAttestCli } = await import('../notary/notaryCli.js');
      const result = notaryVerifyAttestCli(body.file);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary verify-attest failed');
    }
    return true;
  }

  // POST /api/v1/crypto/notary/sign — sign a payload file using Notary
  if (pathname === '/api/v1/crypto/notary/sign' && method === 'POST') {
    try {
      const body = await bodyJson<{ kind: string; inFile: string; outFile: string; notaryDir?: string }>(req);
      if (!body.kind || !body.inFile || !body.outFile) {
        apiError(res, 400, 'Required: kind, inFile, outFile');
        return true;
      }
      const { notarySignCli } = await import('../notary/notaryCli.js');
      const out = notarySignCli(body);
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary sign failed');
    }
    return true;
  }

  // GET /api/v1/crypto/notary/log-verify — verify notary append-only log
  if (pathname === '/api/v1/crypto/notary/log-verify' && method === 'GET') {
    try {
      const notaryDir = queryParam(req.url ?? '', 'notaryDir');
      const { notaryLogVerifyCli } = await import('../notary/notaryCli.js');
      const result = notaryLogVerifyCli({ notaryDir });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Notary log-verify failed');
    }
    return true;
  }

  // ── Certificate endpoints ─────────────────────────────────────

  // POST /api/v1/crypto/cert/generate — generate trust certificate
  if (pathname === '/api/v1/crypto/cert/generate' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; outputPath: string; validityDays?: number }>(req);
      if (!body.agentId || !body.outputPath) {
        apiError(res, 400, 'Required: agentId, outputPath');
        return true;
      }
      const { generateTrustCertificate } = await import('../cert/trustCertificate.js');
      const out = generateTrustCertificate({
        workspace,
        agentId: body.agentId,
        outputPath: body.outputPath,
        validityDays: body.validityDays
      });
      apiSuccess(res, {
        outputPath: out.outputPath,
        format: out.format,
        certId: out.envelope.payload.certificateId,
        score: out.envelope.payload.score,
        sidecarJsonPath: out.sidecarJsonPath
      }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Cert generate failed');
    }
    return true;
  }

  // POST /api/v1/crypto/cert/issue — issue signed certificate bundle
  if (pathname === '/api/v1/crypto/cert/issue' && method === 'POST') {
    try {
      const body = await bodyJson<{ runId: string; policyPath: string; outFile: string; agentId?: string }>(req);
      if (!body.runId || !body.policyPath || !body.outFile) {
        apiError(res, 400, 'Required: runId, policyPath, outFile');
        return true;
      }
      const { issueCertificate } = await import('../assurance/certificate.js');
      const out = await issueCertificate({
        workspace,
        runId: body.runId,
        policyPath: body.policyPath,
        outFile: body.outFile,
        agentId: body.agentId
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Cert issue failed');
    }
    return true;
  }

  // POST /api/v1/crypto/cert/verify — verify certificate bundle offline
  if (pathname === '/api/v1/crypto/cert/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ certFile: string; revocationFile?: string }>(req);
      if (!body.certFile) { apiError(res, 400, 'certFile required'); return true; }
      const { verifyCertificate } = await import('../assurance/certificate.js');
      const result = await verifyCertificate({
        certFile: resolve(workspace, body.certFile),
        revocationFile: body.revocationFile ? resolve(workspace, body.revocationFile) : undefined
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Cert verify failed');
    }
    return true;
  }

  // POST /api/v1/crypto/cert/inspect — inspect certificate bundle contents
  if (pathname === '/api/v1/crypto/cert/inspect' && method === 'POST') {
    try {
      const body = await bodyJson<{ certFile: string }>(req);
      if (!body.certFile) { apiError(res, 400, 'certFile required'); return true; }
      const { inspectCertificate } = await import('../assurance/certificate.js');
      const out = inspectCertificate(resolve(workspace, body.certFile));
      apiSuccess(res, {
        certId: out.cert.certId,
        agentId: out.cert.agentId,
        issuedTs: out.cert.issuedTs,
        integrityIndex: out.cert.integrityIndex,
        trustLabel: out.cert.trustLabel,
        fileCount: out.fileCount
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Cert inspect failed');
    }
    return true;
  }

  // POST /api/v1/crypto/cert/revoke — create signed revocation file
  if (pathname === '/api/v1/crypto/cert/revoke' && method === 'POST') {
    try {
      const body = await bodyJson<{ certFile: string; reason: string; outFile: string }>(req);
      if (!body.certFile || !body.reason || !body.outFile) {
        apiError(res, 400, 'Required: certFile, reason, outFile');
        return true;
      }
      const { revokeCertificate } = await import('../assurance/certificate.js');
      const out = revokeCertificate({
        workspace,
        certFile: resolve(workspace, body.certFile),
        reason: body.reason,
        outFile: body.outFile
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Cert revoke failed');
    }
    return true;
  }

  // POST /api/v1/crypto/cert/verify-revocation — verify revocation file
  if (pathname === '/api/v1/crypto/cert/verify-revocation' && method === 'POST') {
    try {
      const body = await bodyJson<{ file: string }>(req);
      if (!body.file) { apiError(res, 400, 'file required'); return true; }
      const { verifyRevocation } = await import('../assurance/certificate.js');
      const result = verifyRevocation(resolve(workspace, body.file));
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Cert verify-revocation failed');
    }
    return true;
  }

  // ── Transparency Merkle endpoints ─────────────────────────────

  // POST /api/v1/crypto/merkle/rebuild — rebuild Merkle leaves/roots
  if (pathname === '/api/v1/crypto/merkle/rebuild' && method === 'POST') {
    try {
      const { transparencyMerkleRebuildCli } = await import('../transparency/transparencyMerkleCli.js');
      const out = transparencyMerkleRebuildCli(workspace);
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Merkle rebuild failed');
    }
    return true;
  }

  // GET /api/v1/crypto/merkle/root — current Merkle root and history
  if (pathname === '/api/v1/crypto/merkle/root' && method === 'GET') {
    try {
      const { transparencyMerkleRootCli } = await import('../transparency/transparencyMerkleCli.js');
      const out = transparencyMerkleRootCli(workspace);
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Merkle root failed');
    }
    return true;
  }

  // POST /api/v1/crypto/merkle/prove — export signed inclusion proof
  if (pathname === '/api/v1/crypto/merkle/prove' && method === 'POST') {
    try {
      const body = await bodyJson<{ entryHash: string; outFile: string }>(req);
      if (!body.entryHash || !body.outFile) {
        apiError(res, 400, 'Required: entryHash, outFile');
        return true;
      }
      const { transparencyMerkleProofCli } = await import('../transparency/transparencyMerkleCli.js');
      const out = transparencyMerkleProofCli({
        workspace,
        entryHash: body.entryHash,
        outFile: body.outFile
      });
      apiSuccess(res, out, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Merkle prove failed');
    }
    return true;
  }

  // POST /api/v1/crypto/merkle/verify-proof — verify signed inclusion proof
  if (pathname === '/api/v1/crypto/merkle/verify-proof' && method === 'POST') {
    try {
      const body = await bodyJson<{ file: string }>(req);
      if (!body.file) { apiError(res, 400, 'file required'); return true; }
      const { transparencyMerkleVerifyProofCli } = await import('../transparency/transparencyMerkleCli.js');
      const result = transparencyMerkleVerifyProofCli(resolve(workspace, body.file));
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Merkle verify-proof failed');
    }
    return true;
  }

  // ── Receipts chain endpoint ───────────────────────────────────

  // GET /api/v1/crypto/receipts-chain/:receiptId — delegation chain for a receipt
  if (pathname.startsWith('/api/v1/crypto/receipts-chain/') && method === 'GET') {
    try {
      const receiptId = pathname.slice('/api/v1/crypto/receipts-chain/'.length);
      if (!receiptId) { apiError(res, 400, 'receiptId required in path'); return true; }
      const { verifyDelegationChain } = await import('../receipts/receiptChain.js');
      const { getPublicKeyHistory } = await import('../crypto/keys.js');
      let publicKeys: string[] = [];
      try {
        publicKeys = getPublicKeyHistory(workspace, 'monitor');
      } catch { /* no keys available */ }
      const result = verifyDelegationChain(receiptId, publicKeys);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Receipts chain failed');
    }
    return true;
  }

  return false;
}
