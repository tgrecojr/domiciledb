"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseDollarsToCents } from "@/lib/money";
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

export async function applyDecPagePolicy(
  fields: DecPageFields,
): Promise<{ ok: boolean }> {
  const householdId = await getHouseholdId();
  if (householdId === null) return { ok: false };
  const existing = getPolicy(householdId);
  const dollars = (v?: string) => parseDollarsToCents(v ?? "");
  const text = (v?: string) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };

  upsertPolicy(householdId, {
    coverageBPersonalProperty:
      dollars(fields.coverageB) ?? existing?.coverageBPersonalProperty ?? null,
    coverageADwelling:
      dollars(fields.coverageA) ?? existing?.coverageADwelling ?? null,
    coverageCLossOfUse:
      dollars(fields.coverageC) ?? existing?.coverageCLossOfUse ?? null,
    deductible: dollars(fields.deductible) ?? existing?.deductible ?? null,
    policyNumber: text(fields.policyNumber) ?? existing?.policyNumber ?? null,
    insurer: text(fields.insurer) ?? existing?.insurer ?? null,
  });

  revalidatePath("/");
  revalidatePath("/policy");
  return { ok: true };
}
