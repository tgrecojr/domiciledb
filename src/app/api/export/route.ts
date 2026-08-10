import fs from "node:fs";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";

import { createSnapshot } from "@/lib/backup/snapshot";
import { config } from "@/lib/config";
import { getHouseholdId } from "@/lib/queries/household";
import { createSingleFlightGate } from "@/lib/single-flight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Level 9 buys little on already-compressed media (webp/jpeg/pdf) and costs a
// lot of CPU per request; 6 is zlib's default trade-off.
const ZIP_LEVEL = 6;

// Module-level so every request in this process shares one claim: an export is
// a full VACUUM plus a zip of the whole db + media tree, and the app has no
// auth in front of it.
const exportGate = createSingleFlightGate(config.export.minIntervalMs);

function tooMany(retryAfterSec: number) {
	return new Response("An export is already running or ran very recently.", {
		status: 429,
		headers: {
			"Retry-After": String(retryAfterSec),
			"Cache-Control": "no-store",
		},
	});
}

/** Full export: a ZIP of a consistent db snapshot + all media (photos + docs). */
export async function GET() {
	// Claim before the first await, or concurrent requests both pass the check.
	const admission = exportGate.tryEnter();
	if (!admission.ok) return tooMany(admission.retryAfterSec);

	let householdId: number | null;
	try {
		householdId = await getHouseholdId();
	} catch (err) {
		exportGate.release(false);
		throw err;
	}
	if (householdId === null) {
		exportGate.release(false);
		return new Response("No household set up", { status: 404 });
	}

	let archive: ZipArchive;
	try {
		const snap = createSnapshot();
		// archiver v8 removed the factory function; use the ZipArchive class.
		archive = new ZipArchive({ zlib: { level: ZIP_LEVEL } });
		archive.file(snap.path, { name: "domiciledb-snapshot.db" });
		if (fs.existsSync(config.paths.mediaDir)) {
			archive.directory(config.paths.mediaDir, "media");
		}
		void archive.finalize();
	} catch (err) {
		exportGate.release();
		throw err;
	}

	// Hold the claim until the response body is fully drained (or aborted), so a
	// second export can't start while this one is still streaming.
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		exportGate.release();
	};
	archive.once("end", release);
	archive.once("close", release);
	archive.once("error", release);

	const date = new Date().toISOString().slice(0, 10);
	const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

	return new Response(webStream, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="domiciledb-export-${date}.zip"`,
			"Cache-Control": "no-store",
		},
	});
}
