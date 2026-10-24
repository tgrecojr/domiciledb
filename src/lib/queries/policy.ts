import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { policy, type VALUE_SOURCES } from "@/db/schema";

export type PolicySource = (typeof VALUE_SOURCES)[number];

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

// @spec COVERAGE-POLICY-001, COVERAGE-POLICY-002, COVERAGE-DECPAGE-007
/**
 * Single policy per household. Atomic upsert keyed on the household_id unique
 * constraint — a real INSERT ... ON CONFLICT DO UPDATE, so a concurrent save
 * can't slip between a check and an insert and create a duplicate row.
 * `source` records whether the figures were typed by the user or applied from
 * an AI declarations-page parse; it is overwritten on every save.
 */
export function upsertPolicy(
	householdId: number,
	input: PolicyInput,
	source: PolicySource = "user",
) {
	const values = {
		householdId,
		coverageBPersonalProperty: input.coverageBPersonalProperty,
		coverageADwelling: input.coverageADwelling ?? null,
		coverageCLossOfUse: input.coverageCLossOfUse ?? null,
		deductible: input.deductible ?? null,
		policyNumber: input.policyNumber ?? null,
		insurer: input.insurer ?? null,
		source,
		updatedAt: new Date().toISOString(),
	};

	db.insert(policy)
		.values(values)
		.onConflictDoUpdate({
			target: policy.householdId,
			set: {
				coverageBPersonalProperty: values.coverageBPersonalProperty,
				coverageADwelling: values.coverageADwelling,
				coverageCLossOfUse: values.coverageCLossOfUse,
				deductible: values.deductible,
				policyNumber: values.policyNumber,
				insurer: values.insurer,
				source: values.source,
				updatedAt: values.updatedAt,
			},
		})
		.run();
}
