import fs from "node:fs";
import { Readable } from "node:stream";
import archiver from "archiver";

import { createSnapshot } from "@/lib/backup/snapshot";
import { config } from "@/lib/config";
import { getHouseholdId } from "@/lib/queries/household";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full export: a ZIP of a consistent db snapshot + all media (photos + docs). */
export async function GET() {
  const householdId = await getHouseholdId();
  if (householdId === null) {
    return new Response("No household set up", { status: 404 });
  }

  const snap = createSnapshot();
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.file(snap.path, { name: "domiciledb-snapshot.db" });
  if (fs.existsSync(config.paths.mediaDir)) {
    archive.directory(config.paths.mediaDir, "media");
  }
  void archive.finalize();

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
