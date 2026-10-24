"use client";

import { LIFECYCLE_LABELS, LIFECYCLE_STATUSES } from "@/lib/lifecycle";

/**
 * The item editor's field groups: presentation only. State, the debounce,
 * and the save contract live in item-edit-form.tsx; every `name=` here is the
 * update action's form key and is what the e2e tests target.
 */

const inputClass =
	"w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
	"outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

export type Fields = {
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

/** What every field group needs from the form: values, a setter, a flush. */
export interface FieldGroupProps {
	fields: Fields;
	set: (key: keyof Fields, value: string) => void;
	save: () => void;
}

interface FieldProps extends FieldGroupProps {
	name: keyof Fields;
	label: string;
}

function TextField({
	name,
	label,
	placeholder,
	fields,
	set,
	save,
}: FieldProps & { placeholder?: string }) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-sm font-medium">{label}</span>
			<input
				name={name}
				value={fields[name]}
				placeholder={placeholder}
				onChange={(e) => set(name, e.target.value)}
				onBlur={save}
				className={inputClass}
			/>
		</label>
	);
}

function MoneyField({
	name,
	label,
	hint,
	fields,
	set,
	save,
}: FieldProps & { hint?: string }) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-sm font-medium">{label}</span>
			<div className="flex items-center gap-2">
				<span className="text-neutral-400">$</span>
				<input
					name={name}
					inputMode="decimal"
					value={fields[name]}
					placeholder="0.00"
					onChange={(e) => set(name, e.target.value)}
					onBlur={save}
					className={inputClass}
				/>
			</div>
			{hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
		</label>
	);
}

function DateField({ name, label, fields, set, save }: FieldProps) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-sm font-medium">{label}</span>
			<input
				name={name}
				type="date"
				value={fields[name]}
				onChange={(e) => set(name, e.target.value)}
				onBlur={save}
				className={inputClass}
			/>
		</label>
	);
}

function SelectField({
	name,
	label,
	empty,
	options,
	fields,
	set,
	save,
}: FieldProps & {
	/** Label for the "" option; omit when the select has no empty choice. */
	empty?: string;
	options: { value: string; label: string }[];
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-sm font-medium">{label}</span>
			<select
				name={name}
				value={fields[name]}
				onChange={(e) => set(name, e.target.value)}
				onBlur={save}
				className={inputClass}
			>
				{empty !== undefined ? <option value="">{empty}</option> : null}
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

const toOptions = (rows: { id: number; name: string }[]) =>
	rows.map((r) => ({ value: String(r.id), label: r.name }));

/** Title, category/location, make/model/serial, quantity/condition/age. */
// @spec ENRICH-ITEM-007
export function IdentityFields({
	categories,
	locations,
	...ctx
}: FieldGroupProps & {
	categories: { id: number; name: string }[];
	locations: { id: number; name: string }[];
}) {
	return (
		<>
			<TextField {...ctx} name="title" label="Title" />

			<div className="grid grid-cols-2 gap-3">
				<SelectField
					{...ctx}
					name="categoryId"
					label="Category"
					empty="— None —"
					options={toOptions(categories)}
				/>
				<SelectField
					{...ctx}
					name="locationId"
					label="Location"
					empty="— Unassigned —"
					options={toOptions(locations)}
				/>
			</div>

			<TextField
				{...ctx}
				name="manufacturer"
				label="Manufacturer"
				placeholder="e.g. Sony"
			/>
			<div className="grid grid-cols-2 gap-3">
				<TextField {...ctx} name="modelNumber" label="Model number" />
				<TextField {...ctx} name="serialNumber" label="Serial number" />
			</div>

			<div className="grid grid-cols-3 gap-3">
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Quantity</span>
					<input
						name="quantity"
						type="number"
						min={1}
						value={ctx.fields.quantity}
						onChange={(e) => ctx.set("quantity", e.target.value)}
						onBlur={ctx.save}
						className={inputClass}
					/>
				</label>
				<TextField
					{...ctx}
					name="condition"
					label="Condition"
					placeholder="e.g. Good"
				/>
				<TextField
					{...ctx}
					name="ageEstimate"
					label="Age"
					placeholder="e.g. ~3 yrs"
				/>
			</div>
		</>
	);
}

/** Replacement cost, price paid, purchase date. */
// @spec ENRICH-ITEM-008, ENRICH-ITEM-019
export function ValueFields(ctx: FieldGroupProps) {
	return (
		<fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
			<legend className="px-1 text-sm font-semibold">Value</legend>
			<MoneyField
				{...ctx}
				name="replacementCost"
				label="Replacement cost (per item, today)"
				hint="What it costs to buy new now. Counts toward your coverage total (× quantity)."
			/>
			<div className="grid grid-cols-2 gap-3">
				<MoneyField {...ctx} name="pricePaid" label="Price paid" />
				<DateField {...ctx} name="purchaseDate" label="Purchase date" />
			</div>
		</fieldset>
	);
}

/** Lifecycle status and its date. */
export function StatusFields(ctx: FieldGroupProps) {
	return (
		<fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
			<legend className="px-1 text-sm font-semibold">Status</legend>
			<div className="grid grid-cols-2 gap-3">
				<SelectField
					{...ctx}
					name="lifecycleStatus"
					label="Lifecycle"
					options={LIFECYCLE_STATUSES.map((s) => ({
						value: s,
						label: LIFECYCLE_LABELS[s],
					}))}
				/>
				<DateField {...ctx} name="lifecycleDate" label="Date (if not active)" />
			</div>
		</fieldset>
	);
}

export function DescriptionField({ fields, set, save }: FieldGroupProps) {
	return (
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
	);
}
