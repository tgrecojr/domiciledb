import { afterEach, describe, expect, it, vi } from "vitest";

/** A File stand-in: the caps must be applied from `size`, before buffering. */
function fakeFile(bytes: number, name = "p.jpg"): File {
  return {
    name,
    size: bytes,
    type: "image/jpeg",
    arrayBuffer: async () => new ArrayBuffer(Math.min(bytes, 1024)),
  } as unknown as File;
}

async function load() {
  vi.resetModules();
  const mod = await import("@/lib/actions/store-photos");
  return mod.storePhotoFiles;
}

describe("storePhotoFiles resource caps (VULN-008)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stores at most the per-request file-count cap", async () => {
    const storePhotoFiles = await load();
    // Same fresh module registry as the store-photos import, so this is the
    // exact config instance the production code read its cap from.
    const { config } = await import("@/lib/config");
    expect(config.uploads.maxFilesPerRequest).toBeLessThan(500);

    const files = Array.from({ length: 500 }, () => fakeFile(1024));
    const stored = await storePhotoFiles(files, "item 1", async () => {});
    // Exactly the configured cap is honoured — no more, no fewer.
    expect(stored).toBe(config.uploads.maxFilesPerRequest);
    expect(stored).toBeLessThan(500);
    expect(stored).toBeGreaterThan(0);
  });

  it("rejects a file larger than the per-file byte cap without reading it", async () => {
    const storePhotoFiles = await load();
    const huge = fakeFile(2 * 1024 * 1024 * 1024, "huge.jpg");
    const read = vi.fn();
    const stored = await storePhotoFiles([huge], "item 1", async () => {
      read();
    });
    expect(stored).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("stores nothing once the DATA_DIR media quota is exhausted", async () => {
    vi.stubEnv("MEDIA_MAX_TOTAL_MB", "0");
    const storePhotoFiles = await load();
    const stored = await storePhotoFiles(
      [fakeFile(1024)],
      "item 1",
      async () => {},
    );
    expect(stored).toBe(0);
  });
});
