"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseDollarsToCents } from "@/lib/money";
import { getHouseholdId } from "@/lib/queries/household";
import { upsertPolicy } from "@/lib/queries/policy";

export type PolicyFormState = { error?: string; saved?: boolean } | null;

function dollarsOrNull(formData: FormData, key: string): number | null {
  return parseDollarsToCents(String(formData.get(key) ?? ""));
}

function textOrNull(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v.length > 0 ? v : null;
}

export async function savePolicyAction(
  _prev: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const coverageB = dollarsOrNull(formData, "coverageB");
  const rawCoverageB = String(formData.get("coverageB") ?? "").trim();
  if (rawCoverageB.length > 0 && coverageB === null) {
    return { error: "Enter Coverage B as a dollar amount, e.g. 456,750" };
  }

  upsertPolicy(householdId!, {
    coverageBPersonalProperty: coverageB,
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
