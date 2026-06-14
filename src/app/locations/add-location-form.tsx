"use client";

import { useActionState } from "react";

import {
  createLocationAction,
  type LocationFormState,
} from "@/lib/actions/locations";
import { LOCATION_KIND_LABELS } from "@/lib/location-kinds";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

export function AddLocationForm() {
  const [state, formAction, pending] = useActionState<
    LocationFormState,
    FormData
  >(createLocationAction, null);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex gap-2">
        <input
          name="name"
          placeholder="e.g. Master bedroom"
          required
          className={inputClass}
        />
        <select
          name="kind"
          defaultValue="room"
          className={`${inputClass} w-40`}
        >
          {Object.entries(LOCATION_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {state?.error ? (
        <p className="text-sm text-coverage-over">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add location"}
      </button>
    </form>
  );
}
