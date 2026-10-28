# OWASP ACS v0.1.4 fixtures (P2-19)

Third-party material used only by `tests/acsConformance.test.ts`.

- Source: `https://github.com/Agent-Control-Standard/ACS`, tag `v0.1.4`, commit `834f3f0d51e7bbbd9a68ff682bec89f97ddd72d8`.
- Copyright 2025-2026 The OWASP GenAI Security Project and the ACS contributors.
- Licence: Apache License 2.0 (`specification/**` and code samples embedded in Markdown, per the source's `LICENSING.md`).

`schema/` holds unmodified copies of `specification/v0.1.0/{request-envelope,response-envelope,handshake,modifications,ask-details,defer-details,provenance}.json` and `specification/v0.1.0/hooks/{tool-call-request,system-ping}.json`. Their SHA-256 values match the pinned tag; the source review lists the ones AMC relies on (docs/source-reviews/P2-19-owasp-acs.md).

`acs-in-action-tool-call-request.json` and `acs-in-action-response.json` are the first two JSON code samples of `docs/topics/ACS_in_action_example.md` at the tag, re-serialized with two-space indentation; no value was changed.

ACS v0.1.4 ships no conformance test suite or test vectors, so every case built on these files is AMC-authored.
