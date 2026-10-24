"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseDollarsToCents } from "@/lib/money";
import { parseId } from "@/lib/parse-id";
import { getInteraction, setOutcome } from "@/lib/queries/ai";
import { getHouseholdId } from "@/lib/queries/household";
import { getPolicy, upsertPolicy } from "@/lib/queries/policy";

export type PolicyFormState = { error?: string; saved?: boolean } | null;

function dollarsOrNull(formData: FormData, key: string): number | null {
	return parseDollarsToCents(String(formData.get(key) ?? ""));
}

function textOrNull(formData: FormData, key: string): string | null {
	const v = String(formData.get(key) ?? "").trim();
	return v.length > 0 ? v : null;
}

/** Every amount the form takes; a non-empty value that is not a dollar amount
 * is an error, never a silent null — a typo must not erase a stored figure. */
const AMOUNT_FIELDS = [
	["coverageB", "Enter Coverage B as a dollar amount, e.g. 456,750"],
	["coverageA", "Enter Coverage A as a dollar amount"],
	["coverageC", "Enter Coverage C as a dollar amount"],
	["deductible", "Enter the deductible as a dollar amount"],
] as const;

function firstAmountError(formData: FormData): string | null {
	for (const [key, message] of AMOUNT_FIELDS) {
		const raw = String(formData.get(key) ?? "").trim();
		if (raw.length > 0 && parseDollarsToCents(raw) === null) return message;
	}
	return null;
}

// @spec COVERAGE-POLICY-004, COVERAGE-POLICY-005, COVERAGE-POLICY-006
export async function savePolicyAction(
	_prev: PolicyFormState,
	formData: FormData,
): Promise<PolicyFormState> {
	const householdId = await getHouseholdId();
	if (householdId === null) redirect("/");

	const amountError = firstAmountError(formData);
	if (amountError) return { error: amountError };

	upsertPolicy(householdId!, {
		coverageBPersonalProperty: dollarsOrNull(formData, "coverageB"),
		coverageADwelling: dollarsOrNull(formData, "coverageA"),
		coverageCLossOfUse: dollarsOrNull(formData, "coverageC"),
		deductible: dollarsOrNull(formData, "deductible"),
		policyNumber: textOrNull(formData, "policyNumber"),
		insurer: textOrNull(formData, "insurer"),
	});

	revalidatePath("/");
	revalidatePath("/policy");
	return { saved: true };
}

/**
 * Save the user-reviewed result of AI dec-page parsing. A plain form action
 * (the dec-page panel's confirm step), preserving any existing fields the parse
 * didn't fill.
 */
export interface DecPageFields {
	coverageB?: string;
	coverageA?: string;
	coverageC?: string;
	deductible?: string;
	insurer?: string;
	policyNumber?: string;
}

/**
 * A dec-page parse is logged with no item. Resolve the id the panel sent to a
 * real dec-page interaction, or null when it is malformed, missing, or belongs
 * to an item (so an outcome can never be written against the wrong row).
 */
// @spec COVERAGE-DECPAGE-007
function decPageInteraction(interactionId: unknown): number | null {
	const id = parseId(String(interactionId));
	if (id === null) return null;
	const row = getInteraction(id);
	return row !== null && row.itemId === null ? id : null;
}

/**
 * `edited` is the panel's report of whether any field differs from what the
 * model returned; it decides the audit outcome. The policy itself is saved
 * with source `ai` either way.
 */
// @spec COVERAGE-DECPAGE-006, COVERAGE-DECPAGE-007
export async function applyDecPagePolicy(
	fields: DecPageFields,
	interactionId: number | null,
	edited: boolean,
): Promise<{ ok: boolean }> {
	const householdId = await getHouseholdId();
	if (householdId === null) return { ok: false };
	const outcomeId =
		interactionId === null ? null : decPageInteraction(interactionId);
	if (interactionId !== null && outcomeId === null) return { ok: false };
	const existing = getPolicy(householdId);
	const dollars = (v?: string) => parseDollarsToCents(v ?? "");
	const text = (v?: string) => {
		const t = (v ?? "").trim();
		return t.length > 0 ? t : null;
	};

	upsertPolicy(
		householdId,
		{
			coverageBPersonalProperty:
				dollars(fields.coverageB) ??
				existing?.coverageBPersonalProperty ??
				null,
			coverageADwelling:
				dollars(fields.coverageA) ?? existing?.coverageADwelling ?? null,
			coverageCLossOfUse:
				dollars(fields.coverageC) ?? existing?.coverageCLossOfUse ?? null,
			deductible: dollars(fields.deductible) ?? existing?.deductible ?? null,
			policyNumber: text(fields.policyNumber) ?? existing?.policyNumber ?? null,
			insurer: text(fields.insurer) ?? existing?.insurer ?? null,
		},
		"ai",
	);
	if (outcomeId !== null) setOutcome(outcomeId, edited ? "edited" : "accepted");

	revalidatePath("/");
	revalidatePath("/policy");
	return { ok: true };
}

/** The user walked away from a dec-page parse without applying it. */
// @spec COVERAGE-DECPAGE-007
export async function discardDecPage(
	interactionId: number,
): Promise<{ ok: boolean }> {
	const id = decPageInteraction(interactionId);
	if (id === null) return { ok: false };
	setOutcome(id, "rejected");
	return { ok: true };
}
