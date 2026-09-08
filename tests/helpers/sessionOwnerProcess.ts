import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface OwnerProcess {
  child: ChildProcess;
  ready: Record<string, unknown>;
  command(value: string): Promise<Record<string, unknown>>;
  kill(): Promise<void>;
}

export async function startOwnerProcess(workspace: string, mode: string, sessionId?: string): Promise<OwnerProcess> {
  const child = fork(fileURLToPath(new URL("../fixtures/sessionOwnerProcess.ts", import.meta.url)), [workspace, mode, ...(sessionId ? [sessionId] : [])], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env }
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  const receive = (): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`child ${child.pid} timed out: ${stderr}`)); }, 10_000);
    const message = (value: Record<string, unknown>): void => { cleanup(); resolve(value); };
    const exit = (): void => { cleanup(); reject(new Error(`child ${child.pid} exited before receipt: ${stderr}`)); };
    function cleanup(): void { clearTimeout(timer); child.off("message", message); child.off("exit", exit); }
    child.once("message", message); child.once("exit", exit);
  });
  const ready = await receive();
  return {
    child, ready,
    command(value) { const reply = receive(); child.send(value); return reply; },
    async kill() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>((resolve) => { child.once("exit", () => resolve()); child.kill("SIGKILL"); });
    }
  };
}
