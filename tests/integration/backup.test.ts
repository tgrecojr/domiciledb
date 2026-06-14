import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { household, item, photo } from "@/db/schema";
import { getObject, listKeys } from "@/lib/backup/s3";
import { SNAPSHOT_KEY } from "@/lib/backup/plan";
import { runBackup } from "@/lib/backup/run";
import { config } from "@/lib/config";

// Round-trips against a real S3-compatible store (RustFS). Skipped unless the
// operator env is present, so the default unit run never needs S3.
const ENABLED = Boolean(process.env.S3_BUCKET && process.env.S3_ENDPOINT);
const MEDIA_REL = "media/items/1/abc-web.webp";
const MEDIA_BYTES = Buffer.from("fake-image-bytes-1234567890");

async function ensureBucket() {
  const endpoint = process.env.S3_ENDPOINT;
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
  try {
    await client.send(
      new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }),
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
      throw err;
    }
  }
}

describe.skipIf(!ENABLED)("backup → S3 → restore round-trip", () => {
  beforeAll(async () => {
    await ensureBucket();
    runMigrations();
    const h = db
      .insert(household)
      .values({ name: "Backup Test" })
      .returning()
      .all()[0]!;
    const it = db
      .insert(item)
      .values({ householdId: h.id, title: "Insured TV" })
      .returning()
      .all()[0]!;
    db.insert(photo)
      .values({
        itemId: it.id,
        kind: "general",
        pathOriginal: MEDIA_REL,
        pathWeb: MEDIA_REL,
        pathThumb: MEDIA_REL,
        contentHash: "abc",
      })
      .run();
    const abs = path.join(config.paths.dataDir, MEDIA_REL);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, MEDIA_BYTES);
  });

  it("uploads a consistent snapshot + media to S3", async () => {
    const status = await runBackup("2026-06-14T00:00:00.000Z");
    expect(status.status).toBe("ok");
    expect(status.snapshotBytes).toBeGreaterThan(0);
    expect(status.mediaUploaded).toBeGreaterThanOrEqual(1);

    const keys = await listKeys("media/");
    expect(keys.has(MEDIA_REL)).toBe(true);
    expect((await getObject(MEDIA_REL)).equals(MEDIA_BYTES)).toBe(true);
  });

  it("snapshot in S3 is a valid db containing the data", async () => {
    const snapBytes = await getObject(SNAPSHOT_KEY);
    const tmp = path.join(os.tmpdir(), `snap-check-${process.pid}.db`);
    fs.writeFileSync(tmp, snapBytes);
    const sdb = new Database(tmp, { readonly: true });
    const row = sdb.prepare("select name from household limit 1").get() as {
      name: string;
    };
    expect(row.name).toBe("Backup Test");
    sdb.close();
  });

  it("restore.ts reconstructs DATA_DIR from S3", () => {
    const restoreDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "domicile-restore-"),
    );
    const res = spawnSync(
      path.join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["scripts/restore.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATA_DIR: restoreDir },
        encoding: "utf8",
      },
    );
    expect(res.status, res.stderr).toBe(0);

    // Restored db has the household.
    const rdb = new Database(path.join(restoreDir, "domiciledb.db"), {
      readonly: true,
    });
    const count = rdb.prepare("select count(*) c from household").get() as {
      c: number;
    };
    expect(count.c).toBe(1);
    rdb.close();

    // Restored media matches the original bytes.
    const restoredMedia = fs.readFileSync(path.join(restoreDir, MEDIA_REL));
    expect(restoredMedia.equals(MEDIA_BYTES)).toBe(true);
  });
});
