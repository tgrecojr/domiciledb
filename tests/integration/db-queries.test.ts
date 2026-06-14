import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the seam between the (unit-tested) pure logic and the real database:
 * valuation history integrity, coverage aggregation with lifecycle, and report
 * filtering. Uses a real temp SQLite db (no S3 needed). Env is set before the
 * app modules load, so config points at the temp DATA_DIR.
 */

// Loaded in beforeAll after DATA_DIR is set (so config resolves to the temp db).
let db: typeof import("@/db").db;
let schema: typeof import("@/db/schema");
let recordValuations: typeof import("@/lib/queries/valuations").recordValuations;
let currentValuations: typeof import("@/lib/queries/valuations").currentValuations;
let getCoverageSummary: typeof import("@/lib/queries/coverage").getCoverageSummary;
let getReportPacket: typeof import("@/lib/queries/report").getReportPacket;
let deleteItem: typeof import("@/lib/queries/items").deleteItem;
let deleteItemMedia: typeof import("@/lib/media").deleteItemMedia;
let dataDir: string;

let householdId: number;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "domicile-dbq-"));
  process.env.DATA_DIR = dataDir;
  process.env.COVERAGE_WARN_PCT = "0.8";

  const { runMigrations } = await import("@/db/migrate");
  ({ db } = await import("@/db"));
  schema = await import("@/db/schema");
  ({ recordValuations, currentValuations } =
    await import("@/lib/queries/valuations"));
  ({ getCoverageSummary } = await import("@/lib/queries/coverage"));
  ({ getReportPacket } = await import("@/lib/queries/report"));
  ({ deleteItem } = await import("@/lib/queries/items"));
  ({ deleteItemMedia } = await import("@/lib/media"));

  runMigrations();
  householdId = db
    .insert(schema.household)
    .values({ name: "DB Test Household" })
    .returning()
    .all()[0]!.id;
});

function newItem(over: Partial<typeof schema.item.$inferInsert> = {}) {
  return db
    .insert(schema.item)
    .values({ householdId, title: "Item", ...over })
    .returning()
    .all()[0]!;
}

describe("recordValuations integrity", () => {
  it("inserts only on change and keeps the item's denormalized cost in sync", () => {
    const it = newItem();

    recordValuations(it.id, { replacementCostCents: 100_00 });
    let rows = db
      .select()
      .from(schema.valuation)
      .where(eq(schema.valuation.itemId, it.id))
      .all();
    expect(rows).toHaveLength(1);

    let item = db
      .select()
      .from(schema.item)
      .where(eq(schema.item.id, it.id))
      .get()!;
    expect(item.currentReplacementCost).toBe(100_00);
    expect(item.currentReplacementValuedAt).toBeTruthy();

    // Same value again -> no new history row.
    recordValuations(it.id, { replacementCostCents: 100_00 });
    rows = db
      .select()
      .from(schema.valuation)
      .where(eq(schema.valuation.itemId, it.id))
      .all();
    expect(rows).toHaveLength(1);

    // Changed value -> new row + denormalized cost updated.
    recordValuations(it.id, { replacementCostCents: 150_00 });
    rows = db
      .select()
      .from(schema.valuation)
      .where(eq(schema.valuation.itemId, it.id))
      .all();
    expect(rows.filter((r) => r.kind === "replacement_cost")).toHaveLength(2);
    item = db
      .select()
      .from(schema.item)
      .where(eq(schema.item.id, it.id))
      .get()!;
    expect(item.currentReplacementCost).toBe(150_00);
    expect(currentValuations(it.id).replacementCostCents).toBe(150_00);
  });

  it("records price paid with the purchase date", () => {
    const it = newItem();
    recordValuations(it.id, {
      pricePaidCents: 80_00,
      purchaseDate: "2021-03-15",
    });
    const v = currentValuations(it.id);
    expect(v.pricePaidCents).toBe(80_00);
    expect(v.purchaseDate).toBe("2021-03-15");
  });
});

