import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/db";
import { category } from "@/db/schema";

export function listCategories() {
  return db.select().from(category).orderBy(asc(category.name)).all();
}
