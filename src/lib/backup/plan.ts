/**
 * Pure backup-planning logic (no I/O), so the upload-decision is testable.
 *
 * Media filenames are content-addressed by the FULL sha256 digest, so a key
 * already present in S3 means identical bytes (collision-resistant — a 64-bit
 * prefix would not have been) — we only upload keys that are missing. The db
 * snapshot and latest-PDF keys are always re-uploaded (they change).
 */

export const SNAPSHOT_KEY = "backup/domiciledb-snapshot.db";
export const LATEST_PDF_KEY = "backup/proof-packet-latest.pdf";

/** Which content-addressed media keys still need uploading. */
export function mediaToUpload(
  localKeys: string[],
  existingKeys: Set<string>,
): string[] {
  return localKeys.filter((k) => !existingKeys.has(k));
}

/** Convert an absolute path under dataDir to its S3 key (POSIX-relative). */
export function keyForPath(absPath: string, dataDir: string): string {
  let rel = absPath.startsWith(dataDir)
    ? absPath.slice(dataDir.length)
    : absPath;
  rel = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  return rel;
}
