# Preferred V4 checkpoint receipt skeleton

The preferred inert helper is `v4/assemble-extension.py.source.txt`; `v4/v3-to-v4.patch.txt` contains the complete narrow change from preserved V3. No helper was imported, parsed, compiled or executed. No checkout, index, QA or actual evidence was changed.

V4 retains the exact selected command pin for each phase. The failed-original command pin must match the selected `p125k-fresh-canonical` command by path, byte count and SHA256. Each selected `rawProducer`, `rawSnapshot` and `observer` pin must match the corresponding artifact pin in that exact command record before those failure artifacts are read or copied. The existing log-path check and raw producer/snapshot byte-equality check remain in place. This closes the wrong-phase selection gap without changing accepted outcomes, source references, chronology, privacy, literal-marker, manual restoration or publication guards.

The actual failed command metadata was read only to confirm the three artifact roles and their path/bytes/SHA256 shape. No raw report, observer, log, private signing material, private-run record or child stream was read for this narrow repair. Its historical failure remains mandatory evidence excluded from acceptance. No fresh/control result is newly claimed here.

The V3 template is preserved. The V4 template adds only its own helper and delta hash-only pins and a version/boundary note; it remains `readyForPrivateAssembly:false`, with all unfilled actual outcome, control, peer, preservation, inventory, public-output, environment, cutoff and prose fields unchanged. Root must supply and review exact actual inputs, and an independent reviewer must inspect V4 before any helper use. All holds, Claude work, F37 and whole-plan limits remain intact.
