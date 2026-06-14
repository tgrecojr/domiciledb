"use client";

import { useActionState } from "react";

import { updateItemAction, type ItemFormState } from "@/lib/actions/items";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

export interface ItemEditValues {
  id: number;
  title: string;
  description: string | null;
  categoryId: number | null;
  locationId: number | null;
  manufacturer: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  quantity: number;
  condition: string | null;
  ageEstimate: string | null;
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

export function ItemEditForm({
  item,
  categories,
  locations,
}: {
  item: ItemEditValues;
  categories: { id: number; name: string }[];
  locations: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(
    updateItemAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="itemId" value={item.id} />

      <Field label="Title" name="title" defaultValue={item.title} />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Category</span>
          <select
            name="categoryId"
            defaultValue={item.categoryId ?? ""}
            className={inputClass}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Location</span>
          <select
            name="locationId"
            defaultValue={item.locationId ?? ""}
            className={inputClass}
          >
            <option value="">— Unassigned —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field
        label="Manufacturer"
        name="manufacturer"
        defaultValue={item.manufacturer}
        placeholder="e.g. Sony"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Model number"
          name="modelNumber"
          defaultValue={item.modelNumber}
        />
        <Field
          label="Serial number"
          name="serialNumber"
          defaultValue={item.serialNumber}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Quantity</span>
          <input
            name="quantity"
            type="number"
            min={1}
            defaultValue={item.quantity}
            className={inputClass}
          />
        </label>
        <Field
          label="Condition"
          name="condition"
          defaultValue={item.condition}
          placeholder="e.g. Good"
        />
        <Field
          label="Age"
          name="ageEstimate"
          defaultValue={item.ageEstimate}
          placeholder="e.g. ~3 yrs"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={item.description ?? ""}
          className={inputClass}
        />
      </label>

      {state?.error ? (
        <p className="text-sm text-coverage-over">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2.5 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
