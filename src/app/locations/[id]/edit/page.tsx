import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getHouseholdId } from "@/lib/queries/household";
import { listLocationPhotos } from "@/lib/queries/location-photos";
import { getLocation } from "@/lib/queries/locations";
import { mediaUrl } from "@/lib/media";
import { AddLocationPhotos } from "./add-location-photos";
import { LocationEditForm } from "./location-edit-form";
import { LocationPhotoGrid } from "./location-photo-grid";

export const dynamic = "force-dynamic";

export default async function LocationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const { id } = await params;
  const locationId = Number(id);
  if (!Number.isInteger(locationId)) notFound();

  const location = getLocation(locationId);
  if (!location || location.householdId !== householdId) notFound();

  const photos = listLocationPhotos(locationId);

  return (
    <AppShell
      title={`Edit ${location.name}`}
      back={{ href: "/locations", label: "Locations" }}
    >
      <div className="flex flex-col gap-6">
        <LocationEditForm
          location={{
            id: location.id,
            name: location.name,
            kind: location.kind,
            description: location.description,
          }}
        />

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Room photos</h2>
            <p className="text-xs text-neutral-500">
              Wider shots of the whole room or area. These appear in the proof
              packet ahead of the item close-ups to give context — they are not
              tied to any item.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LocationPhotoGrid
              locationId={locationId}
              photos={photos.map((p) => ({
                id: p.id,
                web: mediaUrl(p.pathWeb),
                original: mediaUrl(p.pathOriginal),
              }))}
            />
            <AddLocationPhotos locationId={locationId} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
