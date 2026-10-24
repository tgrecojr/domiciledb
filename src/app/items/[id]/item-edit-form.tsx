"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { type ItemFormState, updateItemAction } from "@/lib/actions/items";
import { CoverageAlertBanner } from "./coverage-alert-banner";
import {
	DescriptionField,
	type Fields,
	IdentityFields,
	StatusFields,
	ValueFields,
} from "./item-edit-fields";

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

/** The save payload, or null when the title is empty (nothing may be sent). */
// @spec ENRICH-ITEM-004
function toFormData(itemId: number, v: Fields): FormData | null {
	if (v.title.trim().length === 0) return null;
	const fd = new FormData();
	fd.set("itemId", String(itemId));
	for (const [k, val] of Object.entries(v)) fd.set(k, val);
	return fd;
}

// @spec ENRICH-ITEM-003, ENRICH-ITEM-004, ENRICH-ITEM-005, ENRICH-ITEM-006, ENRICH-ITEM-007, ENRICH-ITEM-008, ENRICH-ITEM-014, ENRICH-ITEM-019
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
	// The armed debounce; null whenever no save is pending.
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
		timer.current = null;
		const fd = toFormData(item.id, latest.current);
		if (!fd) {
			setResult({ error: "Title is required" });
			return;
		}
		startTransition(async () => {
			setResult(await updateItemAction(null, fd));
			setDirty(false);
		});
	}

	function set(key: keyof Fields, value: string) {
		setFields((f) => ({ ...f, [key]: value }));
		setDirty(true);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
	}

	// Flush — never cancel — a save still pending on unmount (e.g. the user
	// navigated away mid-debounce). Fire-and-forget: the component is gone, so
	// nothing is set from the result. An empty title stays blocked here too.
	// @spec ENRICH-ITEM-005
	useEffect(() => {
		return () => {
			if (!timer.current) return;
			clearTimeout(timer.current);
			timer.current = null;
			const fd = toFormData(item.id, latest.current);
			if (fd) {
				updateItemAction(null, fd).catch((err: unknown) => {
					console.error("[item-edit] could not flush the pending save", err);
				});
			}
		};
	}, [item.id]);

	// @spec ENRICH-ITEM-006
	const status = pending
		? "Saving…"
		: result?.error
			? result.error
			: dirty
				? "Saving…"
				: result?.saved
					? "Saved ✓"
					: "";

	const ctx = { fields, set, save };

	return (
		<div className="flex flex-col gap-4">
			<IdentityFields {...ctx} categories={categories} locations={locations} />
			<ValueFields {...ctx} />
			<StatusFields {...ctx} />
			<DescriptionField {...ctx} />

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
