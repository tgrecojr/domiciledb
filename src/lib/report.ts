/**
 * Pure assembly + totals for the proof packet (feature-spec §8). No DB or I/O,
 * so the money-critical grouping/totals are exhaustively unit-testable. The
 * server wrapper (queries/report.ts) fetches rows and calls assembleReport.
 *
 * Only ACTIVE items appear in the packet and totals (sold/disposed don't count).
 * All money is integer CENTS.
 */

export interface ReportPhoto {
  pathOriginal: string;
  pathWeb: string;
}

export interface ReportDocument {
  kind: string;
  filename: string;
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
export function itemAggregateCents(item: ReportItem): number | null {
  if (item.replacementCostCents === null) return null;
  const qty = Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
  return item.replacementCostCents * qty;
}

export function assembleReport(input: {
  items: ReportItem[];
  locationNames: Map<number, string>;
}): ReportData {
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
      items: [],
      totalCents: 0,
    };
    room.items.push(item);

    const agg = itemAggregateCents(item);
    if (agg === null) {
      excludedCount += 1;
    } else {
      countedCount += 1;
      grandTotalCents += agg;
      room.totalCents += agg;
      const cat = item.categoryName ?? "Uncategorized";
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + agg);
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
