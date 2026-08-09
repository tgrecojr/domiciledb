import { afterEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn(async () => {});
const listKeys = vi.fn(async () => new Set<string>());
const createSnapshot = vi.fn(() => ({ path: "/dev/null", bytes: 1 }));

vi.mock("@/lib/backup/s3", () => ({ putObject, listKeys, getObject: vi.fn() }));
vi.mock("@/lib/backup/snapshot", () => ({ createSnapshot }));
vi.mock("@/lib/pdf/render", () => ({
  renderProofPacket: vi.fn(async () => Buffer.from("%PDF")),
}));
vi.mock("@/lib/queries/report", () => ({ getReportPacket: () => null }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ limit: () => ({ get: () => null }) }) }),
  },
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const patched = {
    ...actual,
    readFileSync: vi.fn(() => Buffer.from("snapshot")),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
  };
  return { ...patched, default: patched };
});

describe("runBackup single-flight (VULN-011)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("collapses overlapping callers into one run", async () => {
    vi.resetModules();
    vi.stubEnv("S3_BUCKET", "backups");
    const { runBackup } = await import("@/lib/backup/run");
    const now = new Date().toISOString();
    const results = await Promise.all([
      runBackup(now),
      runBackup(now),
      runBackup(now),
      runBackup(now),
    ]);

    expect(createSnapshot).toHaveBeenCalledTimes(1);
    expect(listKeys).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === results[0]!.status)).toBe(true);
  });
});
