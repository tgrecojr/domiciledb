"use client";

import { useActionState } from "react";

import {
  updateLocationAction,
  type LocationFormState,
} from "@/lib/actions/locations";
import { LOCATION_KIND_LABELS, type LocationKind } from "@/lib/location-kinds";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

export function LocationEditForm({
  location,
}: {
  location: {
    id: number;
    name: string;
    kind: LocationKind;
    description: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<
    LocationFormState,
    FormData
  >(updateLocationAction, null);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <input type="hidden" name="id" value={location.id} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">Name</span>
        <input
          name="name"
          defaultValue={location.name}
          required
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">Kind</span>
        <select
          name="kind"
          defaultValue={location.kind}
          className={inputClass}
        >
          {Object.entries(LOCATION_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">Description</span>
        <textarea
          name="description"
          defaultValue={location.description ?? ""}
          rows={3}
          placeholder="Optional — a note about this room or area"
          className={inputClass}
        />
      </label>
      {state?.error ? (
        <p className="text-coverage-over text-sm">{state.error}</p>
      ) : null}
      {state?.saved ? (
        <p className="text-sm text-emerald-600">Saved.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
