import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Verifies processAndStoreImage actually produces the three stored variants at
 * the right sizes/formats (the proof packet + UI depend on these). Uses a temp
 * DATA_DIR so config writes there.
 */

let processAndStoreImage: typeof import("@/lib/media").processAndStoreImage;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "domicile-media-"));
  process.env.DATA_DIR = dataDir;
  ({ processAndStoreImage } = await import("@/lib/media"));
});

describe("processAndStoreImage", () => {
  it("writes original + web(<=1024) + thumb(320) variants and reports dimensions", async () => {
    const source = await sharp({
      create: {
        width: 1500,
        height: 1000,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const stored = await processAndStoreImage(1, source, "image/jpeg");

    // Reported dimensions come from the source.
    expect(stored.width).toBe(1500);
    expect(stored.height).toBe(1000);
    expect(stored.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // All three files exist on disk.
    for (const rel of [stored.pathOriginal, stored.pathWeb, stored.pathThumb]) {
      expect(fs.existsSync(path.join(dataDir, rel))).toBe(true);
    }

    // Web variant: webp, long edge clamped to 1024.
    const web = await sharp(path.join(dataDir, stored.pathWeb)).metadata();
    expect(web.format).toBe("webp");
    expect(Math.max(web.width!, web.height!)).toBe(1024);

    // Thumb variant: webp, 320×320 cover crop.
    const thumb = await sharp(path.join(dataDir, stored.pathThumb)).metadata();
    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBe(320);
    expect(thumb.height).toBe(320);

    // Original is kept untouched (same bytes we passed in).
    const original = fs.readFileSync(path.join(dataDir, stored.pathOriginal));
    expect(original.equals(source)).toBe(true);
  });
});
