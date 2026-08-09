import { describe, expect, it, vi } from "vitest";

import { storePhotoFiles } from "@/lib/actions/store-photos";
import {
  detectFileType,
  sniffDocumentMime,
  sniffImageMime,
} from "@/lib/image-format";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = new TextEncoder().encode("GIF89a\x00");
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);
const TIFF = Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
const PDF = new TextEncoder().encode("%PDF-1.7\n");

function file(bytes: Uint8Array, type: string): File {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new File([ab], "upload.png", { type });
}

describe("detectFileType (VULN-012 content sniffing)", () => {
  it("recognizes allowed and disallowed formats by magic bytes", () => {
    expect(detectFileType(Buffer.from(PNG))).toBe("png");
    expect(detectFileType(Buffer.from(JPEG))).toBe("jpeg");
    expect(detectFileType(Buffer.from(GIF))).toBe("gif");
    expect(detectFileType(Buffer.from(SVG))).toBe("svg");
    expect(detectFileType(Buffer.from(TIFF))).toBe("tiff");
    expect(detectFileType(Buffer.from(PDF))).toBe("pdf");
  });
});

describe("sniffImageMime / sniffDocumentMime allowlists (VULN-012)", () => {
  it("admits only the explicit image decoder allowlist", () => {
    expect(sniffImageMime(Buffer.from(PNG))).toBe("image/png");
    expect(sniffImageMime(Buffer.from(JPEG))).toBe("image/jpeg");
    // svg/gif/tiff decoders are out of scope — reject them.
    expect(sniffImageMime(Buffer.from(GIF))).toBeNull();
    expect(sniffImageMime(Buffer.from(SVG))).toBeNull();
    expect(sniffImageMime(Buffer.from(TIFF))).toBeNull();
    expect(sniffImageMime(Buffer.from(PDF))).toBeNull();
  });

  it("documents additionally allow PDF but not svg/gif/tiff", () => {
    expect(sniffDocumentMime(Buffer.from(PDF))).toBe("application/pdf");
    expect(sniffDocumentMime(Buffer.from(PNG))).toBe("image/png");
    expect(sniffDocumentMime(Buffer.from(GIF))).toBeNull();
    expect(sniffDocumentMime(Buffer.from(SVG))).toBeNull();
    expect(sniffDocumentMime(Buffer.from(TIFF))).toBeNull();
  });
});

describe("storePhotoFiles admission on sniffed content (VULN-012)", () => {
  it("rejects GIF/SVG bytes even when the client MIME claims image/png", async () => {
    const store = vi.fn(async () => {});
    const stored = await storePhotoFiles(
      [file(GIF, "image/png"), file(SVG, "image/png")],
      "test",
      store,
    );
    expect(stored).toBe(0);
    expect(store).not.toHaveBeenCalled();
  });

  it("admits real image bytes and hands the store the sniffed MIME", async () => {
    const seen: string[] = [];
    const stored = await storePhotoFiles(
      // wrong/generic client MIME — admission must use the actual bytes
      [file(PNG, "application/octet-stream")],
      "test",
      async (_buf, mime) => {
        seen.push(mime);
      },
    );
    expect(stored).toBe(1);
    expect(seen).toEqual(["image/png"]);
  });
});
