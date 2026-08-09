import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The server action redirects/revalidates; neutralize those Next-only effects
// so we can drive the real action in a plain node test.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

/**
 * VULN-017: deleting a content-addressed location photo must (a) actually
 * remove its files when nothing else references them (no orphan leak) and
 * (b) keep files a duplicate row still references. Drives the real action.
 */
let deleteLocationPhotoAction: typeof import("@/lib/actions/locations").deleteLocationPhotoAction;
let addLocationPhoto: typeof import("@/lib/queries/location-photos").addLocationPhoto;
let db: typeof import("@/db").db;
let schema: typeof import("@/db/schema");
let dataDir: string;
let householdId: number;

function makeLocation(): number {
  return db
    .insert(schema.location)
    .values({ householdId, name: "Room", kind: "room" })
    .returning()
    .all()[0]!.id;
}

function storeFiles(locationId: number, hash: string) {
  const relDir = path.join("media", "locations", String(locationId));
  const paths = {
    pathOriginal: path.join(relDir, `${hash}-original.jpg`),
    pathWeb: path.join(relDir, `${hash}-web.webp`),
    pathThumb: path.join(relDir, `${hash}-thumb.webp`),
  };
  fs.mkdirSync(path.join(dataDir, relDir), { recursive: true });
  for (const rel of Object.values(paths)) {
    fs.writeFileSync(path.join(dataDir, rel), Buffer.from("bytes"));
  }
  return { ...paths, contentHash: hash, width: 10, height: 10 };
}

async function callDelete(photoId: number, locationId: number) {
  const fd = new FormData();
  fd.set("photoId", String(photoId));
  fd.set("locationId", String(locationId));
  await deleteLocationPhotoAction(fd);
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuln017-"));
  process.env.DATA_DIR = dataDir;
  const { runMigrations } = await import("@/db/migrate");
  ({ db } = await import("@/db"));
  schema = await import("@/db/schema");
  ({ deleteLocationPhotoAction } = await import("@/lib/actions/locations"));
  ({ addLocationPhoto } = await import("@/lib/queries/location-photos"));
  runMigrations();
  householdId = db
    .insert(schema.household)
    .values({ name: "H" })
    .returning()
    .all()[0]!.id;
});

describe("location photo delete refcount (VULN-017)", () => {
  it("removes files when no other row references them (no orphan leak)", async () => {
    const locationId = makeLocation();
    const stored = storeFiles(locationId, "b".repeat(64));
    const id = addLocationPhoto(locationId, stored).id;

    await callDelete(id, locationId);

    for (const rel of [
      stored.pathOriginal,
      stored.pathWeb,
      stored.pathThumb,
    ]) {
      expect(fs.existsSync(path.join(dataDir, rel))).toBe(false);
    }
  });

  it("keeps files a duplicate row still references", async () => {
    const locationId = makeLocation();
    const stored = storeFiles(locationId, "c".repeat(64));
    const firstId = addLocationPhoto(locationId, stored).id;
    addLocationPhoto(locationId, stored); // duplicate row, same files

    await callDelete(firstId, locationId);

    for (const rel of [
      stored.pathOriginal,
      stored.pathWeb,
      stored.pathThumb,
    ]) {
      expect(fs.existsSync(path.join(dataDir, rel))).toBe(true);
    }
  });
});
