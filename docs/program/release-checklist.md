# Release checklist (weekly train, P1-41)

Copy this block into each release's `RELEASED` record and tick it as you go. The steps follow [RELEASE_CADENCE.md](../RELEASE_CADENCE.md) and [RELEASE_RUNBOOK.md](../RELEASE_RUNBOOK.md); a gate that is red is fixed forward, never waived, and a week that cannot pass is skipped.

```text
Release vX.Y.Z · <YYYY-MM-DD> · operator <name>
[ ] Changesets reviewed: each states its behaviour exactly, in the claim vocabulary; a major has a Sid decision
[ ] docs/releases/X.Y.Z.md reviewed; the weekly-train summary edited by hand
[ ] Version pull request merged: <PR URL>, merge commit <sha>
[ ] CI green on the merge commit, including the release-notes claim-word check: <run URL>
[ ] Tag pushed from a fresh clone: git tag -a vX.Y.Z <sha> -m "AMC X.Y.Z"; git push origin vX.Y.Z
[ ] Release run: check-release-candidate and check-release-notes passed in the gate job: <run URL>
[ ] release environment approved for approve, sign and release, for this version only
[ ] npm: npm view agent-maturity-compass@X.Y.Z version dist.integrity dist.attestations --json; latest = X.Y.Z
[ ] GitHub release has SHA256SUMS, the tarball, amc-X.Y.Z.amcrelease, sbom.cdx.json and image-digests.json
[ ] Signed bundle verifies against the pinned key from the tag (amc release verify ... --pubkey)
[ ] Studio image digests: the post-publish digest equals indexDigest in image-digests.json
[ ] post-publish-verify.yml green: <run URL>; artifacts copied to qualification/<YYYY-MM-DD>-release-X.Y.Z/
[ ] website/publication-status.json records X.Y.Z; installer pins updated if this release moves them: <PR URL>
[ ] Distribution row added to the Monday status (not measured stays "not measured")
[ ] RELEASED record posted
```

For a bad release, follow the [rollback and deprecation policy](../RELEASE_RUNBOOK.md#5-rollback-and-deprecation-policy): deprecate, never unpublish.
