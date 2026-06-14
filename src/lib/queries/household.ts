import "server-only";

import { db } from "@/db";
import { household } from "@/db/schema";

/** The v1 app manages a single household; return it if set up, else null. */
export async function getHousehold() {
  const rows = db.select().from(household).limit(1).all();
  return rows[0] ?? null;
}

export async function createHousehold(input: {
  name: string;
  description?: string;
  address?: string;
}) {
  const rows = db
    .insert(household)
    .values({
      name: input.name,
      description: input.description || null,
      address: input.address || null,
    })
    .returning()
    .all();
  return rows[0]!;
}
