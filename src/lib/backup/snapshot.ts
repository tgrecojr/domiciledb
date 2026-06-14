import "server-only";

import fs from "node:fs";

import { sqlite } from "@/db";
import { config } from "@/lib/config";

/**
 * Produce a transactionally-consistent SQLite snapshot while the app keeps
 * serving. `VACUUM INTO` writes a clean, defragmented copy in one statement —
 * never copy the live db + -wal + -shm mid-write (that risks corruption).
 */
export function createSnapshot(): { path: string; bytes: number } {
  fs.mkdirSync(config.paths.backupDir, { recursive: true });
  const target = config.paths.backupSnapshot;

  // Flush WAL into the main db, then VACUUM INTO a fresh file.
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  if (fs.existsSync(target)) fs.rmSync(target);
  sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  return { path: target, bytes: fs.statSync(target).size };
}
