# P0-47 bounded current-failure reuse preflight — 14 October2026

This report prepares only the earlier displayed API/explainability/OIDC/native fixture failures at candidate7a81. It is not whole-run qualification. Current source was not edited.

## Confirmed bounded leads

### apiRouters formal certificate

Mock verifyFormalCertificate returns {valid:true} with no issues. Current enforceRouter supplies result.issues to unsignedArtifactReport and buildVerifierReport reads integrityErrors.length, producing the observed500 route failure.

Add issues:[] to the mock and assert actual response valid:false/integrityValid:true/status:UNTRUSTED. No cryptographic/trust production change.

Confirmed source/legacy failure evidence; exact current test hunk is unexecuted.

### question score explainability metadata

Both tests demand legacy release-gate advice despite finalLevel4/targetL5. Current repairHintFor first invokes notEvaluatedLevel; current L4/L5 gates explicitly have no registered continuity/scoped-attestation emitter. Guide advice likewise exposes NOT_EVALUATED and an empty evidence-needed list.

Reuse only the existing P1-07 NOT_EVALUATED hint/guide/passport expectations. Keep source refs, accepted/rejected evidence, score fields, row hashes and metadata-only boundaries unchanged.

Confirmed current source; questionScoreExplainability, levelSemantics and guideGenerator production byte comparison recorded.

### enterprise OIDC fixture

Fake issuer uses EdDSA and HTTP without literal-loopback opt-in. Current jwtVerify allows only RS256/PS256/ES256 and enforces HTTPS unless literal loopback is explicitly opted in; login therefore refuses before callback assertions. The affirmative-email fixture also expects401 although current missing/unverified-email route returns403.

Use real RSA2048/SHA256 signing, narrowly scoped loopback vi.stubEnv with restoration, and retained HTTP-refusal/email-proof/bad-state/bad-nonce/bad-signature/missing-email assertions. No production acceptance widening.

Confirmed current source; three OIDC production files byte-equal to preserved P0-33.

### API security JWT expiry/nonce fixture

HTTP validation rejects the old issuer before expiry/nonce checks; EdDSA is also outside current permitted algorithms. The old assertion consequently sees generic verification failure instead of expired.

Reuse the actual RSA2048 fixture and scoped loopback opt-in while retaining expiry and nonce negatives and adding explicit unsupported-EdDSA/private-destination/non-opted-HTTP negatives. No production change.

Confirmed current source; direct current-core byte comparison and retained old main-CI error first line.

### native operator home

Original fixture passes <workspace>/operator-home as HOME; default HOME/.amc/control-checkpoints lies inside the governed workspace and is refused. A controlled same-case experiment and the entire unchanged-assertion file on Node24 confirm that changing only home placement/paired cleanup resolves the observed startup failures at that scope.

Do not copy the P0-33 full native test or production file, closed/sealed verdict expectations, new budget/lease/moving-ledger tests, or reserved private/P165/A4 changes.

Controlled Node24/file scope confirmed; not an active Node22 whole-run pass.

## Exact unexecuted test hunks and hashes

### tests/apiRouters.test.ts

Before SHA256: `64fe33c9b184db17c8abc522cd7435a3c53af4e4672b82c3550dda551a27b748`. Proposed SHA256: `5724a984520a581a14c21d8f8ab835b54a88400c15fd31580dacb240d2efd6a9`. No hunk applied.

