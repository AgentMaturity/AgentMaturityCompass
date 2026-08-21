import { readFileSync, writeFileSync } from 'node:fs';
export interface RedactResult {
  redacted: boolean;
  strippedSegments: string[];
  outputBuffer: Buffer;
  originalSize: number;
  newSize: number;
}

export function hasExifData(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === 0xFF && buffer[i + 1] === 0xE1) return true;
  }
  return false;
}

export function redactScreenshotMetadata(buffer: Buffer): RedactResult {
  const originalSize = buffer.length;
  const output = Buffer.from(buffer);
  const strippedSegments: string[] = [];
  let redacted = false;

  let i = 0;
  while (i < output.length - 1) {
    if (output[i] === 0xFF && output[i + 1] === 0xE1) {
      // APP1 (EXIF) marker
      redacted = true;
      strippedSegments.push('EXIF/APP1');
      if (i + 3 < output.length) {
        const segLen = (output[i + 2]! << 8) | output[i + 3]!;
        const end = Math.min(i + 2 + segLen, output.length);
        // Check for GPS data within this segment
        for (let j = i; j < end - 3; j++) {
          // GPS IFD tag 0x8825
          if (output[j] === 0x88 && output[j + 1] === 0x25) {
            if (!strippedSegments.includes('GPS')) strippedSegments.push('GPS');
          }
        }
        // Zero out the segment content (keep marker for structure)
        for (let j = i + 4; j < end; j++) {
          output[j] = 0x00;
        }
        i = end;
      } else {
        i += 2;
      }
    } else {
      i++;
    }
  }

  return {
    redacted,
    strippedSegments,
    outputBuffer: output,
    originalSize,
    newSize: output.length,
  };
}

/**
 * Redacts metadata from an image file on disk and writes the result.
 *
 * This wrapper previously returned `redacted: true` with a synthesised output
 * path without reading, redacting or writing anything — so a caller believed a
 * screenshot had been scrubbed of EXIF data when the original was untouched.
 */
export function redactScreenshot(imagePath: string): {
  redacted: boolean;
  redactionsCount: number;
  outputPath: string;
} {
  const outputPath = imagePath.replace(/(\.\w+)$/, '_redacted$1');
  const buffer = readFileSync(imagePath);
  const result = redactScreenshotMetadata(buffer);
  writeFileSync(outputPath, result.outputBuffer);
  return {
    redacted: result.redacted,
    redactionsCount: result.strippedSegments.length,
    outputPath
  };
}
