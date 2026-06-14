"use client";

import { useActionState } from "react";

import { savePolicyAction, type PolicyFormState } from "@/lib/actions/policy";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

interface Initial {
  coverageB: number | null;
  coverageA: number | null;
  coverageC: number | null;
  deductible: number | null;
  policyNumber: string | null;
  insurer: string | null;
}

function MoneyField({
  label,
  name,
  defaultCents,
  hint,
}: {
  label: string;
  name: string;
  defaultCents: number | null;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-neutral-400">$</span>
        <input
          name={name}
          inputMode="decimal"
          defaultValue={dollars(defaultCents)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function PolicyForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<
    PolicyFormState,
    FormData
  >(savePolicyAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
        From your policy&apos;s declarations page. The one number that matters
        most is <strong>Coverage B – Personal Property</strong> — your total
        belongings limit. This is informational only; always verify with your
        insurer.
      </p>

      <MoneyField
        label="Coverage B — Personal Property"
        name="coverageB"
        defaultCents={initial.coverageB}
        hint="The cap on all your belongings. Drives your coverage status."
      />

      <details className="rounded-lg border border-neutral-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">
          Other coverages (optional, for reference)
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <MoneyField
            label="Coverage A — Dwelling"
            name="coverageA"
            defaultCents={initial.coverageA}
          />
          <MoneyField
            label="Coverage C — Loss of Use"
            name="coverageC"
            defaultCents={initial.coverageC}
          />
          <MoneyField
            label="Deductible"
            name="deductible"
            defaultCents={initial.deductible}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Insurer</span>
            <input
              name="insurer"
              defaultValue={initial.insurer ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Policy number</span>
            <input
              name="policyNumber"
              defaultValue={initial.policyNumber ?? ""}
              className={inputClass}
            />
          </label>
        </div>
      </details>

      {state?.error ? (
        <p className="text-coverage-over text-sm">{state.error}</p>
      ) : null}
      {state?.saved ? (
        <p className="text-coverage-within text-sm">Coverage saved ✓</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save coverage"}
      </button>
    </form>
  );
}
