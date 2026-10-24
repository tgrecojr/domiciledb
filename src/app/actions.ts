"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
	createHousehold,
	getHouseholdId,
	updateHousehold,
} from "@/lib/queries/household";

const householdSchema = z.object({
	name: z.string().trim().min(1, "Give your household a name"),
	description: z.string().trim().optional(),
	address: z.string().trim().optional(),
});

export type ActionState = { error?: string } | null;

// @spec HOUSEHOLD-HH-002, HOUSEHOLD-HH-003
export async function setupHouseholdAction(
	_prev: ActionState,
	formData: FormData,
): Promise<ActionState> {
	const parsed = householdSchema.safeParse({
		name: formData.get("name"),
		description: formData.get("description") || undefined,
		address: formData.get("address") || undefined,
	});

	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	// Single-household invariant: don't create a second one if setup already ran.
	if ((await getHouseholdId()) !== null) {
		return { error: "A household is already set up" };
	}

	await createHousehold(parsed.data);
	revalidatePath("/");
	return null;
}

export type HouseholdFormState = { error?: string; saved?: boolean } | null;

// @spec HOUSEHOLD-HH-006
export async function updateHouseholdAction(
	_prev: HouseholdFormState,
	formData: FormData,
): Promise<HouseholdFormState> {
	const householdId = await getHouseholdId();
	if (householdId === null) redirect("/");

	const parsed = householdSchema.safeParse({
		name: formData.get("name"),
		description: formData.get("description") || undefined,
		address: formData.get("address") || undefined,
	});
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	updateHousehold(householdId, parsed.data);
	revalidatePath("/");
	revalidatePath("/household");
	return { saved: true };
}
