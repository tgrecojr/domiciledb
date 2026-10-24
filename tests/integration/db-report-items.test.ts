import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The report and item-list seams against a real temp SQLite db: location
 * filtering for the proof packet and the items list, and the delete cascade
 * (rows + on-disk media). Env is set before the app modules load, so config
 * points at the temp DATA_DIR. Valuation history and coverage aggregation live
 * in db-queries.test.ts.
 */

let db: typeof import("@/db").db;
let schema: typeof import("@/db/schema");
let recordValuations: typeof import("@/lib/queries/valuations").recordValuations;
let getReportPacket: typeof import("@/lib/queries/report").getReportPacket;
let deleteItem: typeof import("@/lib/queries/items").deleteItem;
let listItems: typeof import("@/lib/queries/items").listItems;
let deleteItemMedia: typeof import("@/lib/media").deleteItemMedia;
let dataDir: string;

let householdId: number;

beforeAll(async () => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "domicile-dbr-"));
	process.env.DATA_DIR = dataDir;
	process.env.COVERAGE_WARN_PCT = "0.8";

	const { runMigrations } = await import("@/db/migrate");
	({ db } = await import("@/db"));
	schema = await import("@/db/schema");
	({ recordValuations } = await import("@/lib/queries/valuations"));
	({ getReportPacket } = await import("@/lib/queries/report"));
	({ deleteItem, listItems } = await import("@/lib/queries/items"));
	({ deleteItemMedia } = await import("@/lib/media"));

	runMigrations();
	householdId = db
		.insert(schema.household)
		.values({ name: "DB Report Household" })
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

describe("getReportPacket location filter", () => {
	// @spec PACKET-DATA-008
	it("returns only items in the requested location", () => {
		db.delete(schema.item).run();
		db.delete(schema.location).run();
		const roomA = db
			.insert(schema.location)
			.values({ householdId, name: "Room A", kind: "room" })
			.returning()
			.all()[0]!;
		const roomB = db
			.insert(schema.location)
			.values({ householdId, name: "Room B", kind: "room" })
			.returning()
			.all()[0]!;
		db.insert(schema.item)
			.values({
				householdId,
				locationId: roomA.id,
				title: "A1",
				currentReplacementCost: 100_00,
			})
			.run();
		db.insert(schema.item)
			.values({
				householdId,
				locationId: roomB.id,
				title: "B1",
				currentReplacementCost: 200_00,
			})
			.run();

		const all = getReportPacket(householdId)!;
		expect(all.itemCount).toBe(2);

		const onlyA = getReportPacket(householdId, { locationId: roomA.id })!;
		expect(onlyA.itemCount).toBe(1);
		expect(onlyA.rooms).toHaveLength(1);
		expect(onlyA.rooms[0]!.locationName).toBe("Room A");
		expect(onlyA.grandTotalCents).toBe(100_00);
	});

	// @spec PACKET-DATA-009, ENRICH-PHOTO-004
	it("orders each item's photos by sort order then id, like the item page", () => {
		db.delete(schema.item).run();
		const it = newItem({ title: "Ordered", currentReplacementCost: 10_00 });
		const photoRow = (sortOrder: number, name: string) => ({
			itemId: it.id,
			kind: "general" as const,
			pathOriginal: `media/items/${it.id}/${name}-original.jpg`,
			pathWeb: `media/items/${it.id}/${name}-web.webp`,
			pathThumb: `media/items/${it.id}/${name}-thumb.webp`,
			contentHash: name,
			sortOrder,
		});
		// Inserted out of order on purpose: rowid order would put "later" first.
		db.insert(schema.photo).values(photoRow(1, "later")).run();
		db.insert(schema.photo).values(photoRow(0, "first")).run();

		const packet = getReportPacket(householdId)!;
		const photos = packet.rooms[0]!.items[0]!.photos.map((p) => p.pathWeb);
		expect(photos).toEqual([
			`media/items/${it.id}/first-web.webp`,
			`media/items/${it.id}/later-web.webp`,
		]);
	});
});

describe("listItems location filter", () => {
	// @spec ENRICH-LIST-002
	it("filters by location id, by unassigned, and returns all when omitted", () => {
		db.delete(schema.item).run();
		db.delete(schema.location).run();
		const kitchen = db
			.insert(schema.location)
			.values({ householdId, name: "Kitchen", kind: "room" })
			.returning()
			.all()[0]!;
		db.insert(schema.item)
			.values({ householdId, locationId: kitchen.id, title: "Fridge" })
			.run();
		db.insert(schema.item)
			.values({ householdId, locationId: kitchen.id, title: "Oven" })
			.run();
		db.insert(schema.item)
			.values({ householdId, locationId: null, title: "Floating lamp" })
			.run();

		expect(listItems(householdId)).toHaveLength(3);

		const inKitchen = listItems(householdId, { location: kitchen.id });
		expect(inKitchen.map((r) => r.title).sort()).toEqual(["Fridge", "Oven"]);

		const unassigned = listItems(householdId, { location: null });
		expect(unassigned).toHaveLength(1);
		expect(unassigned[0]!.title).toBe("Floating lamp");
	});
});

describe("deleteItem cascades rows and removes on-disk media", () => {
	// @spec ENRICH-ITEM-017, PLATFORM-DATA-005, PLATFORM-MEDIA-006
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
		expect(
			fs.existsSync(path.join(dataDir, "media", "items", String(it.id))),
		).toBe(false);
	});
});
