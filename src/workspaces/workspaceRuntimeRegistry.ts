export class WorkspaceRuntimeClosingError extends Error {
  constructor() { super("Workspace routing is stopping; new runtime admission is closed."); }
}

/** Own both pending starts and ready runtimes, so concurrent requests cannot hide a second server. */
export class WorkspaceRuntimeRegistry<T extends { close(): Promise<void> }> {
  private readonly starts = new Map<string, Promise<T>>();
  private stopping = false;
  private shutdown: Promise<void> | undefined;

  get closing(): boolean { return this.stopping; }

  getOrCreate(workspaceId: string, factory: () => Promise<T>): Promise<T> {
    if (this.stopping) return Promise.reject(new WorkspaceRuntimeClosingError());
    const existing = this.starts.get(workspaceId);
    if (existing) return existing;
    // Store the promise before invoking the factory, including reentrant/microtask callers.
    const pending = Promise.resolve().then(() => {
      if (this.stopping) throw new WorkspaceRuntimeClosingError();
      return factory();
    });
    this.starts.set(workspaceId, pending);
    void pending.catch(() => {
      if (!this.stopping && this.starts.get(workspaceId) === pending) this.starts.delete(workspaceId);
    });
    return pending;
  }

  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.stopping = true;
    this.shutdown = (async () => {
      const started = await Promise.allSettled([...this.starts.values()]);
      const outcomes = await Promise.allSettled(started.flatMap(result =>
        result.status === "fulfilled" ? [Promise.resolve().then(() => result.value.close())] : []));
      this.starts.clear();
      if (outcomes.some(result => result.status === "rejected")) {
        throw new Error("A workspace runtime did not close cleanly; inspect its process before restarting Studio.");
      }
    })();
    return this.shutdown;
  }
}
