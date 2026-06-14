import "server-only";

import { db } from "./index";
import { category } from "./schema";

/**
 * Default categories. Insurance policies think in categories (feature-spec §5,
 * §7), so we seed a sensible starter set. The user can add more later. Firearms,
 * jewelry, and art are included because they map to common policy sub-limits.
 */
const DEFAULT_CATEGORIES = [
  "Electronics",
  "Appliances",
  "Furniture",
  "Jewelry",
  "Art",
  "Firearms",
  "Tools",
  "Kitchenware",
  "Clothing",
  "Sporting Goods",
  "Musical Instruments",
  "Collectibles",
  "Books & Media",
  "Outdoor & Garden",
  "Other",
];

/** Idempotent: insert defaults only if the category table is empty. */
export function seedCategories() {
  const existing = db.select({ id: category.id }).from(category).limit(1).all();
  if (existing.length > 0) return;

  db.insert(category)
    .values(DEFAULT_CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing()
    .run();
}
