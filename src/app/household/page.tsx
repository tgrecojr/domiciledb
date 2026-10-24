import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getHousehold } from "@/lib/queries/household";
import { HouseholdForm } from "./household-form";

export const dynamic = "force-dynamic";

// @spec HOUSEHOLD-HH-006
export default async function HouseholdPage() {
	const household = await getHousehold();
	if (!household) redirect("/");

	return (
		<AppShell title="Household" back={{ href: "/", label: "Home" }}>
			<div className="flex flex-col gap-4">
				<p className="text-sm text-neutral-600">
					The household name and address appear at the top of every proof
					packet.
				</p>
				<HouseholdForm
					initial={{
						name: household.name,
						address: household.address ?? "",
						description: household.description ?? "",
					}}
				/>
			</div>
		</AppShell>
	);
}
