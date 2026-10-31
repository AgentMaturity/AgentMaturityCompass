# Preferred B39 receipt helper V2

V2 corrects the private snapshot provenance guard to match the actual immutable root pinset. Its sourceHead is the current source checkpoint `80268079`, from which all 1,917 packet Git blobs were verified. Separate previousMetadataCommit `8506539` and priorSemanticSourceCommit `f11a15ae` fields preserve the earlier metadata and receipt-source identities. The helper now requires the actual pinset schema and all1917SourceHeadBlobsExact flag, while keeping every other byte of V1 code unchanged.

The complete old packet, 1,914 payloads, 214 commands and 2,916 ordered input pins remain required. No pinset or original payload was rewritten. This is a pre-execution guard correction, not a copy bypass or a runtime result. V1 and both original documentation seals remain preserved. The original unready input template remains byte-exact with runtime fields null and root flags false. All privacy, marker-before-encoding, control chronology, restoration, peer, physical preservation and later publication checks remain unchanged.

Use the preferred V2 helper and field contract here, together with the unchanged root-level `input-template.json` and the prior detailed `README-preferred.md`, both explicitly pinned in V2 inputs. Root must read the exact delta and obtain independent static review before adoption or execution.
