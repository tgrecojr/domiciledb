import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const readFileSpy = vi.fn();

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  readFileSpy.mockImplementation(actual.readFile);
  const patched = { ...actual, readFile: readFileSpy };
  return { ...patched, default: patched };
});

const REL = ["items", "1", "photo-original.jpg"];

function makeMedia(bytes: number) {
  const dataDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "vuln009-unit-"));
  const abs = path.join(dataDir, "media", ...REL);
  fsSync.mkdirSync(path.dirname(abs), { recursive: true });
  fsSync.writeFileSync(abs, Buffer.alloc(bytes, 0x41));
  return { dataDir, abs };
}

async function get(dataDir: string) {
  vi.resetModules();
  vi.stubEnv("DATA_DIR", dataDir);
  const { GET } = await import("@/app/api/media/[...path]/route");
  return GET(new Request("http://x/api/media/items/1/photo-original.jpg"), {
    params: Promise.resolve({ path: REL }),
  });
}

describe("GET /api/media/* memory bounds (VULN-009)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    readFileSpy.mockClear();
  });

  it("streams the file instead of buffering it into the heap", async () => {
    const { dataDir } = makeMedia(64 * 1024);
    const res = await get(dataDir);
    expect(res.status).toBe(200);
    expect(readFileSpy).not.toHaveBeenCalled();
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(64 * 1024);
    fsSync.rmSync(dataDir, { recursive: true, force: true });
  });

  it("refuses a file larger than the serve cap", async () => {
    const { dataDir } = makeMedia(3 * 1024 * 1024);
    vi.stubEnv("MEDIA_MAX_SERVE_MB", "1");
    const res = await get(dataDir);
    expect(res.status).toBe(413);
    expect(readFileSpy).not.toHaveBeenCalled();
    fsSync.rmSync(dataDir, { recursive: true, force: true });
  });
});
