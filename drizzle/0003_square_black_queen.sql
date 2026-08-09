ALTER TABLE `household` ADD `singleton` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- VULN-020: enforce the single-household invariant. A pre-existing database
-- could already hold more than one household (the old setup inserted
-- unconditionally), which would make the unique index below fail. Collapse to
-- the first household (lowest id — the one getHouseholdId already treats as
-- "the" household); its dependent rows cascade with the removed extras.
DELETE FROM `household` WHERE `id` NOT IN (SELECT MIN(`id`) FROM `household`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_singleton_unique` ON `household` (`singleton`);