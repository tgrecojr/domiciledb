/**
 * Restore DomicileDB from the S3 backup into DATA_DIR. Run with the app STOPPED.
 *
 *   S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *   DATA_DIR=/data npm run restore
 *
 * Self-contained (no `@/` aliases) so it runs under plain tsx. Downloads the db
 * snapshot to <DATA_DIR>/domiciledb.db and the media tree to <DATA_DIR>/media.
 */
// @spec RESILIENCE-RESTORE-001, RESILIENCE-RESTORE-003, RESILIENCE-RESTORE-005, RESILIENCE-RESTORE-007
import fs from "node:fs";
import path from "node:path";
import {
	GetObjectCommand,
	ListObjectsV2Command,
	S3Client,
} from "@aws-sdk/client-s3";
import Database from "better-sqlite3";
import {
	isSqliteDatabase,
	referencedOnly,
	resolveWithinDataDir,
} from "./restore-path";

const SNAPSHOT_KEY = "backup/domiciledb-snapshot.db";

const dataDir = process.env.DATA_DIR
	? path.resolve(process.env.DATA_DIR)
	: path.join(process.cwd(), "data");

const bucket = process.env.S3_BUCKET;
if (!bucket) {
	console.error("S3_BUCKET is required to restore.");
	process.exit(1);
}

const endpoint = process.env.S3_ENDPOINT || undefined;
const client = new S3Client({
	region: process.env.S3_REGION || "us-east-1",
	endpoint,
	forcePathStyle: Boolean(endpoint),
	credentials: process.env.S3_ACCESS_KEY_ID
		? {
				accessKeyId: process.env.S3_ACCESS_KEY_ID,
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
			}
		: undefined,
});

async function downloadBytes(key: string): Promise<Uint8Array> {
	const res = await client.send(
		new GetObjectCommand({ Bucket: bucket, Key: key }),
	);
	if (!res.Body) throw new Error(`Empty object body for ${key}`);
	return res.Body.transformToByteArray();
}

async function download(key: string, dest: string) {
	const bytes = await downloadBytes(key);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, Buffer.from(bytes));
}

/** Every DATA_DIR-relative media path some row in the restored db points at. */
function readReferencedPaths(dbPath: string): Set<string> {
	const db = new Database(dbPath, { readonly: true });
	try {
		const paths = new Set<string>();
		const rows = db
			.prepare(
				`SELECT path_original AS p FROM photo
				 UNION ALL SELECT path_web FROM photo
				 UNION ALL SELECT path_thumb FROM photo
				 UNION ALL SELECT path_original FROM location_photo
				 UNION ALL SELECT path_web FROM location_photo
				 UNION ALL SELECT path_thumb FROM location_photo
				 UNION ALL SELECT path FROM document`,
			)
			.all() as { p: string }[];
		for (const row of rows) paths.add(row.p);
		return paths;
	} finally {
		db.close();
	}
}

async function listKeys(prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let token: string | undefined;
	do {
		const res = await client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				ContinuationToken: token,
			}),
		);
		for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
		token = res.IsTruncated ? res.NextContinuationToken : undefined;
	} while (token);
	return keys;
}

async function main() {
	fs.mkdirSync(dataDir, { recursive: true });

	// 1. Restore the database snapshot to the live db path; clear stale WAL files.
	// Validate the bytes first: the live db is only replaced by a real SQLite file.
	const dbPath = path.join(dataDir, "domiciledb.db");
	const snapshot = await downloadBytes(SNAPSHOT_KEY);
	if (!isSqliteDatabase(snapshot)) {
		console.error(
			`Object ${SNAPSHOT_KEY} is not a SQLite database; leaving ${dbPath} untouched.`,
		);
		process.exit(1);
	}
	fs.writeFileSync(dbPath, Buffer.from(snapshot));
	for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
		if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
	}
	console.log(`Restored database -> ${dbPath}`);

	// 2. Restore the media tree (keys are DATA_DIR-relative). The bucket is
	// append-only, so only bring back what the restored db still references.
	// S3 keys are attacker-influenced, so assert each stays inside DATA_DIR.
	const { restore, skipped } = referencedOnly(
		await listKeys("media/"),
		readReferencedPaths(dbPath),
	);
	let restored = 0;
	for (const key of restore) {
		const dest = resolveWithinDataDir(dataDir, key);
		if (!dest) {
			console.error(`Refusing key that escapes DATA_DIR: ${key}`);
			continue;
		}
		await download(key, dest);
		restored += 1;
	}
	console.log(
		`Restored ${restored} media files; skipped ${skipped.length} unreferenced object(s) left in the bucket.`,
	);
	console.log("Restore complete. Start the app to resume.");
}

main().catch((err) => {
	console.error("Restore failed:", err);
	process.exit(1);
});
