/**
 * Noticing that someone else changed the file.
 *
 * Without this, a key rotated by `vi ~/.config/amc/.credentials.yaml` — or by a
 * config-management run, or by a second AMC process — applies at the next
 * restart. That is the exact behaviour this seam exists to remove, and
 * per-operation re-resolution alone does not remove it: re-resolving against a
 * snapshot taken at boot returns the boot-time value forever.
 *
 * The directory is watched, not the file. An atomic rewrite replaces the inode,
 * and a watch on the old inode goes silent while reporting itself healthy —
 * which is worse than no watcher, because it looks like one.
 *
 * There is also a startup gap that has to be closed explicitly. `fs.watch`
 * returns before its underlying stream is actually armed — on macOS the
 * FSEvents stream is started on the loop thread after the call returns — so an
 * edit made in that window is never reported at all, and the store serves the
 * pre-edit value until something else triggers a reload. It is an intermittent
 * miss, which is the worst kind: the watcher looks healthy and is, most of the
 * time. chokidar (what dsh uses) hides this behind an initial scan on `ready`;
 * the same job is done here by one reconciling reload shortly after arming.
 */
import { watch, type FSWatcher } from "node:fs";

export interface CredentialsWatcher {
  /** False when the watch could not be attached; the store still works. */
  readonly attached: boolean;
  close(): void;
}

const NOT_WATCHING: CredentialsWatcher = Object.freeze({
  attached: false,
  close: () => undefined
});

export function noCredentialsWatcher(): CredentialsWatcher {
  return NOT_WATCHING;
}

/**
 * Watches `directory` for changes to `fileName` and calls `onChange`, debounced.
 *
 * Debouncing is not cosmetic. One logical edit produces several events — an
 * editor writes a swap file, renames it over the target and touches the
 * directory — and each would otherwise drive a full reload, so a save turns
 * into three parses of a file holding secrets and three chances to publish a
 * half-written state.
 *
 * A failure to attach is returned, not thrown. A store whose watcher could not
 * start still resolves correctly; it just needs an explicit `reload()`. Turning
 * that into a startup failure would make AMC refuse to run somewhere `inotify`
 * is exhausted, which is a worse outcome than a stale-until-reload store.
 */
export function watchCredentialsFile(input: {
  readonly directory: string;
  readonly fileName: string;
  readonly debounceMs: number;
  readonly onChange: () => void;
}): CredentialsWatcher {
  let watcher: FSWatcher;
  try {
    // `persistent: false` so a watching store never keeps a CLI process alive
    // after its work is done.
    watcher = watch(input.directory, { persistent: false });
  } catch {
    return NOT_WATCHING;
  }

  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const fire = (): void => {
    timer = null;
    if (closed) return;
    input.onChange();
  };

  // Closes the arming gap described above. One reload, not a poll: this is
  // about the window between `watch()` returning and the stream running, not
  // about distrusting the stream afterwards.
  const armingReconcile = setTimeout(() => {
    if (!closed) input.onChange();
  }, input.debounceMs);
  armingReconcile.unref();

  watcher.on("change", (_event, changed) => {
    // `changed` is null on some platforms; a nameless event about this
    // directory is still worth a reload, since the only file that matters here
    // is the one being watched for.
    if (typeof changed === "string" && changed !== input.fileName) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(fire, input.debounceMs);
    timer.unref();
  });

  // A watch that dies (directory removed, descriptor limit) must not take the
  // process with it; the store degrades to reload-on-demand.
  watcher.on("error", () => undefined);

  return {
    attached: true,
    close: () => {
      closed = true;
      clearTimeout(armingReconcile);
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      watcher.close();
    }
  };
}
