"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LOCATION_KINDS } from "@/db/schema";
import {
  deleteLocationMedia,
  deleteStoredImageFiles,
  processAndStoreLocationImage,
} from "@/lib/media";
import { getHouseholdId } from "@/lib/queries/household";
import {
  addLocationPhoto,
  deleteLocationPhoto,
  getLocationPhoto,
} from "@/lib/queries/location-photos";
import {
  createLocation,
  deleteLocation,
  getLocation,
  updateLocation,
} from "@/lib/queries/locations";
import { storePhotoFiles } from "./store-photos";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(LOCATION_KINDS),
});

const editSchema = schema.extend({
  description: z.string().trim().optional(),
});

export type LocationFormState = { error?: string; saved?: boolean } | null;

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
  const householdId = await getHouseholdId();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) {
    const existing = getLocation(id);
    if (existing && existing.householdId === householdId) {
      deleteLocation(id);
      await deleteLocationMedia(id);
      revalidatePath("/locations");
    }
  }
  redirect("/locations");
}

/** Edit a location's name / kind / description. */
export async function updateLocationAction(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const id = Number(formData.get("id"));
  const existing = Number.isInteger(id) ? getLocation(id) : null;
  if (!existing || existing.householdId !== householdId) {
    return { error: "Unknown location" };
  }

  const parsed = editSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  updateLocation(id, {
    name: parsed.data.name,
    kind: parsed.data.kind,
    description:
      parsed.data.description && parsed.data.description.length > 0
        ? parsed.data.description
        : null,
  });
  revalidatePath("/locations");
  revalidatePath(`/locations/${id}/edit`);
  return { saved: true };
}

/** Upload one or more wider room/area photos to a location. */
export async function addLocationPhotosAction(formData: FormData) {
  const householdId = await getHouseholdId();
  const id = Number(formData.get("locationId"));
  const existing = Number.isInteger(id) ? getLocation(id) : null;
  if (!existing || existing.householdId !== householdId) redirect("/locations");

  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  await storePhotoFiles(files, `location ${id}`, async (buffer, mime) => {
    const image = await processAndStoreLocationImage(id, buffer, mime);
    addLocationPhoto(id, image);
  });

  revalidatePath(`/locations/${id}/edit`);
  redirect(`/locations/${id}/edit`);
}

/** Remove a single location photo (row + its on-disk variant files). */
export async function deleteLocationPhotoAction(formData: FormData) {
  const householdId = await getHouseholdId();
  const photoId = Number(formData.get("photoId"));
  const locationId = Number(formData.get("locationId"));
  if (!Number.isInteger(photoId) || !Number.isInteger(locationId)) {
    redirect("/locations");
  }

  const existing = getLocation(locationId);
  const ph = getLocationPhoto(photoId);
  if (
    existing &&
    existing.householdId === householdId &&
    ph &&
    ph.locationId === locationId
  ) {
    deleteLocationPhoto(photoId);
    await deleteStoredImageFiles([
      ph.pathOriginal,
      ph.pathWeb,
      ph.pathThumb,
    ]);
  }
  revalidatePath(`/locations/${locationId}/edit`);
  redirect(`/locations/${locationId}/edit`);
}
