import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Operator configuration fails fast: a malformed value stops the config module
 * from loading at all, so the server never serves with a bad schedule.
 */
describe("config validates BACKUP_CRON at startup", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	// @spec RESILIENCE-BACKUP-003, PLATFORM-CONFIG-001
	it("refuses to load when BACKUP_CRON is not a cron expression", async () => {
		vi.resetModules();
		vi.stubEnv("BACKUP_CRON", "every night at three");
		await expect(import("@/lib/config")).rejects.toThrow(/BACKUP_CRON/);
	});

	// @spec RESILIENCE-BACKUP-002
	it("accepts a valid five-field expression", async () => {
		vi.resetModules();
		vi.stubEnv("BACKUP_CRON", "*/15 * * * *");
		const { config } = await import("@/lib/config");
		expect(config.backup.cron).toBe("*/15 * * * *");
	});
});
