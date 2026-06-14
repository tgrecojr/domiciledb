"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { updateItemAction, type ItemFormState } from "@/lib/actions/items";
import { LIFECYCLE_LABELS, LIFECYCLE_STATUSES } from "@/lib/lifecycle";
import { formatCentsWhole } from "@/lib/money";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

const SAVE_DEBOUNCE_MS = 800;

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

type Fields = {
  title: string;
  description: string;
  categoryId: string;
  locationId: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  quantity: string;
  condition: string;
  ageEstimate: string;
  lifecycleStatus: string;
  lifecycleDate: string;
  replacementCost: string;
  pricePaid: string;
  purchaseDate: string;
};

const dollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
const idStr = (n: number | null) => (n == null ? "" : String(n));
const day = (iso: string | null) => iso?.slice(0, 10) ?? "";

function initial(item: ItemEditValues): Fields {
  return {
    title: item.title,
    description: item.description ?? "",
    categoryId: idStr(item.categoryId),
    locationId: idStr(item.locationId),
    manufacturer: item.manufacturer ?? "",
    modelNumber: item.modelNumber ?? "",
    serialNumber: item.serialNumber ?? "",
    quantity: String(item.quantity),
    condition: item.condition ?? "",
    ageEstimate: item.ageEstimate ?? "",
    lifecycleStatus: item.lifecycleStatus,
    lifecycleDate: day(item.lifecycleDate),
    replacementCost: dollars(item.replacementCostCents),
    pricePaid: dollars(item.pricePaidCents),
    purchaseDate: day(item.purchaseDate),
  };
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
  const [fields, setFields] = useState<Fields>(() => initial(item));
  const [result, setResult] = useState<ItemFormState>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always save the freshest values, even from a debounced/blur callback.
  // Sync in an effect (not during render) so we never mutate a ref mid-render;
  // it settles long before the debounced save fires.
  const latest = useRef(fields);
  useEffect(() => {
    latest.current = fields;
  }, [fields]);

  function save() {
    if (timer.current) clearTimeout(timer.current);
    const v = latest.current;
    if (v.title.trim().length === 0) {
      setResult({ error: "Title is required" });
      return;
    }
    const fd = new FormData();
    fd.set("itemId", String(item.id));
    for (const [k, val] of Object.entries(v)) fd.set(k, val);
    startTransition(async () => {
      setResult(await updateItemAction(null, fd));
      setDirty(false);
    });
  }

  function set<K extends keyof Fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
  }

  // Flush a pending save on unmount (e.g. navigating away mid-debounce).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const text = (key: keyof Fields, label: string, placeholder?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={key}
        value={fields[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        onBlur={save}
        className={inputClass}
      />
    </label>
  );

  const money = (key: keyof Fields, label: string, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-neutral-400">$</span>
        <input
          name={key}
          inputMode="decimal"
          value={fields[key]}
          placeholder="0.00"
          onChange={(e) => set(key, e.target.value)}
          onBlur={save}
          className={inputClass}
        />
      </div>
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );

  const status = pending
    ? "Saving…"
    : result?.error
      ? result.error
      : dirty
        ? "Saving…"
        : result?.saved
          ? "Saved ✓"
          : "";

  return (
    <div className="flex flex-col gap-4">
      {text("title", "Title")}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Category</span>
          <select
            name="categoryId"
            value={fields.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            onBlur={save}
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
            value={fields.locationId}
            onChange={(e) => set("locationId", e.target.value)}
            onBlur={save}
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

      {text("manufacturer", "Manufacturer", "e.g. Sony")}
      <div className="grid grid-cols-2 gap-3">
        {text("modelNumber", "Model number")}
        {text("serialNumber", "Serial number")}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Quantity</span>
          <input
            name="quantity"
            type="number"
            min={1}
            value={fields.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            onBlur={save}
            className={inputClass}
          />
        </label>
        {text("condition", "Condition", "e.g. Good")}
        {text("ageEstimate", "Age", "e.g. ~3 yrs")}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-semibold">Value</legend>
        {money(
          "replacementCost",
          "Replacement cost (per item, today)",
          "What it costs to buy new now. Counts toward your coverage total (× quantity).",
        )}
        <div className="grid grid-cols-2 gap-3">
          {money("pricePaid", "Price paid")}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Purchase date</span>
            <input
              name="purchaseDate"
              type="date"
              value={fields.purchaseDate}
              onChange={(e) => set("purchaseDate", e.target.value)}
              onBlur={save}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-semibold">Status</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lifecycle</span>
            <select
              name="lifecycleStatus"
              value={fields.lifecycleStatus}
              onChange={(e) => set("lifecycleStatus", e.target.value)}
              onBlur={save}
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
              value={fields.lifecycleDate}
              onChange={(e) => set("lifecycleDate", e.target.value)}
              onBlur={save}
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
          value={fields.description}
          onChange={(e) => set("description", e.target.value)}
          onBlur={save}
          className={inputClass}
        />
      </label>

      {result?.coverageAlert ? (
        <CoverageAlertBanner alert={result.coverageAlert} />
      ) : null}

      {/* Auto-saves as you type — no button to forget. */}
      <p
        data-testid="save-status"
        className={`text-sm ${result?.error ? "text-coverage-over" : "text-neutral-500"}`}
      >
        {status}
      </p>
    </div>
  );
}
