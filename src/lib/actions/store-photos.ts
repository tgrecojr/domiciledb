import "server-only";

import { config } from "@/lib/config";
import { remainingMediaQuotaBytes } from "@/lib/media";

/** MIME types we accept for photo capture/upload. */
export const ACCEPTED_IMAGE = /^image\/(jpe?g|png|webp|heic|heif)$/i;

/**
 * Process + persist a batch of uploaded image files via the given `store`
 * callback. Skips empty/unsupported files, and logs-and-continues on a bad
 * photo so one failure never sinks the whole save. Returns how many stored.
 *
 * The app has no auth in front of the capture forms, so the batch is bounded
 * three ways: a per-request file count, a per-file byte cap enforced from
 * `size` (before the file is ever buffered), and the DATA_DIR media quota.
 */
export async function storePhotoFiles(
  files: File[],
  context: string,
  store: (buffer: Buffer, mimeType: string) => Promise<void>,
): Promise<number> {
  const batch = files.slice(0, config.uploads.maxFilesPerRequest);
  if (batch.length < files.length) {
    console.warn(
      `[capture] ignored ${files.length - batch.length} extra photo(s) for ${context}: over the ${config.uploads.maxFilesPerRequest}-file per-request cap`,
    );
  }

  // Budget for this batch, charged from the originals; the derived web/thumb
  // variants are far smaller and are picked up by the next request's re-check.
  let budget = await remainingMediaQuotaBytes();

  let stored = 0;
  for (const file of batch) {
    if (file.size === 0 || !ACCEPTED_IMAGE.test(file.type)) continue;
    if (file.size > config.uploads.maxFileBytes) {
      console.warn(
        `[capture] rejected photo "${file.name}" for ${context}: ${file.size} bytes is over the ${config.uploads.maxFileBytes}-byte cap`,
      );
      continue;
    }
    if (file.size > budget) {
      console.warn(
        `[capture] rejected photo "${file.name}" for ${context}: media storage quota exhausted`,
      );
      break;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await store(buffer, file.type);
      budget -= file.size;
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
