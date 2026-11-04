---
"agent-maturity-compass": patch
---

Federation imports now authenticate retained publisher history across peer aliases before checking replay and rollback, while keeping distinct signing keys independent. Corrupt or unattributable non-staging history blocks imports until repaired. Imports reject linked destination and history components, create missing inbox directories only after admission, and use an exclusively created staging directory without replacing an existing destination. The operator-selected workspace root may still be a symlink. These checks cover serial imports and static links; they do not establish concurrent-import serialization or eliminate filesystem races.
