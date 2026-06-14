import { describe, expect, it } from "vitest";

import type { ReportPacket } from "@/lib/queries/report";
import { renderProofPacket } from "@/lib/pdf/render";
import type { ReportItem, ReportRoom } from "@/lib/report";

function makeItem(i: number, locationId: number | null): ReportItem {
  return {
    id: i,
    title: `Item ${i}`,
    manufacturer: "Acme",
    modelNumber: `M-${i}`,
    serialNumber: `S-${i}`,
    quantity: 1,
    condition: "Good",
    ageEstimate: "~2 yrs",
    locationId,
    categoryName: "Electronics",
    replacementCostCents: 50_000,
    pricePaidCents: 40_000,
    purchaseDate: "2022-05-01T00:00:00.000Z",
    lifecycleStatus: "active",
    photos: [],
    documents: [],
  };
}

function makePacket(itemCount: number): ReportPacket {
  const byRoom = new Map<number | null, ReportRoom>();
  for (let i = 1; i <= itemCount; i++) {
    const loc = (i % 4) + 1;
    const room = byRoom.get(loc) ?? {
      locationId: loc,
      locationName: `Room ${loc}`,
      items: [],
      totalCents: 0,
    };
    const item = makeItem(i, loc);
    room.items.push(item);
    room.totalCents += item.replacementCostCents! * item.quantity;
    byRoom.set(loc, room);
  }
  const rooms = [...byRoom.values()];
  const grand = rooms.reduce((s, r) => s + r.totalCents, 0);
  return {
    rooms,
    categoryTotals: [{ name: "Electronics", cents: grand }],
    grandTotalCents: grand,
    countedCount: itemCount,
    excludedCount: 0,
    itemCount,
    householdName: "Test Residence",
    householdAddress: "1 Test St",
    generatedAt: "2026-06-14T12:00:00.000Z",
    filterLabel: "Entire household",
    coverage: {
      totalCents: grand,
      limitCents: 45675000,
      pctUsed: grand / 45675000,
      status: "within",
      excludedCount: 0,
      countedCount: itemCount,
      hasPolicy: true,
      warnPct: 0.8,
    },
  };
}

describe("renderProofPacket", () => {
  it("produces a valid, non-trivial PDF", async () => {
    const buf = await renderProofPacket(makePacket(6));
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(3000);
  });

  it("renders a large inventory without crashing (pagination regression guard)", async () => {
    // Pre-pagination, react-pdf overflowed past ~80 items in one Page. This
    // guards that explicit pagination keeps large packets working.
    const buf = await renderProofPacket(makePacket(150));
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("handles an empty inventory", async () => {
    const buf = await renderProofPacket(makePacket(0));
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
