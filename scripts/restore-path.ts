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
