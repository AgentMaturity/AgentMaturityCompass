# Portable evidence examples

After building AMC, generate synthetic Pi-shaped and DSH-shaped profiles:

```sh
node examples/external-evidence/generate.mjs
amc imports verify-profile tmp/external-evidence-examples/pi-session.profile.json --original tmp/external-evidence-examples/pi-session.original.json --json
amc imports verify-profile tmp/external-evidence-examples/dsh-session.profile.json --original tmp/external-evidence-examples/dsh-session.original.json --json
```

The examples contain a tool failure, cancellation, an unverified external parent and unknown timing/cost. They are unsigned and self-reported. They are synthetic, not actual Pi or DSH session files or measured task results. For real source files, use `amc import <path> --dry-run --json`, then apply the reviewed digest; the manifest lists portable projections separately from retained normalized source.

The [profile specification](../../docs/EXTERNAL_EVIDENCE_PROFILE.md) documents canonicalization, authority configuration, limits and migration. The standalone exported module uses only Node crypto; a consumer does not need an AMC workspace or provider credentials.
