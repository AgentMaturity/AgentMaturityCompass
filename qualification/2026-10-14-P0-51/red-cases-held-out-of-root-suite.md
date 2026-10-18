# Three RED portable-CLI cases held out of the root suite — 18 October 2026

Integration note, added on `rtd/codex-full-integration`; no other file in this receipt was changed.

`tests/portableVerifierCliQualification.test.ts` (d8e516855) carried three cases that fail by design on current source. `pin-precedence-conflict.md` in this folder records why: `src/trust/admission.ts` admits a matching explicit pin before it evaluates a trust-list `key-compromise` revocation (P0-09's ordered step 6), while P0-09's goal says an admitted key is never revoked. No precedence change has been approved. The root suite cannot carry a failing or skipped test, so the three cases leave it and are kept here, exactly as committed, until the decision is made. On the integrated tip each still exits 0 where it expects 1, with an admitted explicit-key issuer and a passing integrity check.

Held out:

1. `Portable CLI Industry Packs license > key-compromise revocation beats a matching explicit license pin and both allow flags`
2. `Portable CLI external-evidence profile > signed revoked authority refuses even with the independent authority file` (the `"revoked"` row of its `test.each`; the `"distrusted"` row stays in the suite)
3. `Portable CLI detached session proof > matching fingerprint cannot bypass operator revoked decision` (the `"revoked"` row; `"distrusted"` stays)

```ts
  test("key-compromise revocation beats a matching explicit license pin and both allow flags", async () => {
    const result = await invoke("license-revoked-pinned", ["domain", "pack", "verify", "--key", license, "--pubkey", licensePin,
      ...listFlags("license-revoked-pinned", licenseIssuer, "artifact-seal", "revoked"), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe("revoked"); expect(result.report.trusted).toBe(false);
  });

  test.each(["distrusted", "revoked"] as const)("signed %s authority refuses even with the independent authority file", async (status) => {
    const result = await invoke(`imports-${status}`, [...profileArgs, ...listFlags(`imports-${status}`, authorityIssuer, "evidence-authority", status), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.body.signatureVerified).toBe(true); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe(status); expect(result.report.trusted).toBe(false);
  });

  test.each(["distrusted", "revoked"] as const)("matching fingerprint cannot bypass operator %s decision", async (status) => {
    const result = await invoke(`session-${status}`, [...sessionArgs, ...listFlags(`session-${status}`, sessionKey, "artifact-seal", status), ...bothAllows]);
    expect(result.status, result.stderr).toBe(1); expect(result.report.integrity.status).toBe("pass");
    expect(result.report.issuerAdmission.signatures[0]?.status).toBe(status); expect(result.report.trusted).toBe(false);
  });
```

To restore them: decide the precedence (Sid), change `admission.ts` if revocation must win, and put the three cases back in the test file.

## After the held line's P1-51 (merged 18 October 2026)

P1-51 changed what `amc domain pack verify` trusts: the licence verdict now uses only keys an operator-signed trust list admits for artifact-seal, the command no longer takes `--pubkey`, and `AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY` no longer counts. Case 1 passes `--pubkey`, so on the merged tip it stops at an unknown option before any verdict; with the list alone, the command exits 1 with a passing integrity check and the revoked key named with status `revoked`, because no explicit pin can admit a licence key any more. Case 1 therefore no longer describes the licence path, and the precedence question applies to cases 2 and 3 only. In the root suite, the licence cases of `tests/portableVerifierCliQualification.test.ts` and `tests/industryPackPortableVerification.test.ts` were changed in the same merge to follow P1-51.

Correction to the merge (f05c60026): its message said the held P1-51 verdict already kept what the Codex P0-51 change added. It did not. P1-51 tried only the keys the list admits, so a licence signed by a distrusted, revoked, expired or wrong-purpose list key was reported with no signer, a failed integrity check and the false reason that no licence key was pinned. A later commit on this branch restored Codex's reporting: such a key is named with its refusal, the integrity check passes, and the licence is still refused (exit 1). The refused-key assertions in both test files are back to Codex's. The licence results recorded in this receipt describe the source it qualified, not the merged tip.
