import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { isWithin } from "../utils/pathSafety.js";

function directory(path: string, create: boolean): void {
  try {
    if (!lstatSync(path).isDirectory()) throw new Error("proof output parent must be an unlinked directory");
  } catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    mkdirSync(path);
    if (!lstatSync(path).isDirectory()) throw new Error("proof output parent must be an unlinked directory");
  }
}

/** Open a regular export destination before allowing the archive writer to truncate it. */
export function withProofArchiveOutput(workspace: string, outFile: string, write: (fd: number) => void): void {
  const workspacePath = resolve(workspace);
  const lexical = resolve(workspacePath, outFile);
  if (lexical === workspacePath) throw new Error("proof output must be a regular, singly linked file");
  const insideWorkspace = isWithin(workspacePath, lexical);
  const physicalWorkspace = realpathSync(workspacePath);
  const physical = insideWorkspace ? join(physicalWorkspace, relative(workspacePath, lexical))
    : join(realpathParent(dirname(lexical)), basename(lexical));
  const checkParents = (create: boolean): void => {
    if (!insideWorkspace) return;
    let parent = physicalWorkspace;
    for (const part of relative(physicalWorkspace, dirname(physical)).split(sep).filter(Boolean)) {
      parent = join(parent, part);
      directory(parent, create);
    }
  };
  checkParents(true);
  try {
    const leaf = lstatSync(physical);
    if (!leaf.isFile() || leaf.nlink !== 1) throw new Error("proof output must be a regular, singly linked file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const fd = openSync(physical, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
  try {
    checkParents(false);
    const opened = fstatSync(fd);
    const named = lstatSync(physical);
    if (!opened.isFile() || opened.nlink !== 1 || !named.isFile() || named.nlink !== 1
      || named.dev !== opened.dev || named.ino !== opened.ino || realpathSync(physical) !== physical) {
      throw new Error("proof output changed while opening");
    }
    // As with workspaceProofBundle's reader, Linux can check the opened path; elsewhere parent-swap refusal is
    // best effort. Node does not expose directory-relative open, so this is not atomic confinement against races.
    if (process.platform === "linux" && readlinkSync(`/proc/self/fd/${fd}`) !== physical) {
      throw new Error("proof output changed while opening");
    }
    ftruncateSync(fd, 0);
    write(fd);
  } finally {
    closeSync(fd);
  }
}

function realpathParent(parent: string): string {
  // The caller may deliberately choose a regular export outside the workspace.
  mkdirSync(parent, { recursive: true });
  return realpathSync(parent);
}
