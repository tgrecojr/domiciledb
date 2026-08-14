import "server-only";

import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { config } from "@/lib/config";
import * as schema from "./schema";

/**
 * Single shared better-sqlite3 connection (WAL mode), opened from DATA_DIR.
 * Cached on globalThis so Next's dev HMR doesn't open a new handle per reload.
 */

function ensureDataDirs() {
	for (const dir of [
		config.paths.dataDir,
		config.paths.backupDir,
		config.paths.mediaDir,
	]) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function createConnection() {
	// During `next build`, page-data collection imports this module from several
	// parallel workers. A fresh DB file's WAL conversion can throw SQLITE_BUSY
	// under that race, and the build DB is throwaway anyway (migrations are
	// skipped in this phase too — see instrumentation.ts), so give each build
	// worker a private in-memory DB instead of touching the real file.
	if (process.env.NEXT_PHASE === "phase-production-build") {
		return new Database(":memory:");
	}
	ensureDataDirs();
	const sqlite = new Database(config.paths.dbFile);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	sqlite.pragma("busy_timeout = 5000");
	return sqlite;
}

const globalForDb = globalThis as unknown as {
	__domicileSqlite?: Database.Database;
};

if (!globalForDb.__domicileSqlite) {
	globalForDb.__domicileSqlite = createConnection();
}

export const sqlite = globalForDb.__domicileSqlite;

export const db = drizzle(sqlite, { schema });

export { schema };
