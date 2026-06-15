import "server-only";

/** MIME types we accept for photo capture/upload. */
export const ACCEPTED_IMAGE = /^image\/(jpe?g|png|webp|heic|heif)$/i;

/**
 * Process + persist a batch of uploaded image files via the given `store`
 * callback. Skips empty/unsupported files, and logs-and-continues on a bad
 * photo so one failure never sinks the whole save. Returns how many stored.
 */
export async function storePhotoFiles(
  files: File[],
  context: string,
  store: (buffer: Buffer, mimeType: string) => Promise<void>,
): Promise<number> {
  let stored = 0;
  for (const file of files) {
    if (file.size === 0 || !ACCEPTED_IMAGE.test(file.type)) continue;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await store(buffer, file.type);
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
