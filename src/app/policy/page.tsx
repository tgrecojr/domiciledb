import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getHouseholdId } from "@/lib/queries/household";
import { getPolicy } from "@/lib/queries/policy";
import { PolicyForm } from "./policy-form";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const policy = getPolicy(householdId);

  return (
    <AppShell title="Insurance coverage" back={{ href: "/", label: "Home" }}>
      <PolicyForm
        initial={{
          coverageB: policy?.coverageBPersonalProperty ?? null,
          coverageA: policy?.coverageADwelling ?? null,
          coverageC: policy?.coverageCLossOfUse ?? null,
          deductible: policy?.deductible ?? null,
          policyNumber: policy?.policyNumber ?? null,
          insurer: policy?.insurer ?? null,
        }}
      />
    </AppShell>
  );
}
