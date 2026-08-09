import { afterEach, describe, expect, it, vi } from "vitest";

import { storePhotoFiles } from "@/lib/actions/store-photos";

/**
 * VULN-012 / VULN-016: admission is decided on the sniffed bytes, and the
 * attacker-controlled filename is sanitized before it reaches the log.
 *
 * VULN-008: the batch is bounded by a per-request file count, a per-file byte
 * cap read from `size` (before buffering), and the DATA_DIR media quota.
 */

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function file(name: string): File {
  const ab = new ArrayBuffer(PNG.byteLength);
  new Uint8Array(ab).set(PNG);
  return new File([ab], name, { type: "image/png" });
}

/**
 * A File stand-in whose declared `size` is huge but whose bytes are a small
 * real PNG: the caps must be applied from `size`, before the file is buffered,
 * while still being admitted by content sniffing when they pass.
 */
function fakeFile(bytes: number, name = "p.png"): File {
  return {
    name,
    size: bytes,
    type: "image/png",
    arrayBuffer: async () => {
      const ab = new ArrayBuffer(PNG.byteLength);
      new Uint8Array(ab).set(PNG);
      return ab;
    },
  } as unknown as File;
}

async function load() {
  vi.resetModules();
  const mod = await import("@/lib/actions/store-photos");
  return mod.storePhotoFiles;
}

afterEach(() => vi.restoreAllMocks());

describe("storePhotoFiles log sanitization (VULN-016)", () => {
  it("strips CR/LF and control chars from the filename before logging", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await storePhotoFiles(
      [file("ok.png\r\n[capture] FORGED ADMIN LINE")],
      "test",
      async () => {
        throw new Error("boom");
      },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]?.[0] ?? "");
    // The injection vector is the newline that forges a second log line; with
    // it stripped, the payload text cannot start its own entry.
    expect(logged).not.toMatch(CONTROL_CHARS);
    expect(logged.split("\n")).toHaveLength(1);
  });

  it("bounds an over-long filename in the log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await storePhotoFiles(
      [file("a".repeat(5000) + ".png")],
      "test",
      async () => {
        throw new Error("boom");
      },
    );
    const logged = String(spy.mock.calls[0]?.[0] ?? "");
    expect(logged.length).toBeLessThan(1000);
  });
});

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
    const huge = fakeFile(2 * 1024 * 1024 * 1024, "huge.png");
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

describe("storePhotoFiles content-sniffed admission (VULN-012)", () => {
  it("rejects bytes that are not an allowlisted image, whatever File.type says", async () => {
    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'],
      "evil.png",
      { type: "image/png" },
    );
    const store = vi.fn(async () => {});
    const stored = await storePhotoFiles([svg], "test", store);
    expect(stored).toBe(0);
    expect(store).not.toHaveBeenCalled();
  });

  it("hands the store callback the sniffed MIME, not the claimed one", async () => {
    const mislabelled = new File([PNG], "photo.jpg", { type: "image/jpeg" });
    const store = vi.fn(async () => {});
    const stored = await storePhotoFiles([mislabelled], "test", store);
    expect(stored).toBe(1);
    expect(store).toHaveBeenCalledWith(expect.anything(), "image/png");
  });
});
