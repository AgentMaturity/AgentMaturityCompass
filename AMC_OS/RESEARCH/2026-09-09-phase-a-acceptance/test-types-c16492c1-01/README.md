# Independent test-type failure — September 9

Fresh c16492c10592112fe610bd2e59f216f8f7f310b4 source, Darwin25.6.0 ARM64 / Node22.22.0, independently frozen installed in `/private/tmp/amc-c16492c1-test-types-01/checkout`. `pnpm run typecheck:tests` exited2 with67 compiler diagnostics. `result.json`, the exact typecheck log and per-command process record are mirrored here. Original private receipts and clone remain retained. All observed command processes closed; final clone source remained clean at its pin. This is compiler failure evidence, not a runtime/full-suite/mutation acceptance.
