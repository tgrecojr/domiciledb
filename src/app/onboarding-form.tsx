"use client";

import { useActionState } from "react";

import { setupHouseholdAction, type ActionState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setupHouseholdAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Household name</span>
        <input
          name="name"
          required
          autoFocus
          placeholder="e.g. The Greco residence"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Address (optional)</span>
        <input
          name="address"
          placeholder="123 Main St, Anytown"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description (optional)</span>
        <textarea name="description" rows={2} className={inputClass} />
      </label>

      {state?.error ? (
        <p className="text-sm text-coverage-over">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Create household"}
      </button>
    </form>
  );
}