describe("getCoverageSummary wired to the database", () => {
  it("counts active valued items, drops sold ones, and excludes unvalued ones", () => {
    const localHh = db
      .insert(schema.household)
      .values({ name: "Coverage Hh" })
      .returning()
      .all()[0]!;
    db.insert(schema.policy)
      .values({
        householdId: localHh.id,
        coverageBPersonalProperty: 1_000_00,
        source: "user",
        updatedAt: new Date().toISOString(),
      })
      .run();

    const valued = db
      .insert(schema.item)
      .values({
        householdId: localHh.id,
        title: "Valued",
        currentReplacementCost: 500_00,
        quantity: 1,
      })
      .returning()
      .all()[0]!;

    let s = getCoverageSummary(localHh.id);
    expect(s.totalCents).toBe(500_00);
    expect(s.status).toBe("within");

    // Mark it sold -> it must leave the coverage total.
    db.update(schema.item)
      .set({ lifecycleStatus: "sold" })
      .where(eq(schema.item.id, valued.id))
      .run();
    s = getCoverageSummary(localHh.id);
    expect(s.totalCents).toBe(0);

    // An active item with no replacement cost is excluded, not counted.
    db.insert(schema.item)
      .values({ householdId: localHh.id, title: "Unvalued" })
      .run();
    s = getCoverageSummary(localHh.id);
    expect(s.totalCents).toBe(0);
    expect(s.excludedCount).toBe(1);
  });
});

describe("getReportPacket location filter", () => {
  it("returns only items in the requested location", () => {
    const hh = db
      .insert(schema.household)
      .values({ name: "Report Hh" })
      .returning()
      .all()[0]!;
    const roomA = db
      .insert(schema.location)
      .values({ householdId: hh.id, name: "Room A", kind: "room" })
      .returning()
      .all()[0]!;
    const roomB = db
      .insert(schema.location)
      .values({ householdId: hh.id, name: "Room B", kind: "room" })
      .returning()
      .all()[0]!;
    db.insert(schema.item)
      .values({
        householdId: hh.id,
        locationId: roomA.id,
        title: "A1",
        currentReplacementCost: 100_00,
      })
      .run();
    db.insert(schema.item)
      .values({
        householdId: hh.id,
        locationId: roomB.id,
        title: "B1",
        currentReplacementCost: 200_00,
      })
      .run();

    const all = getReportPacket(hh.id)!;
    expect(all.itemCount).toBe(2);

    const onlyA = getReportPacket(hh.id, { locationId: roomA.id })!;
    expect(onlyA.itemCount).toBe(1);
    expect(onlyA.rooms).toHaveLength(1);
    expect(onlyA.rooms[0]!.locationName).toBe("Room A");
    expect(onlyA.grandTotalCents).toBe(100_00);
  });
});

describe("deleteItem cascades rows and removes on-disk media", () => {
  it("deletes the item, its photo/valuation rows, and its media files", async () => {
    const it = newItem();
    const rel = `media/items/${it.id}/photo-web.webp`;
    db.insert(schema.photo)
      .values({
        itemId: it.id,
        kind: "general",
        pathOriginal: rel,
        pathWeb: rel,
        pathThumb: rel,
        contentHash: "hash",
      })
      .run();
    recordValuations(it.id, { replacementCostCents: 100_00 });

    const abs = path.join(dataDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "bytes");

    deleteItem(it.id);
    await deleteItemMedia(it.id);

    // Item + cascaded child rows are gone.
    expect(
      db.select().from(schema.item).where(eq(schema.item.id, it.id)).all(),
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(schema.photo)
        .where(eq(schema.photo.itemId, it.id))
        .all(),
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(schema.valuation)
        .where(eq(schema.valuation.itemId, it.id))
        .all(),
    ).toHaveLength(0);

    // On-disk media directory is removed.
    expect(
      fs.existsSync(path.join(dataDir, "media", "items", String(it.id))),
    ).toBe(false);
  });
});
