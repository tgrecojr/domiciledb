import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { item } from "@/db/schema";
import { config } from "@/lib/config";
import { computeCoverage, type CoverageResult } from "@/lib/coverage";
import { getPolicy } from "./policy";

export interface CoverageSummary extends CoverageResult {
  hasPolicy: boolean;
  warnPct: number;
}

/** Live coverage status for the household dashboard + contextual alerts. */
export function getCoverageSummary(householdId: number): CoverageSummary {
  const policy = getPolicy(householdId);

  const items = db
    .select({
      replacementCostCents: item.currentReplacementCost,
      quantity: item.quantity,
      lifecycleStatus: item.lifecycleStatus,
    })
    .from(item)
    .where(eq(item.householdId, householdId))
    .all();

  const result = computeCoverage({
    items,
    coverageBLimitCents: policy?.coverageBPersonalProperty ?? null,
    warnPct: config.coverage.warnPct,
  });

  return {
    ...result,
    hasPolicy: policy !== null,
    warnPct: config.coverage.warnPct,
  };
}
