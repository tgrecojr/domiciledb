"use client";

import type { ItemFormState } from "@/lib/actions/items";
import { formatCentsWhole } from "@/lib/money";

/** Inline nudge shown after a save escalated the household's coverage risk. */
// @spec ENRICH-ITEM-014
export function CoverageAlertBanner({
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
