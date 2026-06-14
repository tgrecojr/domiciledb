import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { policy } from "@/db/schema";

export interface PolicyInput {
  coverageBPersonalProperty: number | null;
  coverageADwelling?: number | null;
  coverageCLossOfUse?: number | null;
  deductible?: number | null;
  policyNumber?: string | null;
  insurer?: string | null;
}

export function getPolicy(householdId: number) {
  return (
    db.select().from(policy).where(eq(policy.householdId, householdId)).get() ??
    null
  );
}

/** Single policy per household: update in place if present, else insert. */
export function upsertPolicy(householdId: number, input: PolicyInput) {
  const existing = getPolicy(householdId);
  const values = {
    householdId,
    coverageBPersonalProperty: input.coverageBPersonalProperty,
    coverageADwelling: input.coverageADwelling ?? null,
    coverageCLossOfUse: input.coverageCLossOfUse ?? null,
    deductible: input.deductible ?? null,
    policyNumber: input.policyNumber ?? null,
    insurer: input.insurer ?? null,
    source: "user" as const,
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    db.update(policy).set(values).where(eq(policy.id, existing.id)).run();
  } else {
    db.insert(policy).values(values).run();
  }
}
