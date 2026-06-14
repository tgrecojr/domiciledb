import path from "node:path";
import { defineConfig } from "drizzle-kit";

// Migrations are generated against the schema; the runtime db path comes from
// DATA_DIR (see src/lib/config.ts). drizzle-kit only needs a URL for `push`,
// which we don't use — migrations are applied via scripts/migrate.ts on boot.
const dbFile = process.env.DATA_DIR
  ? path.join(path.resolve(process.env.DATA_DIR), "domiciledb.db")
  : path.join(process.cwd(), "data", "domiciledb.db");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: dbFile },
  strict: true,
  verbose: true,
});
