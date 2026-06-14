import "server-only";

import cron from "node-cron";

import { config } from "@/lib/config";

/**
 * In-process scheduler started from instrumentation.ts. Jobs are wired in their
 * respective phases:
 *   - backup cadence (BACKUP_CRON)            — Phase 4
 *   - re-valuation staleness scan (daily)     — Phase 2
 *   - warranty-expiry scan (daily)            — Phase 2
 *
 * For now this only registers the schedules so the boot path is proven. A
 * module-level flag prevents double-registration under dev HMR.
 */

const globalForScheduler = globalThis as unknown as {
  __domicileSchedulerStarted?: boolean;
};

export function startScheduler() {
  if (globalForScheduler.__domicileSchedulerStarted) return;
  globalForScheduler.__domicileSchedulerStarted = true;

  if (config.backup.enabled && cron.validate(config.backup.cron)) {
    cron.schedule(config.backup.cron, () => {
      // Phase 4: run S3 backup (VACUUM INTO snapshot + media + latest PDF).
    });
  }

  // Phase 2: daily staleness + warranty-expiry reminder scans.
  // cron.schedule("0 2 * * *", () => { ... });
}
