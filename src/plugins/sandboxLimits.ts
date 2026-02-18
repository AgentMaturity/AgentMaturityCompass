/**
 * Plugin Sandbox Resource Limits
 *
 * Enforces CPU time, memory, I/O rate, and network restrictions on
 * plugin execution. Limits are configurable via plugin policy.
 *
 * CLI:   amc plugin limits
 * Metric: amc_plugin_resource_usage
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const sandboxLimitsSchema = z.object({
  cpuTimeoutMs: z.number().int().min(1000).default(30_000),
  memoryLimitMb: z.number().int().min(16).default(256),
  ioRateMbps: z.number().min(0.1).default(10),
  networkEnabled: z.boolean().default(false),
});

export type SandboxLimits = z.infer<typeof sandboxLimitsSchema>;

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  cpuTimeoutMs: 30_000,
  memoryLimitMb: 256,
  ioRateMbps: 10,
  networkEnabled: false,
};

// ---------------------------------------------------------------------------
// Resource usage tracking
// ---------------------------------------------------------------------------

export interface PluginResourceUsage {
  pluginId: string;
  executionId: string;
  cpuTimeMs: number;
  peakMemoryMb: number;
  ioBytesMb: number;
  networkAttempts: number;
  startTs: number;
  endTs: number;
  limitViolations: LimitViolation[];
}

export interface LimitViolation {
  type: "CPU_TIMEOUT" | "MEMORY_EXCEEDED" | "IO_RATE_EXCEEDED" | "NETWORK_DENIED";
  limit: number;
  actual: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

/**
 * Create a timeout wrapper that kills execution after cpuTimeoutMs.
 */
export function withCpuTimeout<T>(
  fn: () => Promise<T>,
  limits: SandboxLimits
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PluginSandboxError(
        "CPU_TIMEOUT",
        `Plugin execution exceeded CPU time limit of ${limits.cpuTimeoutMs}ms`
      ));
    }, limits.cpuTimeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Check if a plugin should be allowed network access.
 */
export function assertNetworkAllowed(limits: SandboxLimits): void {
  if (!limits.networkEnabled) {
    throw new PluginSandboxError(
      "NETWORK_DENIED",
      "Plugin network access is denied by sandbox policy"
    );
  }
}

/**
 * Build process resource limit arguments for child_process.spawn.
 * On macOS/Linux, uses ulimit-style constraints where available.
 */
export function buildProcessResourceArgs(limits: SandboxLimits): {
  env: Record<string, string>;
  timeout: number;
  maxBuffer: number;
} {
  return {
    env: {
      AMC_SANDBOX_CPU_TIMEOUT_MS: String(limits.cpuTimeoutMs),
      AMC_SANDBOX_MEMORY_LIMIT_MB: String(limits.memoryLimitMb),
      AMC_SANDBOX_IO_RATE_MBPS: String(limits.ioRateMbps),
      AMC_SANDBOX_NETWORK_ENABLED: limits.networkEnabled ? "1" : "0",
    },
    timeout: limits.cpuTimeoutMs,
    maxBuffer: limits.memoryLimitMb * 1024 * 1024,
  };
}

/**
 * Validate resource usage against limits and return violations.
 */
export function checkUsageViolations(
  usage: Pick<PluginResourceUsage, "cpuTimeMs" | "peakMemoryMb" | "ioBytesMb" | "networkAttempts">,
  limits: SandboxLimits
): LimitViolation[] {
  const violations: LimitViolation[] = [];

  if (usage.cpuTimeMs > limits.cpuTimeoutMs) {
    violations.push({
      type: "CPU_TIMEOUT",
      limit: limits.cpuTimeoutMs,
      actual: usage.cpuTimeMs,
      message: `CPU time ${usage.cpuTimeMs}ms exceeded limit ${limits.cpuTimeoutMs}ms`,
    });
  }

  if (usage.peakMemoryMb > limits.memoryLimitMb) {
    violations.push({
      type: "MEMORY_EXCEEDED",
      limit: limits.memoryLimitMb,
      actual: usage.peakMemoryMb,
      message: `Peak memory ${usage.peakMemoryMb}MB exceeded limit ${limits.memoryLimitMb}MB`,
    });
  }

  const ioLimitMb = limits.ioRateMbps; // simplified: total I/O check
  if (usage.ioBytesMb > ioLimitMb * (limits.cpuTimeoutMs / 1000)) {
    violations.push({
      type: "IO_RATE_EXCEEDED",
      limit: ioLimitMb,
      actual: usage.ioBytesMb,
      message: `I/O ${usage.ioBytesMb}MB exceeded rate limit of ${ioLimitMb}MB/s`,
    });
  }

  if (!limits.networkEnabled && usage.networkAttempts > 0) {
    violations.push({
      type: "NETWORK_DENIED",
      limit: 0,
      actual: usage.networkAttempts,
      message: `${usage.networkAttempts} network attempt(s) blocked by sandbox policy`,
    });
  }

  return violations;
}

/**
 * Resolve sandbox limits from plugin policy or fall back to defaults.
 */
export function resolveSandboxLimits(
  policyLimits?: Partial<SandboxLimits>
): SandboxLimits {
  if (!policyLimits) {
    return { ...DEFAULT_SANDBOX_LIMITS };
  }
  return sandboxLimitsSchema.parse({
    ...DEFAULT_SANDBOX_LIMITS,
    ...policyLimits,
  });
}

/**
 * Format limits for CLI display.
 */
export function formatSandboxLimits(limits: SandboxLimits): string {
  const lines = [
    `  CPU timeout:     ${limits.cpuTimeoutMs}ms (${(limits.cpuTimeoutMs / 1000).toFixed(0)}s)`,
    `  Memory limit:    ${limits.memoryLimitMb}MB`,
    `  I/O rate limit:  ${limits.ioRateMbps}MB/s`,
    `  Network access:  ${limits.networkEnabled ? "ALLOWED" : "DENIED (default)"}`,
  ];
  return lines.join("\n");
}

/**
 * Build Prometheus-compatible metric line for plugin resource usage.
 */
export function pluginResourceMetric(usage: PluginResourceUsage): string {
  const labels = `plugin="${usage.pluginId}",execution="${usage.executionId}"`;
  const lines = [
    `amc_plugin_resource_usage_cpu_ms{${labels}} ${usage.cpuTimeMs}`,
    `amc_plugin_resource_usage_memory_mb{${labels}} ${usage.peakMemoryMb}`,
    `amc_plugin_resource_usage_io_mb{${labels}} ${usage.ioBytesMb}`,
    `amc_plugin_resource_usage_network_attempts{${labels}} ${usage.networkAttempts}`,
    `amc_plugin_resource_usage_violations{${labels}} ${usage.limitViolations.length}`,
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PluginSandboxError extends Error {
  constructor(
    public readonly violationType: LimitViolation["type"],
    message: string
  ) {
    super(message);
    this.name = "PluginSandboxError";
  }
}
