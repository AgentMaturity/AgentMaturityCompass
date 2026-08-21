import { emitGuardEvent } from './evidenceEmitter.js';

/**
 * In-process execution tracker with error containment.
 *
 * This does NOT isolate. `runInSandbox` invokes the supplied closure directly
 * in the current process, so it shares memory, filesystem and network with the
 * caller; the memory/CPU/network/filesystem fields below are recorded as intent
 * and are not enforced. Handles previously reported `isolated: true`, which
 * could lead a caller to run untrusted code here.
 *
 * For real isolation use src/sandbox/sandbox.ts, which confines execution in a
 * Docker container with the network restricted to the AMC gateway.
 */
export interface SandboxConfig {
  memoryLimitMb: number;
  cpuTimeMs: number;
  networkAccess: boolean;
  filesystemAccess: boolean;
}

export interface SandboxHandle {
  sandboxId: string;
  active: boolean;
  /** Always false: execution happens in the calling process. */
  isolated: false;
  /** Names the mechanism actually providing isolation, if any. */
  isolationMechanism: 'none';
  /**
   * Requested limits. Recorded for audit only — nothing enforces them here.
   */
  config: SandboxConfig;
  /** True because the limits in `config` are not applied. */
  limitsEnforced: false;
  createdAt: number;
}

export interface SandboxExecResult {
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  memoryUsedMb?: number;
}

export class SandboxOrchestrator {
  private sandboxes = new Map<string, SandboxHandle>();
  private counter = 0;

  createSandbox(config: SandboxConfig): SandboxHandle {
    const id = `sbx_${Date.now()}_${++this.counter}`;
    if (config.memoryLimitMb > 4096) throw new Error('Memory limit exceeds 4096MB max');
    if (config.cpuTimeMs > 300000) throw new Error('CPU time exceeds 300s max');
    const handle: SandboxHandle = {
      sandboxId: id,
      active: true,
      isolated: false,
      isolationMechanism: 'none',
      config,
      limitsEnforced: false,
      createdAt: Date.now()
    };
    this.sandboxes.set(id, handle);
    return handle;
  }

  /**
   * Runs `fn` in the CURRENT process, catching thrown errors.
   *
   * No memory, CPU, network or filesystem limit from the handle's config is
   * applied. Do not use this to run untrusted code.
   */
  runInSandbox(id: string, fn: () => unknown): SandboxExecResult {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) return { success: false, error: 'Sandbox not found', durationMs: 0 };
    if (!sandbox.active) return { success: false, error: 'Sandbox is not active', durationMs: 0 };
    const start = Date.now();
    try {
      const result = fn();
      return { success: true, result, durationMs: Date.now() - start };
    } catch (err: unknown) {
      return { success: false, error: String(err), durationMs: Date.now() - start };
    }
  }

  destroySandbox(id: string): boolean {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) return false;
    sandbox.active = false;
    this.sandboxes.delete(id);
    return true;
  }

  getActive(): SandboxHandle[] {
    return [...this.sandboxes.values()].filter(s => s.active);
  }
}

const defaultOrchestrator = new SandboxOrchestrator();

export function createSandbox(sessionId: string): SandboxHandle {
  return defaultOrchestrator.createSandbox({
    memoryLimitMb: 512, cpuTimeMs: 30000, networkAccess: false, filesystemAccess: false,
  });
}