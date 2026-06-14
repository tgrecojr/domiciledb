"use client";

import { useActionState } from "react";

import { updateItemAction, type ItemFormState } from "@/lib/actions/items";
import { LIFECYCLE_LABELS, LIFECYCLE_STATUSES } from "@/lib/lifecycle";
import { formatCentsWhole } from "@/lib/money";

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
  lifecycleStatus: string;
  lifecycleDate: string | null;
  replacementCostCents: number | null;
  pricePaidCents: number | null;
  purchaseDate: string | null;
}

function dollars(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
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

function CoverageAlertBanner({
  alert,
}: {
  alert: NonNullable<NonNullable<ItemFormState>["coverageAlert"]>;
}) {
  const over = alert.level === "over";
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        over
          ? "border-coverage-over/40 bg-coverage-over/10 text-coverage-over"
          : "border-coverage-approaching/40 bg-coverage-approaching/10 text-coverage-approaching"
      }`}
    >
      {over ? (
        <p>
          You&apos;ve now inventoried {formatCentsWhole(alert.totalCents)}{" "}
          against a {formatCentsWhole(alert.limitCents)} limit — you appear{" "}
          <strong>underinsured</strong>. Consider reviewing coverage with your
          insurer.
        </p>
      ) : (
        <p>
          You&apos;re approaching your Coverage B limit (
          {Math.round(alert.pctUsed * 100)}% of{" "}
          {formatCentsWhole(alert.limitCents)}). Worth a look before it&apos;s a
          gap.
        </p>
      )}
    </div>
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

      {/* Valuation — replacement cost drives the coverage total. */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-semibold">Value</legend>
        <MoneyField
          label="Replacement cost (per item, today)"
          name="replacementCost"
          defaultCents={item.replacementCostCents}
          hint="What it costs to buy new now. Counts toward your coverage total (× quantity)."
        />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField
            label="Price paid"
            name="pricePaid"
            defaultCents={item.pricePaidCents}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Purchase date</span>
            <input
              name="purchaseDate"
              type="date"
              defaultValue={item.purchaseDate?.slice(0, 10) ?? ""}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {/* Lifecycle — non-active items drop out of the coverage total. */}
      <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-semibold">Status</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lifecycle</span>
            <select
              name="lifecycleStatus"
              defaultValue={item.lifecycleStatus}
              className={inputClass}
            >
              {LIFECYCLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LIFECYCLE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Date (if not active)</span>
            <input
              name="lifecycleDate"
              type="date"
              defaultValue={item.lifecycleDate?.slice(0, 10) ?? ""}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={item.description ?? ""}
          className={inputClass}
        />
      </label>

      {state?.coverageAlert ? (
        <CoverageAlertBanner alert={state.coverageAlert} />
      ) : null}
      {state?.error ? (
        <p className="text-sm text-coverage-over">{state.error}</p>
      ) : null}
      {state?.saved && !state.coverageAlert ? (
        <p className="text-sm text-coverage-within">Saved ✓</p>
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
