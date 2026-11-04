# forged-embedded-key

Someone fabricated a newer attestation (sequence 8) and signed it with a fresh key carried in the artifact's own signature envelope (pubkeyB64, the issuer hint). The signature matches the carried key, so integrity passes, but no pinned list admits that key. An artifact's embedded key must never vouch for it.
