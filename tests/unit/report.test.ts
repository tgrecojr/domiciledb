import { describe, expect, it } from "vitest";

import {
	assembleReport,
	itemAggregateCents,
	type ReportItem,
} from "@/lib/report";

function item(over: Partial<ReportItem>): ReportItem {
	return {
		id: 1,
		title: "Item",
		manufacturer: null,
		modelNumber: null,
		serialNumber: null,
		quantity: 1,
		condition: null,
		ageEstimate: null,
		locationId: null,
		categoryName: null,
		replacementCostCents: null,
		pricePaidCents: null,
		purchaseDate: null,
		lifecycleStatus: "active",
		photos: [],
		documents: [],
		...over,
	};
}

const names = new Map<number, string>([
	[1, "Living Room"],
	[2, "Garage"],
]);

// @spec PACKET-DATA-002
describe("itemAggregateCents", () => {
	it("multiplies per-item cost by quantity", () => {
		expect(
			itemAggregateCents(item({ replacementCostCents: 100_00, quantity: 8 })),
		).toBe(800_00);
	});

	it("is null when there is no replacement cost", () => {
		expect(itemAggregateCents(item({ replacementCostCents: null }))).toBeNull();
	});

	it("treats a non-finite quantity as zero", () => {
		expect(
			itemAggregateCents(item({ replacementCostCents: 100_00, quantity: NaN })),
		).toBe(0);
	});
});

// @spec PACKET-DATA-012, PACKET-DATA-011
describe("assembleReport totals stay within the safe-integer range", () => {
	it("clamps room, category, and grand totals like the coverage spine", () => {
		const absurd = item({
			locationId: 1,
			categoryName: "Art",
			replacementCostCents: 100_00,
			quantity: 1e15,
		});
		const data = assembleReport({
			items: [absurd, { ...absurd, id: 2 }],
			locationNames: names,
		});
		expect(Number.isSafeInteger(data.grandTotalCents)).toBe(true);
		expect(data.grandTotalCents).toBe(Number.MAX_SAFE_INTEGER);
		expect(data.rooms[0]!.totalCents).toBe(Number.MAX_SAFE_INTEGER);
		expect(data.categoryTotals[0]!.cents).toBe(Number.MAX_SAFE_INTEGER);
	});
});

