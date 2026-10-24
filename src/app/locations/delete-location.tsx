"use client";

import { useState } from "react";

import { deleteLocationAction } from "@/lib/actions/locations";

// @spec HOUSEHOLD-LOC-006
export function DeleteLocation({
	locationId,
	name,
	itemCount,
}: {
	locationId: number;
	name: string;
	itemCount: number;
}) {
	const [confirming, setConfirming] = useState(false);

	if (!confirming) {
		return (
			<button
				type="button"
				onClick={() => setConfirming(true)}
				className="hover:text-coverage-over self-end text-sm text-neutral-400"
			>
				Delete
			</button>
		);
	}

	const items =
		itemCount === 0
			? "It has no items."
			: `${itemCount} item${itemCount === 1 ? "" : "s"} will become unassigned.`;

	return (
		<div className="border-coverage-over/40 bg-coverage-over/5 flex flex-col gap-2 rounded-lg border p-3 text-sm">
			<p className="text-coverage-over">
				Delete {name}? {items} Its room photos are deleted. This can&apos;t be
				undone.
			</p>
			<div className="flex gap-2">
				<form action={deleteLocationAction}>
					<input type="hidden" name="id" value={locationId} />
					<button
						type="submit"
						className="bg-coverage-over rounded-lg px-3 py-1.5 font-medium text-white"
					>
						Yes, delete
					</button>
				</form>
				<button
					type="button"
					onClick={() => setConfirming(false)}
					className="rounded-lg border border-neutral-300 px-3 py-1.5"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
