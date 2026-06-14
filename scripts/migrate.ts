/**
 * Standalone migration runner for CLI/CI (`npm run db:migrate`).
 *
 * Self-contained (no `@/` path aliases) so it runs under plain tsx without a
 * path-resolver. On app boot, migrations run instead via instrumentation.ts.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");

fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "domiciledb.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "drizzle" });
sqlite.close();

console.log(`Migrations applied. Database at ${dataDir}/domiciledb.db`);
