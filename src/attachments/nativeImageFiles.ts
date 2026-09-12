import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { basename } from "node:path";
import { imageTypeForFilename, materializeNativeImages, MAX_NATIVE_IMAGE_BYTES, MAX_NATIVE_IMAGE_INPUT_BYTES, MAX_NATIVE_IMAGES,
  NativeImageInputError, snapshotNativeImages, type NativeImageInput } from "./nativeImageInput.js";

/** Explicit operator paths only; no URL retrieval, symlink following or unbounded read. */
export function loadNativeImageFiles(paths: readonly string[] = []): readonly NativeImageInput[] {
  if (!Array.isArray(paths) || paths.length > MAX_NATIVE_IMAGES) throw new NativeImageInputError("Too many native image paths.");
  let total = 0;
  const images = paths.map(path => {
    if (typeof path !== "string" || !path || path.length > 4096 || path.includes("\0") || /^(?:https?|data|file):/i.test(path)) {
      throw new NativeImageInputError("--image requires an explicit local regular-file path, not a URL.");
    }
    const filename = basename(path), mediaType = imageTypeForFilename(filename);
    if (mediaType === null) throw new NativeImageInputError("--image supports explicit .png, .jpg, .jpeg, .gif or .webp files only.");
    if (typeof constants.O_NOFOLLOW !== "number") throw new NativeImageInputError("This platform cannot enforce native image no-follow file admission.");
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size < 1 || before.size > MAX_NATIVE_IMAGE_BYTES) throw new NativeImageInputError("--image requires a nonempty regular file within the native per-image byte limit.");
      total += before.size;
      if (total > MAX_NATIVE_IMAGE_INPUT_BYTES) throw new NativeImageInputError("--image paths exceed the native aggregate byte limit.");
      const buffer = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = readSync(fd, buffer, length, buffer.length - length, null);
        if (read === 0) break;
        length += read;
      }
      const after = fstatSync(fd);
      if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
        throw new NativeImageInputError("Image file changed while it was being read; no input was queued.");
      }
      return { filename, mediaType, bytes: Buffer.from(buffer.subarray(0, length)) };
    } finally { closeSync(fd); }
  });
  return materializeNativeImages(snapshotNativeImages(images));
}
