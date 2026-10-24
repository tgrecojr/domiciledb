"use client";

import { useActionState } from "react";

import { type HouseholdFormState, updateHouseholdAction } from "../actions";

const inputClass =
	"w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
	"outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

// @spec HOUSEHOLD-HH-006
export function HouseholdForm({
	initial,
}: {
	initial: { name: string; address: string; description: string };
}) {
	const [state, formAction, pending] = useActionState<
		HouseholdFormState,
		FormData
	>(updateHouseholdAction, null);

	return (
		<form
			action={formAction}
			className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4"
		>
			<label className="flex flex-col gap-1 text-sm">
				<span className="text-neutral-600">Household name</span>
				<input
					name="name"
					defaultValue={initial.name}
					required
					className={inputClass}
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm">
				<span className="text-neutral-600">Address</span>
				<input
					name="address"
					defaultValue={initial.address}
					placeholder="Optional — printed on the proof packet"
					className={inputClass}
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm">
				<span className="text-neutral-600">Description</span>
				<textarea
					name="description"
					defaultValue={initial.description}
					rows={3}
					placeholder="Optional"
					className={inputClass}
				/>
			</label>
			{state?.error ? (
				<p className="text-coverage-over text-sm">{state.error}</p>
			) : null}
			{state?.saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}
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
