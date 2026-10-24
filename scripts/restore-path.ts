import path from "node:path";

/**
 * Resolve an S3 object key to an absolute destination inside `dataDir`, or null
 * if the key would escape it. S3 keys are attacker-influenced, so a key like
 * `media/../../../x` (or an absolute `/etc/passwd`) must not let the restore
 * write outside DATA_DIR (zip-slip / CWE-22). `path.resolve` normalizes
 * `.`/`..`; the trailing-separator prefix check defeats the sibling-prefix
 * bypass (e.g. `data-evil`), and NUL bytes are rejected outright (they truncate
 * the path at the C layer).
 */
// @spec RESILIENCE-RESTORE-002
export function resolveWithinDataDir(
	dataDir: string,
	key: string,
): string | null {
	if (typeof key !== "string" || key.includes("\0")) return null;
	const root = path.resolve(dataDir);
	const dest = path.resolve(root, key);
	if (dest !== root && !dest.startsWith(root + path.sep)) return null;
	return dest;
}

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");

/**
 * True when the bytes begin with the SQLite 3 file header. The restore must
 * never overwrite the live database with an error page, an empty object, or a
 * truncated download that happened to be stored under the snapshot key.
 */
// @spec RESILIENCE-RESTORE-005
export function isSqliteDatabase(bytes: Uint8Array): boolean {
	if (bytes.length < SQLITE_HEADER.length) return false;
	return Buffer.from(bytes.subarray(0, SQLITE_HEADER.length)).equals(
		SQLITE_HEADER,
	);
}

/**
 * The bucket is append-only (a backup never deletes evidence), so it also
 * holds media for photos and documents the owner has since deleted. A restore
 * brings back only the objects some row in the restored database still
 * references; the rest are reported and left in the bucket.
 */
// @spec RESILIENCE-RESTORE-007
export function referencedOnly(
	keys: string[],
	referencedPaths: Set<string>,
): { restore: string[]; skipped: string[] } {
	const referenced = new Set(
		[...referencedPaths].map((p) => p.replace(/\\/g, "/")),
	);
	const restore: string[] = [];
	const skipped: string[] = [];
	for (const key of keys) (referenced.has(key) ? restore : skipped).push(key);
	return { restore, skipped };
}
