-- VULN-022: enforce one policy per household. Existing databases may already
-- hold duplicate policy rows (the old non-atomic upsert could create them), and
-- CREATE UNIQUE INDEX would fail on those. Collapse duplicates first, keeping
-- the highest-id (most recently inserted) row per household.
DELETE FROM `policy` WHERE `id` NOT IN (
  SELECT MAX(`id`) FROM `policy` GROUP BY `household_id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_household_id_unique` ON `policy` (`household_id`);