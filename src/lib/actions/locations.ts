"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LOCATION_KINDS } from "@/db/schema";
import { getHouseholdId } from "@/lib/queries/household";
import { createLocation, deleteLocation } from "@/lib/queries/locations";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(LOCATION_KINDS),
});

export type LocationFormState = { error?: string } | null;

export async function createLocationAction(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const parsed = schema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  createLocation(householdId!, parsed.data.name, parsed.data.kind);
  revalidatePath("/locations");
  return null;
}

export async function deleteLocationAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) {
    deleteLocation(id);
    revalidatePath("/locations");
  }
  redirect("/locations");
}
