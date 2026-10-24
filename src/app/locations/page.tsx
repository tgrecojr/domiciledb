import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LOCATION_KIND_LABELS } from "@/lib/location-kinds";
import { getHouseholdId } from "@/lib/queries/household";
import { locationPhotoCounts } from "@/lib/queries/location-photos";
import { listLocations, locationItemCounts } from "@/lib/queries/locations";
import { AddLocationForm } from "./add-location-form";
import { DeleteLocation } from "./delete-location";

export const dynamic = "force-dynamic";

// @spec HOUSEHOLD-LOC-002, HOUSEHOLD-LOC-006
export default async function LocationsPage() {
	const householdId = await getHouseholdId();
	if (householdId === null) redirect("/");

	const locations = listLocations(householdId);
	const counts = locationItemCounts(householdId);
	const photoCounts = locationPhotoCounts(locations.map((l) => l.id));

	return (
		<AppShell title="Locations" back={{ href: "/", label: "Home" }}>
			<div className="flex flex-col gap-6">
				<AddLocationForm />

				{locations.length === 0 ? (
					<p className="text-sm text-neutral-500">
						No locations yet. Add the rooms and places where your belongings
						live — you can assign items to them as you capture.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{locations.map((l) => (
							<li
								key={l.id}
								className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3"
							>
								<div className="flex items-center justify-between">
									<div className="flex flex-col">
										<span className="font-medium">{l.name}</span>
										<span className="text-xs text-neutral-500">
											{LOCATION_KIND_LABELS[l.kind]} · {counts.get(l.id) ?? 0}{" "}
											items · {photoCounts.get(l.id) ?? 0} photos
										</span>
									</div>
									<Link
										href={`/locations/${l.id}/edit`}
										className="text-sm text-neutral-600 hover:text-neutral-900"
									>
										Edit
									</Link>
								</div>
								<DeleteLocation
									locationId={l.id}
									name={l.name}
									itemCount={counts.get(l.id) ?? 0}
								/>
							</li>
						))}
					</ul>
				)}
			</div>
		</AppShell>
	);
}
