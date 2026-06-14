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

describe("assembleReport", () => {
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

  it("falls back to Unassigned when a location id has no name", () => {
    const data = assembleReport({
      items: [item({ id: 1, locationId: 99, replacementCostCents: 10_00 })],
      locationNames: names,
    });
    expect(data.rooms[0]!.locationName).toBe("Unassigned");
  });
});
