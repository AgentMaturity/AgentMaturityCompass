---
"agent-maturity-compass": patch
---

The container smoke tests the shipped Studio layout, and a Compose upgrade and rollback rehearsal exists (LIVE-DEPLOY-16). `scripts/container-smoke.mjs` runs Studio without a tmpfs home, with the state volume at `/home/amc/.config/amc/state`, the signed-control checkpoint volume at `/workspace` (`AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints`) and `--stop-timeout 40`; it publishes a firewall control inside Studio and checks that the control and the anti-rollback marks survive a restart, and its receipt records labelled `docker stats` samples (LIVE-DEPLOY-14). The new `scripts/deploy/compose-rehearsal.mjs` runs image A, then B, then A again on one compose project through `AMC_STUDIO_IMAGE`, with READY, a pairing code minted inside the container and one governed turn per phase; an older image stopped by the P2-09 downgrade guard is recorded as the documented outcome, and it never runs `down -v`. The compose Studio services pass `AMC_EXPECTED_MONITOR_FINGERPRINT` from `.env` (empty by default, as in the Helm chart), so a compose deployment can anchor native-task verdicts to a monitor key pinned out of band.

freeze-exception: LIVE-DEPLOY — Compose upgrade/rollback rehearsal has no existing runner; rollback-drill.mjs uses docker run

The source image build gives `tsc` a 4096 MB V8 heap (`NODE_OPTIONS` on the `pnpm run build` step only): on a builder with less than 16 GB of memory V8's default heap was too small, and `docker build --target studio` (and `docker compose up -d --build`) aborted with "heap out of memory" in a 6 GB VM. The builder needs about 4 GB free for that step.
