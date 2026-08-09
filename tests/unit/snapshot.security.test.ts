import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * VULN-001: createSnapshot must not blow away the canonical snapshot before the
 * new one is ready. A concurrent reader (e.g. /api/export) that opens the
 * snapshot path during a re-snapshot must always find a COMPLETE database — the
 * old one or the new one, never an rm'd/empty file.
 */
let createSnapshot: typeof import("@/lib/backup/snapshot").createSnapshot;
let sqlite: typeof import("@/db").sqlite;
let target: string;

beforeAll(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vuln001-"));
  const { runMigrations } = await import("@/db/migrate");
  const { db } = await import("@/db");
  ({ sqlite } = await import("@/db"));
  const schema = await import("@/db/schema");
  const { config } = await import("@/lib/config");
  ({ createSnapshot } = await import("@/lib/backup/snapshot"));
  runMigrations();
  db.insert(schema.household).values({ name: "H" }).returning().all();
  target = config.paths.backupSnapshot;
});

describe("createSnapshot atomicity (VULN-001)", () => {
  it("leaves a complete snapshot readable throughout a re-snapshot", () => {
    // Establish an initial complete snapshot at the canonical path.
    createSnapshot();
    expect(fs.existsSync(target)).toBe(true);
    const firstSize = fs.statSync(target).size;
    expect(firstSize).toBeGreaterThan(0);

    // Simulate a concurrent reader sampling the snapshot path at the exact
    // moment the VACUUM runs (the vulnerable window).
    const origExec = sqlite.exec.bind(sqlite);
    let existedDuringVacuum: boolean | null = null;
    let sizeDuringVacuum = 0;
    const spy = vi
      .spyOn(sqlite, "exec")
      .mockImplementation((sql: string) => {
        if (String(sql).includes("VACUUM INTO")) {
          existedDuringVacuum = fs.existsSync(target);
          sizeDuringVacuum = existedDuringVacuum ? fs.statSync(target).size : 0;
        }
        return origExec(sql);
      });

    createSnapshot();
    spy.mockRestore();

    // The old snapshot must still have been present and complete at that moment.
    expect(existedDuringVacuum).toBe(true);
    expect(sizeDuringVacuum).toBeGreaterThan(0);
  });
});
