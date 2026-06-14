import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  category,
  document,
  household,
  item,
  photo,
  valuation,
} from "@/db/schema";
import { assembleReport, type ReportData, type ReportItem } from "@/lib/report";
import { getCoverageSummary, type CoverageSummary } from "./coverage";
import { listLocations } from "./locations";

export interface ReportFilter {
  locationId?: number;
  categoryId?: number;
}

export interface ReportPacket extends ReportData {
  householdName: string;
  householdAddress: string | null;
  generatedAt: string;
  filterLabel: string;
  coverage: CoverageSummary;
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export function getReportPacket(
  householdId: number,
  filter: ReportFilter = {},
): ReportPacket | null {
  const householdRow = db.select().from(household).limit(1).get() ?? null;
  if (!householdRow) return null;

  const conditions = [eq(item.householdId, householdId)];
  if (filter.locationId)
    conditions.push(eq(item.locationId, filter.locationId));
  if (filter.categoryId)
    conditions.push(eq(item.categoryId, filter.categoryId));

  const rows = db
    .select({
      id: item.id,
      title: item.title,
      manufacturer: item.manufacturer,
      modelNumber: item.modelNumber,
      serialNumber: item.serialNumber,
      quantity: item.quantity,
      condition: item.condition,
      ageEstimate: item.ageEstimate,
      locationId: item.locationId,
      categoryName: category.name,
      replacementCostCents: item.currentReplacementCost,
      lifecycleStatus: item.lifecycleStatus,
    })
    .from(item)
    .leftJoin(category, eq(item.categoryId, category.id))
    .where(and(...conditions))
    .all();

  const itemIds = rows.map((r) => r.id);
  const photosByItem = groupBy(
    itemIds.length
      ? db
          .select({
            itemId: photo.itemId,
            pathOriginal: photo.pathOriginal,
            pathWeb: photo.pathWeb,
          })
          .from(photo)
          .where(inArray(photo.itemId, itemIds))
          .all()
      : [],
    (p) => p.itemId,
  );
  const docsByItem = groupBy(
    itemIds.length
      ? db
          .select({
            itemId: document.itemId,
            kind: document.kind,
            filename: document.filename,
          })
          .from(document)
          .where(inArray(document.itemId, itemIds))
          .all()
      : [],
    (d) => d.itemId,
  );
  const priceByItem = new Map<number, { amount: number; valuedAt: string }>();
  if (itemIds.length) {
    for (const v of db
      .select({
        itemId: valuation.itemId,
        amount: valuation.amount,
        valuedAt: valuation.valuedAt,
      })
      .from(valuation)
      .where(
        and(
          inArray(valuation.itemId, itemIds),
          eq(valuation.kind, "price_paid"),
        ),
      )
      .all()) {
      const existing = priceByItem.get(v.itemId);
      if (!existing || v.valuedAt > existing.valuedAt) {
        priceByItem.set(v.itemId, { amount: v.amount, valuedAt: v.valuedAt });
      }
    }
  }

  const items: ReportItem[] = rows.map((r) => ({
    ...r,
    pricePaidCents: priceByItem.get(r.id)?.amount ?? null,
    purchaseDate: priceByItem.get(r.id)?.valuedAt ?? null,
    photos: photosByItem.get(r.id) ?? [],
    documents: docsByItem.get(r.id) ?? [],
  }));

  const locations = listLocations(householdId);
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const data = assembleReport({ items, locationNames });

  let filterLabel = "Entire household";
  if (filter.locationId) {
    filterLabel = `Location: ${locationNames.get(filter.locationId) ?? "Unknown"}`;
  } else if (filter.categoryId) {
    const cat = rows.find((r) => r.categoryName)?.categoryName;
    filterLabel = `Category: ${cat ?? "Selected"}`;
  }

  return {
    ...data,
    householdName: householdRow.name,
    householdAddress: householdRow.address,
    generatedAt: new Date().toISOString(),
    filterLabel,
    coverage: getCoverageSummary(householdId),
  };
}
