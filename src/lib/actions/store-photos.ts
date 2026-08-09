import "server-only";

import { sniffImageMime } from "@/lib/image-format";

/** MIME types we accept for photo capture/upload (UI hint only). */
export const ACCEPTED_IMAGE = /^image\/(jpe?g|png|webp|heic|heif)$/i;

/**
 * Process + persist a batch of uploaded image files via the given `store`
 * callback. Skips empty/unsupported files, and logs-and-continues on a bad
 * photo so one failure never sinks the whole save. Returns how many stored.
 *
 * Admission is decided on the SNIFFED content type (the bytes sharp decodes),
 * never the client `File.type`, which is forgeable — otherwise svg/gif/tiff
 * bytes reach libvips behind an image-only allowlist. The sniffed MIME is what
 * we hand `store`, so the persisted extension matches the real content.
 */
export async function storePhotoFiles(
  files: File[],
  context: string,
  store: (buffer: Buffer, mimeType: string) => Promise<void>,
): Promise<number> {
  let stored = 0;
  for (const file of files) {
    if (file.size === 0) continue;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = sniffImageMime(buffer);
      if (!mimeType) continue;
      await store(buffer, mimeType);
      stored += 1;
    } catch (err) {
      console.error(
        `[capture] could not process photo "${file.name}" (${file.type}, ${file.size} bytes) for ${context}:`,
        err,
      );
    }
  }
  return stored;
}
