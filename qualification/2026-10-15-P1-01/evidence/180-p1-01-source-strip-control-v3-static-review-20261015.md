# P1-01 strip-control v3 static review

No blocking static finding in `2bfcf3374a0d3cd26388d334c887c27cae0c2957ff7d09a9b66eeba2c76fa5b5` (10,086 bytes). The complete v2-to-v3 diff contains only a fresh namespace, exact first-branch `z.strictObject` to `z.object` replacement, and an explicit strip-control label. The ownership fix and process/restoration gates are unchanged.

The authorized fixture exercises this branch. One added top-level member supplies a narrow refusal witness through the compiled schema/public API, with committed Ajv left unchanged. Real compilation and actual error attribution remain mandatory; static review predicts no passing command or kill.

This control accepts and strips unknown fields. It is separate from the literal `.passthrough()` control that parent reports halted at TS2339 compilation, before negative checks or restoration. Its success cannot close that literal mutation requirement. The old halted namespace remains unchanged.

Existing unbounded-wait, unknown-observed-PGID, borrowed-dependency and manifest-membership limits remain. All reads finished; no product import, parser, compile, runtime, copy or mutation by this reviewer. Root retains execution authority; formal acceptance remains open.
