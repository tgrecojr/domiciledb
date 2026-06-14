"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createHousehold } from "@/lib/queries/household";

const householdSchema = z.object({
  name: z.string().trim().min(1, "Give your household a name"),
  description: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export type ActionState = { error?: string } | null;

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

  await createHousehold(parsed.data);
  revalidatePath("/");
  return null;
}
