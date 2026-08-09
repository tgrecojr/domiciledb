import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs";

import { sqlite } from "@/db";
import { config } from "@/lib/config";

/**
 * Produce a transactionally-consistent SQLite snapshot while the app keeps
 * serving. `VACUUM INTO` writes a clean, defragmented copy in one statement —
 * never copy the live db + -wal + -shm mid-write (that risks corruption).
 *
 * Concurrency: VACUUM INTO a UNIQUE temp path, then atomically rename it into
 * the canonical location. The old rm-then-VACUUM sequence left a window where
 * the canonical path was absent/partial, so a concurrent reader (e.g.
 * /api/export) could zip up a snapshot with no database. With an atomic rename
 * a reader always sees either the old or the new complete file.
 */
export function createSnapshot(): { path: string; bytes: number } {
  fs.mkdirSync(config.paths.backupDir, { recursive: true });
  const target = config.paths.backupSnapshot;
  // Unique per call so concurrent snapshots don't collide, and VACUUM INTO
  // (which requires a non-existent destination) always has a clean target.
  const tmp = `${target}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;

  // Flush WAL into the main db, then VACUUM INTO the temp file.
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  try {
    sqlite.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    // Atomic on the same filesystem: replaces target in one step, so a reader
    // never observes a missing/partial canonical snapshot.
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best-effort temp cleanup
    }
    throw err;
  }

  return { path: target, bytes: fs.statSync(target).size };
}
