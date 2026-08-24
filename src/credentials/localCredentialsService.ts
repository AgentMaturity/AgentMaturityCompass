/**
 * The layered local store — `CredentialsService` over env, file and `.env`.
 *
 * The whole file is organised around one asymmetry. Reads are hot: every
 * outbound request re-resolves, so a read must be a map lookup and an
 * environment access, with no I/O. Writes are cold and dangerous: they are
 * read-modify-write on a file other processes also edit, they can be made
 * meaningless by an environment variable that outranks them, and they carry the
 * bytes that must never be logged. So reads run against a snapshot the reload
 * path keeps current, and writes run one at a time, under a cross-process lock,
 * against a freshly re-read disk, with the shadow question asked again at the
 * moment of writing rather than at the moment of asking.
 */
import { readFileSync } from "node:fs";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { type CredentialRef, credentialRef, credentialRefName } from "./credentialRef.js";
import { describeCredentialLayers, resolveCredentialLayers } from "./credentialResolution.js";
import type { CredentialDescription, CredentialSource } from "./credentialSources.js";
import { assertSettableCredentialValue } from "./credentialValue.js";
import { assertUnshadowedWrite } from "./credentialsErrors.js";
import { patchCredentialsFile } from "./credentialsFileFormat.js";
import { ensureCredentialsDirectory, writeCredentialsFileAtomic } from "./credentialsFileWriter.js";
import {
  type CredentialsPaths,
  type CredentialsPathsInput,
  resolveCredentialsPaths
} from "./credentialsPaths.js";
import type { CredentialsService } from "./credentialsService.js";
import {
  type CredentialsSnapshot,
  credentialLayersFor,
  loadCredentialsSnapshot
} from "./credentialsSnapshot.js";
import {
  type CredentialsWatcher,
  noCredentialsWatcher,
  watchCredentialsFile
} from "./credentialsWatcher.js";
import { SerialWriteQueue } from "./credentialsWriteQueue.js";

/** Lock name; the lock files land beside the store, inside the 0700 directory. */
const CREDENTIALS_LOCK_NAME = "credentials";

const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;

/** Why the in-memory snapshot changed. Carries no values, by construction. */
export type CredentialsUpdateCause = "boot" | "watch" | "reload" | "write";

export interface CredentialsUpdate {
  readonly at: string;
  readonly cause: CredentialsUpdateCause;
  /** How many references the file-backed layers configure, for diagnostics. */
  readonly configuredCount: number;
}

export interface LocalCredentialsOptions extends CredentialsPathsInput {
  /**
   * The environment forming the top layer. Defaults to `process.env`, and is
   * held by reference rather than copied so later mutations are seen — that is
   * what makes the shadow re-check after queuing able to reach a different
   * verdict than the one at the door.
   */
  readonly env?: NodeJS.ProcessEnv;
  /** Watch for external edits. Default true. */
  readonly watch?: boolean;
  readonly debounceMs?: number;
  readonly lockTimeoutMs?: number;
  readonly onUpdate?: (update: CredentialsUpdate) => void;
  /**
   * Called when a reload fails and the previous snapshot was kept.
   *
   * Worth wiring: without a subscriber, a store whose file became
   * world-readable at 3am keeps serving correct values and says nothing.
   */
  readonly onReloadError?: (error: unknown) => void;
}

/**
 * Reads and writes credentials against the local layered store.
 *
 * Constructing it *is* booting it: the first load runs in the constructor and
 * its failures — a group-readable file, unparsable YAML — propagate. That is
 * deliberate. A store that constructed successfully and failed later would be
 * indistinguishable, to every caller, from a store with no credentials in it,
 * and "no credentials configured" is a condition callers handle by carrying on.
 */
export class LocalCredentialsService implements CredentialsService {
  readonly paths: CredentialsPaths;

  private readonly env: NodeJS.ProcessEnv;
  private readonly queue = new SerialWriteQueue();
  private readonly lockTimeoutMs: number;
  private readonly onUpdate: ((update: CredentialsUpdate) => void) | null;
  private readonly onReloadError: ((error: unknown) => void) | null;
  private readonly watcher: CredentialsWatcher;

  private snapshot: CredentialsSnapshot;
  private reloadError: unknown = null;

  constructor(options: LocalCredentialsOptions = {}) {
    this.paths = resolveCredentialsPaths(options);
    this.env = options.env ?? process.env;
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.onUpdate = options.onUpdate ?? null;
    this.onReloadError = options.onReloadError ?? null;

    this.snapshot = loadCredentialsSnapshot(this.paths);
    this.publish("boot");

    if (options.watch === false || !this.prepareWatchDir()) {
      this.watcher = noCredentialsWatcher();
    } else {
      this.watcher = watchCredentialsFile({
        directory: this.paths.watchDir,
        fileName: this.paths.fileName,
        debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
        onChange: () => this.reloadFromWatch()
      });
    }
  }

  /**
   * Creates the watched directory, reporting rather than throwing on failure.
   *
   * It has to exist before it can be watched, and creating it here rather than
   * on first write means an edit made with an editor — before AMC has ever
   * written a key — is still seen. But a home that cannot be created is not a
   * reason to refuse to start: a container with a read-only HOME whose
   * credentials all arrive through the environment is a perfectly valid
   * deployment, and it needs no writable store at all.
   */
  private prepareWatchDir(): boolean {
    try {
      ensureCredentialsDirectory(this.paths.watchDir);
      return true;
    } catch {
      return false;
    }
  }

