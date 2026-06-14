import "server-only";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db } from "./index";

/** Apply any pending migrations from ./drizzle. Idempotent. */
export function runMigrations() {
  migrate(db, { migrationsFolder: "drizzle" });
}
