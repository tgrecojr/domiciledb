/**
 * Pure assembly + totals for the proof packet (feature-spec §8). No DB or I/O,
 * so the money-critical grouping/totals are exhaustively unit-testable. The
 * server wrapper (queries/report.ts) fetches rows and calls assembleReport.
 *
 * Only ACTIVE items appear in the packet and totals (sold/disposed don't count).
 * All money is integer CENTS, and the per-item value and clamped addition are
 * the coverage spine's rules, so the packet can never disagree with the
 * dashboard about the same items.
 */

import { addCents, itemValueCents } from "@/lib/coverage";

export interface ReportPhoto {
	pathOriginal: string;
	pathWeb: string;
}

export interface ReportDocument {
	kind: string;
	filename: string;
	/** DATA_DIR-relative stored path, so receipt images can be embedded. */
	path: string;
}

export interface ReportItem {
	id: number;
	title: string;
	manufacturer: string | null;
	modelNumber: string | null;
	serialNumber: string | null;
	quantity: number;
	condition: string | null;
	ageEstimate: string | null;
	locationId: number | null;
	categoryName: string | null;
	replacementCostCents: number | null;
	pricePaidCents: number | null;
	purchaseDate: string | null;
	lifecycleStatus: string;
	photos: ReportPhoto[];
	documents: ReportDocument[];
}

export interface ReportRoom {
	locationId: number | null;
	locationName: string;
	/** Wider room/area shots (location-level, not item photos). */
	photos: ReportPhoto[];
	items: ReportItem[];
	totalCents: number;
}

export interface CategoryTotal {
	name: string;
	cents: number;
}

export interface ReportData {
	rooms: ReportRoom[];
	categoryTotals: CategoryTotal[];
	grandTotalCents: number;
	countedCount: number;
	excludedCount: number;
	itemCount: number;
}

const UNASSIGNED = "Unassigned";

/** Aggregate replacement value of an item line: per-item cost × quantity. */
// @spec PACKET-DATA-002
export function itemAggregateCents(item: ReportItem): number | null {
	return itemValueCents(item.replacementCostCents, item.quantity);
}

// @spec PACKET-DATA-001, PACKET-DATA-003, PACKET-DATA-004, PACKET-DATA-005, PACKET-DATA-006, PACKET-DATA-007
export function assembleReport(input: {
	items: ReportItem[];
	locationNames: Map<number, string>;
	/** Wider room shots keyed by locationId (optional). */
	locationPhotos?: Map<number, ReportPhoto[]>;
}): ReportData {
	// @spec CURRENT-LIFE-003
	const active = input.items.filter((i) => i.lifecycleStatus === "active");

	const roomMap = new Map<number | null, ReportRoom>();
	const categoryMap = new Map<string, number>();
	let grandTotalCents = 0;
	let countedCount = 0;
	let excludedCount = 0;

	for (const item of active) {
		const room = roomMap.get(item.locationId) ?? {
			locationId: item.locationId,
			locationName:
				item.locationId === null
					? UNASSIGNED
					: (input.locationNames.get(item.locationId) ?? UNASSIGNED),
			photos:
				item.locationId === null
					? []
					: (input.locationPhotos?.get(item.locationId) ?? []),
			items: [],
			totalCents: 0,
		};
		room.items.push(item);

		const agg = itemAggregateCents(item);
		if (agg === null) {
			excludedCount += 1;
		} else {
			countedCount += 1;
			// @spec PACKET-DATA-012
			grandTotalCents = addCents(grandTotalCents, agg);
			room.totalCents = addCents(room.totalCents, agg);
			const cat = item.categoryName ?? "Uncategorized";
			categoryMap.set(cat, addCents(categoryMap.get(cat) ?? 0, agg));
		}
		roomMap.set(item.locationId, room);
	}

	const rooms = [...roomMap.values()].sort((a, b) => {
		if (a.locationName === UNASSIGNED) return 1;
		if (b.locationName === UNASSIGNED) return -1;
		return a.locationName.localeCompare(b.locationName);
	});

	const categoryTotals = [...categoryMap.entries()]
		.map(([name, cents]) => ({ name, cents }))
		.sort((a, b) => b.cents - a.cents);

	return {
		rooms,
		categoryTotals,
		grandTotalCents,
		countedCount,
		excludedCount,
		itemCount: active.length,
	};
}