```diff
--- a/tests/apiRouters.test.ts
+++ b/tests/apiRouters.test.ts
@@ -285,7 +285,7 @@
 
   boundedModelCheck: vi.fn(() => ({ verified: true })),
   generateTLASpec: vi.fn(() => "---- MODULE Spec ----"),
-  verifyFormalCertificate: vi.fn(() => ({ valid: true })),
+  verifyFormalCertificate: vi.fn(() => ({ valid: true, issues: [] as string[] })),
 
   collectVerifierEvidence: vi.fn(async () => ({ rows: [1] })),
   renderVerifierEvidenceJson: vi.fn(() => ({ exported: true })),
@@ -1670,7 +1670,9 @@
     await assertJsonRoute(handleEnforceRoute as any, { pathname: "/api/v1/enforce/evaluate", method: "POST", body: { action: "deploy", tool: "kubectl", agentId: "agent-1", context: { env: "prod" } } });
     await assertJsonRoute(handleEnforceRoute as any, { pathname: "/api/v1/enforce/formal/verify", method: "POST", body: { property: { id: "p1", name: "Safe", description: "desc", formula: "G safe", kind: "safety", severity: "high" }, agentState: { ok: true } } });
     await assertJsonRoute(handleEnforceRoute as any, { pathname: "/api/v1/enforce/formal/tla-spec", method: "POST" });
-    await assertJsonRoute(handleEnforceRoute as any, { pathname: "/api/v1/enforce/formal/certificate", method: "POST", body: { certificate: { proof: true } } });
+    const certificate = await assertJsonRoute(handleEnforceRoute as any, { pathname: "/api/v1/enforce/formal/certificate", method: "POST", body: { certificate: { proof: true } } });
+    // P0-51: an unkeyed proof certificate is never an authentic artifact, even when its hash checks out.
+    expect(certificate).toMatchObject({ valid: false, integrityValid: true, status: "UNTRUSTED" });
   });
 
   test("evidence router covers status, list, gaps, ingest, collect, export, attest, and bundle routes", async () => {
```

### tests/questionScoreExplainability.test.ts

Before SHA256: `4787cfbbfc9c95ab8566cb0afbf8242e0e474a1ed51a2d49c6b6ea031c493e0a`. Proposed SHA256: `ab951b6e17a1fe25bec5f24edc373214744e6032055fec2bc49539250ac968a7`. No hunk applied.

```diff
--- a/tests/questionScoreExplainability.test.ts
+++ b/tests/questionScoreExplainability.test.ts
@@ -6928,7 +6928,8 @@
           reason: expect.stringContaining("DOI/OpenAlex/Zenodo metadata confirms source relevance only"),
         }),
       ],
-      repairHint: expect.stringContaining("release gates"),
+      // P1-07: AMC-1.3's L5 is not evaluated, so the hint names it and its reason instead of release-gate advice.
+      repairHint: expect.stringContaining("Target L5: Not evaluated: L5 needs a scoped attestation"),
       status: "ready",
       reproducibleEvalPacks: [
         expect.objectContaining({
@@ -6956,8 +6957,9 @@
     expect(guideMarkdown).toContain("Accepted evidence IDs: ev-gap-0634-eval-pack, ev-gap-0634-signed-ledgers, ev-gap-0634-ci");
     expect(guideMarkdown).toContain("ev-gap-0634-paper-metadata-only");
     expect(guideMarkdown).toContain("Repair hint:");
-    expect(guide.sections[0]?.evidenceNeeded.join("\n")).toContain("DOI/OpenAlex/Zenodo metadata");
-    expect(guide.sections[0]?.evidenceNeeded.join("\n")).toContain("cognitive-retrieval preprint");
+    // P1-07: AMC-1.3's L4 is not evaluated, so the section gives that reason and lists no evidence to collect for it.
+    expect(guide.sections[0]?.notEvaluated).toContain("Not evaluated: L4 needs continuity");
+    expect(guide.sections[0]?.evidenceNeeded).toEqual([]);
 
     const passport = passportJsonSchema.parse({
       v: 1,
@@ -7020,7 +7022,7 @@
       questionId: "AMC-1.3",
       acceptedEvidenceIds: ["ev-gap-0634-eval-pack", "ev-gap-0634-signed-ledgers", "ev-gap-0634-ci"],
       rejectedEvidenceReasons: [expect.objectContaining({ evidenceId: "ev-gap-0634-paper-metadata-only" })],
-      repairHint: expect.stringContaining("release gates"),
+      repairHint: expect.stringContaining("Target L5: Not evaluated"),
     });
   });
 
@@ -7145,7 +7147,8 @@
           reason: expect.stringContaining("repository metadata is source context only"),
         }),
       ],
-      repairHint: expect.stringContaining("release gates"),
+      // P1-07: AMC-1.3's L5 is not evaluated, so the hint names it and its reason instead of release-gate advice.
+      repairHint: expect.stringContaining("Target L5: Not evaluated: L5 needs a scoped attestation"),
       status: "ready",
       reproducibleEvalPacks: [
         expect.objectContaining({
@@ -7171,7 +7174,9 @@
     expect(guideMarkdown).toContain("Accepted evidence IDs: ev-uptrain-eval-pack, ev-uptrain-signed-ledgers");
     expect(guideMarkdown).toContain("ev-uptrain-repo-metadata-only");
     expect(guideMarkdown).toContain("Repair hint:");
-    expect(guide.sections[0]?.evidenceNeeded.join("\n")).toContain("UpTrain repository metadata");
+    // P1-07: AMC-1.3's L4 is not evaluated, so the section gives that reason and lists no evidence to collect for it.
+    expect(guide.sections[0]?.notEvaluated).toContain("Not evaluated: L4 needs continuity");
+    expect(guide.sections[0]?.evidenceNeeded).toEqual([]);
 
     const passport = passportJsonSchema.parse({
       v: 1,
@@ -7232,7 +7237,7 @@
       questionId: "AMC-1.3",
       acceptedEvidenceIds: ["ev-uptrain-eval-pack", "ev-uptrain-signed-ledgers"],
       rejectedEvidenceReasons: [expect.objectContaining({ evidenceId: "ev-uptrain-repo-metadata-only" })],
-      repairHint: expect.stringContaining("release gates"),
+      repairHint: expect.stringContaining("Target L5: Not evaluated"),
     });
   });
```

