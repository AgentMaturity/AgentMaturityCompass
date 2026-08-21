import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["tests/**", "src/console/**", "src/dashboard/**"],
      /**
       * Enforced floor, set just below the measured baseline so a real
       * regression fails while normal fluctuation does not.
       *
       * These were all 0, so the gate could never fail and coverage was
       * collected but never enforced — the suite could lose whole subsystems
       * silently. Measured at the time of setting: lines 66.6, statements
       * 65.89, functions 76.26, branches 60.74.
       *
       * This is a ratchet: when coverage rises, raise the floor with it. The
       * 80% target in the engineering standards is the destination, not the
       * current state, and pretending otherwise is what left the gate at zero.
       */
      thresholds: {
        lines: 65,
        functions: 75,
        branches: 59,
        statements: 64
      }
    }
  }
});
