import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { category } from "@/db/schema";

export function listCategories() {
  return db.select().from(category).orderBy(asc(category.name)).all();
}

/** Return the id of a category by name (case-insensitive), creating it if new. */
export function findOrCreateCategory(name: string): number {
  const trimmed = name.trim();
  const existing = db
    .select({ id: category.id })
    .from(category)
    .where(eq(category.name, trimmed))
    .get();
  if (existing) return existing.id;

  // Case-insensitive match against existing names before inserting.
  const all = db.select().from(category).all();
  const ci = all.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (ci) return ci.id;

  return db.insert(category).values({ name: trimmed }).returning().all()[0]!.id;
}
