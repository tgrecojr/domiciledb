import { describe, expect, it } from "vitest";

import { ITEMS_PER_PAGE, paginateRooms } from "@/lib/pdf/paginate";
import type { ReportItem, ReportRoom } from "@/lib/report";

function item(id: number): ReportItem {
  return {
    id,
    title: `Item ${id}`,
    manufacturer: null,
    modelNumber: null,
    serialNumber: null,
    quantity: 1,
    condition: null,
    ageEstimate: null,
    locationId: 1,
    categoryName: null,
    replacementCostCents: 100_00,
    pricePaidCents: null,
    purchaseDate: null,
    lifecycleStatus: "active",
    photos: [],
    documents: [],
  };
}

function room(locationId: number, name: string, n: number): ReportRoom {
  return {
    locationId,
    locationName: name,
    items: Array.from({ length: n }, (_, i) => item(locationId * 1000 + i)),
    totalCents: n * 100_00,
  };
}

describe("paginateRooms (proof-packet pagination)", () => {
  it("keeps a small room on a single page", () => {
    const chunks = paginateRooms([room(1, "Living", ITEMS_PER_PAGE)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.continued).toBe(false);
    expect(chunks[0]!.items).toHaveLength(ITEMS_PER_PAGE);
  });

  it("splits a large room into bounded, continued pages", () => {
    const chunks = paginateRooms([room(1, "Garage", 25)]);
    // 25 items, 10 per page -> 10, 10, 5
    expect(chunks.map((c) => c.items.length)).toEqual([10, 10, 5]);
    expect(chunks.map((c) => c.continued)).toEqual([false, true, true]);
    expect(chunks.every((c) => c.room.locationName === "Garage")).toBe(true);
  });

  it("skips empty rooms", () => {
    const chunks = paginateRooms([room(1, "Empty", 0), room(2, "Den", 3)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.room.locationName).toBe("Den");
  });

  it("never exceeds the per-page bound, even for a large inventory", () => {
    // The original bug crashed react-pdf past ~80 items on one page; bounding
    // every chunk to ITEMS_PER_PAGE is what prevents it.
    const rooms = Array.from({ length: 8 }, (_, r) => room(r + 1, `R${r}`, 40));
    const chunks = paginateRooms(rooms);
    expect(chunks.every((c) => c.items.length <= ITEMS_PER_PAGE)).toBe(true);
    // 8 rooms × 40 items / 10 per page = 32 pages.
    expect(chunks).toHaveLength(32);
  });
});