### tests/enterpriseSsoScim.test.ts

Before SHA256: `361742db0c03b657f46bfdce126fdc2d06043aa6e447c2524de017725cac20b5`. Proposed SHA256: `8458813ecb3596f66931306d3a7aabd76807d466274d1cdcfc2f1980336a4d1e`. No hunk applied.

```diff
--- a/tests/enterpriseSsoScim.test.ts
+++ b/tests/enterpriseSsoScim.test.ts
@@ -3,7 +3,7 @@
 import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
 import { join } from "node:path";
 import { tmpdir } from "node:os";
-import { afterEach, describe, expect, test } from "vitest";
+import { afterEach, describe, expect, test, vi } from "vitest";
 import { initWorkspace } from "../src/workspace.js";
 import { canonicalize } from "../src/utils/json.js";
 import { createHostUser, createWorkspaceRecord, findHostUserById, initHostDb, rolesForUserIdInWorkspace } from "../src/workspaces/hostDb.js";
@@ -29,6 +29,7 @@
 }
 
 afterEach(() => {
+  vi.unstubAllEnvs();
   while (roots.length > 0) {
     const dir = roots.pop();
     if (dir) {
@@ -121,20 +122,20 @@
   return { hostDir, workspaceDir };
 }
 
-function jwtSignEdDsa(params: {
+function jwtSignRs256(params: {
   privateKeyPem: string;
   kid: string;
   payload: Record<string, unknown>;
 }): string {
   const header = {
-    alg: "EdDSA",
+    alg: "RS256",
     typ: "JWT",
     kid: params.kid
   };
   const encodedHeader = b64url(JSON.stringify(header));
   const encodedPayload = b64url(JSON.stringify(params.payload));
   const input = `${encodedHeader}.${encodedPayload}`;
-  const signature = sign(null, Buffer.from(input, "utf8"), params.privateKeyPem);
+  const signature = sign("sha256", Buffer.from(input, "utf8"), params.privateKeyPem);
   return `${input}.${b64url(signature)}`;
 }
 
@@ -149,7 +150,8 @@
   close: () => Promise<void>;
 } {
   const kid = params.kid ?? "oidc-test-kid";
-  const keyPair = generateKeyPairSync("ed25519");
+  // P2-07 admits RS256, PS256 and ES256 only; EdDSA is refused.
+  const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
   const privateKeyPem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
   const publicJwk = keyPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
   const codeNonce = new Map<string, string>();
@@ -178,7 +180,7 @@
             {
               ...publicJwk,
               kid,
-              alg: "EdDSA",
+              alg: "RS256",
               use: "sig"
             }
           ]
@@ -234,7 +236,7 @@
       if (code !== "noemail") {
         payload.email = "sso-user@example.com";
       }
-      const idToken = jwtSignEdDsa({
+      const idToken = jwtSignRs256({
         privateKeyPem,
         kid,
         payload
@@ -361,6 +363,16 @@
     });
 
     try {
+      // P2-07: an HTTP identity provider is refused unless the loopback development opt-in is set.
+      const refused = await httpCall({
+        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/testoidc/login`,
+        method: "GET"
+      });
+      expect(refused.status).toBe(400);
+      expect(refused.headers.location).toBeUndefined();
+
+      // This fake IdP is the test's subject and listens on literal 127.0.0.1 over HTTP.
+      vi.stubEnv("AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK", "1");
       const login = await httpCall({
         url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/testoidc/login`,
         method: "GET"
@@ -447,6 +459,8 @@
     });
 
     try {
+      // This fake IdP is the test's subject and listens on literal 127.0.0.1 over HTTP.
+      vi.stubEnv("AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK", "1");
       const login = await httpCall({
         url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcemailproof/login`,
         method: "GET"
@@ -461,7 +475,9 @@
         url: String(authorize.headers.location ?? ""),
         method: "GET"
       });
