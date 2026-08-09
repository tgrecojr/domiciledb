import { beforeEach, describe, expect, it, vi } from "vitest";

const createSnapshot = vi.fn(() => ({ path: "/dev/null", bytes: 1 }));

vi.mock("@/lib/queries/household", () => ({
  getHouseholdId: async () => 1,
}));
vi.mock("@/lib/backup/snapshot", () => ({ createSnapshot }));
vi.mock("archiver", async () => {
  const { Readable } = await import("node:stream");
  class ZipArchive extends Readable {
    file() {}
    directory() {}
    async finalize() {
      this.push("zip");
      this.push(null);
    }
    override _read() {}
  }
  return { ZipArchive };
});

async function drain(res: Response) {
  if (res.body) await new Response(res.body).arrayBuffer();
}

describe("GET /api/export throttling (VULN-002)", () => {
  beforeEach(() => {
    vi.resetModules();
    createSnapshot.mockClear();
  });

  it("runs only one export when requests arrive concurrently", async () => {
    const { GET } = await import("@/app/api/export/route");
    const responses = await Promise.all([GET(), GET(), GET(), GET(), GET()]);
    await Promise.all(responses.map(drain));

    const okCount = responses.filter((r) => r.status === 200).length;
    const throttled = responses.filter((r) => r.status === 429);
    expect(okCount).toBe(1);
    expect(throttled).toHaveLength(4);
    expect(createSnapshot).toHaveBeenCalledTimes(1);
  });

  it("rejects a follow-up export inside the minimum interval", async () => {
    const { GET } = await import("@/app/api/export/route");
    const first = await GET();
    await drain(first);
    expect(first.status).toBe(200);

    const second = await GET();
    await drain(second);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(createSnapshot).toHaveBeenCalledTimes(1);
  });
});
