/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * We use it to apply migrations before serving and to start the in-process
 * scheduler. Guarded to the Node runtime (never the edge runtime).
 *
 * NOTE: with a `src/` directory, Next requires this file at `src/instrumentation.ts`
 * (a root-level instrumentation.ts is ignored).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrations } = await import("@/db/migrate");
  runMigrations();

  const { seedCategories } = await import("@/db/seed");
  seedCategories();

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