  /** Whether external edits are being observed, or a `reload()` is required. */
  get watching(): boolean {
    return this.watcher.attached;
  }

  /** The last reload failure whose snapshot was kept, or null. */
  get lastReloadError(): unknown {
    return this.reloadError;
  }

  resolve(ref: CredentialRef): string | null {
    return resolveCredentialLayers(this.layersFor(credentialRefName(ref))).value;
  }

  describe(ref: CredentialRef): CredentialDescription {
    return describeCredentialLayers(this.layersFor(credentialRefName(ref)));
  }

  /**
   * Every reference the file-backed layers name, sorted, values untouched.
   *
   * The process environment is deliberately not enumerated. It holds hundreds
   * of variables that are not credentials, and a listing that swept them all in
   * would turn `PATH` and `HOME` into "configured credentials" — which is both
   * noise and, for anything an operator then pastes into a ticket, a bigger
   * disclosure surface than the store itself. Env still *answers* for any
   * reference asked about by name; it just does not volunteer a catalogue.
   *
   * Not part of `CredentialsService`. Enumeration is an operator convenience,
   * not something a consumer of a credential should be able to do, and putting
   * it on the seam would oblige every future provider — a keychain, a cloud
   * secret manager — to implement a listing it may have no way to produce.
   */
  names(): readonly CredentialRef[] {
    const seen = new Set<string>([
      ...this.snapshot.file.keys(),
      ...this.snapshot.projectEnv.keys(),
      ...this.snapshot.userEnv.keys()
    ]);
    return [...seen].sort().map((name) => credentialRef(name));
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    const normalized = assertSettableCredentialValue(ref, value);
    const name = credentialRefName(ref);
    // Refused at the door as well as at the write, so the common case fails
    // immediately instead of after waiting behind an unrelated queue.
    assertUnshadowedWrite(ref, this.sourceOf(name));
    await this.queue.run(() => this.writeUnderLock(ref, name, normalized));
  }

  async unset(ref: CredentialRef): Promise<boolean> {
    const name = credentialRefName(ref);
    assertUnshadowedWrite(ref, this.sourceOf(name));
    return this.queue.run(() => this.writeUnderLock(ref, name, null));
  }

  /**
   * Re-reads every file-backed layer.
   *
   * Throws on failure, and leaves the previous snapshot in place when it does:
   * the assignment happens only after the load returns. A store that blanked
   * itself on a bad reload would turn one mistyped line into an outage across
   * every provider, which is a far larger failure than the edit that caused it.
   */
  reload(): void {
    this.applySnapshot(loadCredentialsSnapshot(this.paths), "reload");
    this.reloadError = null;
  }

  /** Stops watching and waits for queued writes to settle. */
  async close(): Promise<void> {
    this.watcher.close();
    await this.queue.drain();
  }

  private layersFor(name: string) {
    return credentialLayersFor({ snapshot: this.snapshot, env: this.env, name });
  }

  private sourceOf(name: string): CredentialSource | null {
    return resolveCredentialLayers(this.layersFor(name)).source;
  }

  private applySnapshot(next: CredentialsSnapshot, cause: CredentialsUpdateCause): void {
    this.snapshot = next;
    this.publish(cause);
  }

  private publish(cause: CredentialsUpdateCause): void {
    this.onUpdate?.({
      at: this.snapshot.loadedAt,
      cause,
      configuredCount: this.snapshot.file.size
    });
  }

  private reloadFromWatch(): void {
    try {
      this.applySnapshot(loadCredentialsSnapshot(this.paths), "watch");
      this.reloadError = null;
    } catch (error) {
      // Keep the last good snapshot. The failure is recorded and reported, but
      // it does not remove credentials that are still perfectly valid.
      this.reloadError = error;
      this.onReloadError?.(error);
    }
  }

  private readRaw(): string {
    try {
      return readFileSync(this.paths.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  /**
   * The write critical section.
   *
   * Order matters at every step and each step is here for a failure it prevents:
   * the directory must exist at 0700 before the lock file is created in it; the
   * lock must be held before the file is read, or two processes read the same
   * bytes and one write disappears; the snapshot must be re-read *inside* the
   * lock so the shadow question is asked about the world as it is now; and the
   * patch must go through the document rather than a re-serialised object, so a
   * concurrent addition of a different key survives this write.
   */
  private writeUnderLock(ref: CredentialRef, name: string, value: string | null): boolean {
    ensureCredentialsDirectory(this.paths.homeDir);
    return withControlFileLock({
      root: this.paths.homeDir,
      name: CREDENTIALS_LOCK_NAME,
      timeoutMs: this.lockTimeoutMs,
      operation: () => {
        // Re-read disk first: this also re-asserts permissions, so a file that
        // went world-readable since boot is refused before it is written to.
        this.applySnapshot(loadCredentialsSnapshot(this.paths), "reload");

        // Re-judged after queuing, against the environment as it stands now.
        // A key exported into the process while this write waited its turn now
        // outranks the file, and storing the value would promise a rotation
        // that no subsequent resolve would honour.
        assertUnshadowedWrite(ref, this.sourceOf(name));

        const patched = patchCredentialsFile({
          path: this.paths.file,
          raw: this.readRaw(),
          name,
          value
        });
        if (!patched.changed) return false;

        writeCredentialsFileAtomic(this.paths.file, patched.text);
        this.applySnapshot(loadCredentialsSnapshot(this.paths), "write");
        return true;
      }
    });
  }
}