describe("assembleReport", () => {
	// @spec PACKET-DATA-004
	it("groups by room and totals replacement value (cost × qty)", () => {
		const data = assembleReport({
			items: [
				item({
					id: 1,
					locationId: 1,
					replacementCostCents: 100_00,
					quantity: 2,
				}),
				item({ id: 2, locationId: 1, replacementCostCents: 50_00 }),
				item({ id: 3, locationId: 2, replacementCostCents: 300_00 }),
			],
			locationNames: names,
		});

		const living = data.rooms.find((r) => r.locationId === 1)!;
		expect(living.locationName).toBe("Living Room");
		expect(living.totalCents).toBe(250_00); // 2×$100 + $50
		expect(data.grandTotalCents).toBe(550_00);
		expect(data.countedCount).toBe(3);
		expect(data.itemCount).toBe(3);
	});

	// @spec PACKET-DATA-003
	it("excludes items without a replacement cost but keeps them in the room", () => {
		const data = assembleReport({
			items: [
				item({ id: 1, locationId: 1, replacementCostCents: 100_00 }),
				item({ id: 2, locationId: 1, replacementCostCents: null }),
			],
			locationNames: names,
		});
		const living = data.rooms.find((r) => r.locationId === 1)!;
		expect(living.items).toHaveLength(2);
		expect(living.totalCents).toBe(100_00);
		expect(data.excludedCount).toBe(1);
		expect(data.countedCount).toBe(1);
	});

	// @spec PACKET-DATA-001
	it("ignores non-active items entirely", () => {
		const data = assembleReport({
			items: [
				item({ id: 1, locationId: 1, replacementCostCents: 100_00 }),
				item({
					id: 2,
					locationId: 1,
					replacementCostCents: 999_00,
					lifecycleStatus: "sold",
				}),
			],
			locationNames: names,
		});
		expect(data.itemCount).toBe(1);
		expect(data.grandTotalCents).toBe(100_00);
	});

	// @spec PACKET-DATA-006
	it("totals by category, sorted descending", () => {
		const data = assembleReport({
			items: [
				item({
					id: 1,
					categoryName: "Electronics",
					replacementCostCents: 100_00,
				}),
				item({ id: 2, categoryName: "Jewelry", replacementCostCents: 500_00 }),
				item({
					id: 3,
					categoryName: "Electronics",
					replacementCostCents: 50_00,
				}),
				item({ id: 4, categoryName: null, replacementCostCents: 25_00 }),
			],
			locationNames: names,
		});
		expect(data.categoryTotals).toEqual([
			{ name: "Jewelry", cents: 500_00 },
			{ name: "Electronics", cents: 150_00 },
			{ name: "Uncategorized", cents: 25_00 },
		]);
	});

	// @spec PACKET-DATA-005
	it("places the Unassigned room last and names known rooms", () => {
		const data = assembleReport({
			items: [
				item({ id: 1, locationId: null, replacementCostCents: 10_00 }),
				item({ id: 2, locationId: 2, replacementCostCents: 10_00 }),
				item({ id: 3, locationId: 1, replacementCostCents: 10_00 }),
			],
			locationNames: names,
		});
		expect(data.rooms.map((r) => r.locationName)).toEqual([
			"Garage",
			"Living Room",
			"Unassigned",
		]);
	});

	// @spec PACKET-DATA-005
	it("sorts Unassigned last even when a known room is added before it", () => {
		// Insertion order [Garage, Unassigned] exercises the a===Unassigned branch
		// of the sort comparator (Unassigned becomes the element being placed).
		const data = assembleReport({
			items: [
				item({ id: 1, locationId: 2, replacementCostCents: 10_00 }),
				item({ id: 2, locationId: null, replacementCostCents: 10_00 }),
			],
			locationNames: names,
		});
		expect(data.rooms.map((r) => r.locationName)).toEqual([
			"Garage",
			"Unassigned",
		]);
	});

	// @spec PACKET-DATA-004
	it("falls back to Unassigned when a location id has no name", () => {
		const data = assembleReport({
			items: [item({ id: 1, locationId: 99, replacementCostCents: 10_00 })],
			locationNames: names,
		});
		expect(data.rooms[0]!.locationName).toBe("Unassigned");
	});

	// @spec PACKET-DATA-007
	it("attaches location photos to their room and leaves others empty", () => {
		const livingShots = [
			{ pathOriginal: "media/locations/1/a-original.jpg", pathWeb: "a-web" },
		];
		const data = assembleReport({
			items: [
				item({ id: 1, locationId: 1, replacementCostCents: 10_00 }),
				item({ id: 2, locationId: 2, replacementCostCents: 10_00 }),
			],
			locationNames: names,
			locationPhotos: new Map([[1, livingShots]]),
		});
		const living = data.rooms.find((r) => r.locationId === 1)!;
		const garage = data.rooms.find((r) => r.locationId === 2)!;
		expect(living.photos).toEqual(livingShots);
		expect(garage.photos).toEqual([]);
	});

	// @spec PACKET-DATA-007
	it("never attaches photos to the Unassigned room", () => {
		const data = assembleReport({
			items: [item({ id: 1, locationId: null, replacementCostCents: 10_00 })],
			locationNames: names,
			// A stray null-keyed entry must not leak into Unassigned.
			locationPhotos: new Map([[1, [{ pathOriginal: "x", pathWeb: "x" }]]]),
		});
		expect(data.rooms[0]!.locationName).toBe("Unassigned");
		expect(data.rooms[0]!.photos).toEqual([]);
	});
});