-      expect(callback.status).toBe(401);
+      // P2-07 reports "OIDC email not verified", which the router answers 403 like a missing email.
+      expect(callback.status).toBe(403);
+      expect(callback.body).toContain("email not verified");
       expect(parseSetCookie(callback.headers)).not.toContain("amc_session=");
     } finally {
       await host.close();
@@ -502,6 +518,8 @@
     });
 
     try {
+      // This fake IdP is the test's subject and listens on literal 127.0.0.1 over HTTP.
+      vi.stubEnv("AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK", "1");
       const login = await httpCall({
         url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/login`,
         method: "GET"
```

### tests/security/api-security.test.ts

Before SHA256: `a571872a971327c9c8a12beba875f2a0536a81165da539501627a72d4571be54`. Proposed SHA256: `4e57d8cfa5e122ddad248e60438c94354b230ade8bc551972b80e91282421c1d`. No hunk applied.

```diff
--- a/tests/security/api-security.test.ts
+++ b/tests/security/api-security.test.ts
@@ -3,7 +3,7 @@
 import { mkdtempSync, rmSync } from "node:fs";
 import { tmpdir } from "node:os";
 import { join } from "node:path";
-import { afterEach, describe, expect, test } from "vitest";
+import { afterEach, describe, expect, test, vi } from "vitest";
 import { initWorkspace } from "../../src/workspace.js";
 import { loadAssurancePolicy, saveAssurancePolicy } from "../../src/assurance/assurancePolicyStore.js";
 import { startStudioApiServer } from "../../src/studio/studioServer.js";
@@ -14,7 +14,7 @@
 import { initHostDb, createHostUser, createWorkspaceRecord, grantMembership } from "../../src/workspaces/hostDb.js";
 import { hostWorkspaceDir } from "../../src/workspaces/workspacePaths.js";
 import { startWorkspaceRouter } from "../../src/workspaces/workspaceRouter.js";
-import { verifyJwtIdToken } from "../../src/identity/oidc/jwtVerify.js";
+import { validateOidcUrl, verifyJwtIdToken } from "../../src/identity/oidc/jwtVerify.js";
 
 const roots: string[] = [];
 
@@ -504,18 +504,21 @@
     }
   }, 30_000);
 
-  test("OIDC JWT verifier rejects expired and nonce-mismatched tokens", async () => {
-    const keyPair = generateKeyPairSync("ed25519");
+  test("OIDC JWT verifier rejects expired, nonce-mismatched, EdDSA and non-loopback-opt-in HTTP tokens", async () => {
+    // P2-07 admits RS256, PS256 and ES256 only.
+    const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
+    const edKeyPair = generateKeyPairSync("ed25519");
     const kid = "security-test-kid";
     const issuerPort = await pickFreePort();
     const issuer = `http://127.0.0.1:${issuerPort}`;
     const audience = "amc-security-audience";
     const jwk = keyPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
+    const edJwk = edKeyPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
     const server = createServer((req, res) => {
       if ((req.url ?? "").startsWith("/jwks")) {
         res.statusCode = 200;
         res.setHeader("content-type", "application/json");
-        res.end(JSON.stringify({ keys: [{ ...jwk, kid, alg: "EdDSA", use: "sig" }] }));
+        res.end(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }, { ...edJwk, kid: "ed-kid", alg: "EdDSA", use: "sig" }] }));
         return;
       }
       res.statusCode = 404;
@@ -524,13 +527,29 @@
     await new Promise<void>((resolvePromise) => server.listen(issuerPort, "127.0.0.1", () => resolvePromise()));
     try {
       const nowSec = Math.floor(Date.now() / 1000);
-      const encodeJwt = (claims: Record<string, unknown>): string => {
-        const header = toBase64Url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid }), "utf8"));
+      const encodeJwt = (claims: Record<string, unknown>, eddsa = false): string => {
+        const header = toBase64Url(Buffer.from(JSON.stringify({ alg: eddsa ? "EdDSA" : "RS256", typ: "JWT", kid: eddsa ? "ed-kid" : kid }), "utf8"));
         const payload = toBase64Url(Buffer.from(JSON.stringify(claims), "utf8"));
         const signingInput = Buffer.from(`${header}.${payload}`, "utf8");
-        const signature = signDetached(null, signingInput, keyPair.privateKey);
+        const signature = eddsa ? signDetached(null, signingInput, edKeyPair.privateKey) : signDetached("sha256", signingInput, keyPair.privateKey);
         return `${header}.${payload}.${toBase64Url(signature)}`;
       };
