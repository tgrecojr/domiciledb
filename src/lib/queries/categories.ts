import "server-only";

import { asc, sql } from "drizzle-orm";

import { db } from "@/db";
import { category } from "@/db/schema";
import { config } from "@/lib/config";

export function listCategories() {
	return db.select().from(category).orderBy(asc(category.name)).all();
}

/**
 * Return the id of a category by name (case-insensitive), creating it if new.
 * Returns null when the distinct-category ceiling is reached: AI suggestions
 * feed this with free-form text, so unbounded creation would let one caller
 * grow the table — and the cost of every lookup over it — without limit.
 */
export function findOrCreateCategory(name: string): number | null {
	const trimmed = name.trim();
	if (trimmed.length === 0) return null;

	// Case-insensitive match pushed into SQL — never materialise the whole
	// table in JS the way the previous fallback did. No supporting index is
	// needed: config.categories.max caps the table, so this scans at most a
	// few hundred rows.
	const existing = db
		.select({ id: category.id })
		.from(category)
		.where(sql`${category.name} = ${trimmed} COLLATE NOCASE`)
		.limit(1)
		.get();
	if (existing) return existing.id;

	const total = db.select({ n: sql<number>`count(*)` }).from(category).get();
	if ((total?.n ?? 0) >= config.categories.max) {
		console.warn(
			`[categories] refused to create "${trimmed}": at the ${config.categories.max}-category ceiling`,
		);
		return null;
	}

	return db.insert(category).values({ name: trimmed }).returning().all()[0]!.id;
}
