import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const dirs: string[] = [];

async function freshDb(maxCategories: string) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuln019-unit-"));
  dirs.push(dataDir);
  vi.resetModules();
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("MAX_CATEGORIES", maxCategories);
  // The connection is cached on globalThis; drop it so DATA_DIR takes effect.
  delete (globalThis as { __domicileSqlite?: unknown }).__domicileSqlite;

  const { runMigrations } = await import("@/db/migrate");
  runMigrations();
  const { db } = await import("@/db");
  const { findOrCreateCategory } = await import("@/lib/queries/categories");
  const count = () =>
    (
      db.$client.prepare("select count(*) c from category").get() as {
        c: number;
      }
    ).c;
  return { findOrCreateCategory, count };
}

describe("findOrCreateCategory bounds (VULN-019)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete (globalThis as { __domicileSqlite?: unknown }).__domicileSqlite;
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("stops creating categories once the distinct-category cap is reached", async () => {
    const { findOrCreateCategory, count } = await freshDb("10");
    const ids: (number | null)[] = [];
    for (let i = 0; i < 200; i += 1) {
      ids.push(findOrCreateCategory(`junk-${i}`));
    }
    expect(count()).toBe(10);
    expect(ids.filter((id) => id === null).length).toBe(190);
  });

  it("still resolves an existing category case-insensitively", async () => {
    const { findOrCreateCategory, count } = await freshDb("10");
    const first = findOrCreateCategory("Electronics");
    expect(findOrCreateCategory("  eLeCtRoNiCs ")).toBe(first);
    expect(count()).toBe(1);
  });
});