+      const verifyAt = (token: string) => verifyJwtIdToken({
+        token, issuer, audience, jwksUri: `${issuer}/jwks`, nonce: "expected-nonce", clockSkewSeconds: 0
+      });
+      const validClaims = { iss: issuer, aud: audience, sub: "oidc-user-1", nonce: "expected-nonce", exp: nowSec + 600, iat: nowSec };
+
+      // P2-07: an HTTP issuer is refused unless the loopback development opt-in is set.
+      expect(await verifyAt(encodeJwt(validClaims))).toEqual({ ok: false, error: "id_token verification failed" });
+      expect(() => validateOidcUrl("http://idp.example.com")).toThrow("OIDC HTTPS required");
+      expect(() => validateOidcUrl("https://10.0.0.1")).toThrow("OIDC private destination refused");
+      // The fake issuer is this test's subject and listens on literal 127.0.0.1 over HTTP.
+      vi.stubEnv("AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK", "1");
+      // The opt-in covers literal loopback only, never another private address or plain HTTP elsewhere.
+      expect(() => validateOidcUrl("https://10.0.0.1")).toThrow("OIDC private destination refused");
+      expect(() => validateOidcUrl("http://localhost:8080")).toThrow("OIDC HTTPS required");
+      expect((await verifyAt(encodeJwt(validClaims))).ok).toBe(true);
+      expect(await verifyAt(encodeJwt(validClaims, true))).toEqual({ ok: false, error: "unsupported jwt alg" });
 
       const expiredToken = encodeJwt({
         iss: issuer,
@@ -574,6 +593,7 @@
         expect(nonceMismatch.error).toContain("nonce mismatch");
       }
     } finally {
+      vi.unstubAllEnvs();
       await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
     }
   });
```

## Preservation and validation

Production byte comparisons are recorded in the JSON. NativeTaskService, activate/runReport-related newer behavior must not be inferred from preserved P0-33 whole-file copies. The native controlled result retains every current verdict assertion and is separate Node24 evidence.

Source/contract differences must be reviewed before using a preserved assertion. Apply only the bounded fixture/hint changes after the full run ends, retain actual targeted reports, and keep every coverage/freeze check and remaining failure strict. No private P2-02/P165/A4 production change is proposed.
