import { afterEach, describe, expect, it, vi } from "vitest";

import { storePhotoFiles } from "@/lib/actions/store-photos";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function file(name: string): File {
  const ab = new ArrayBuffer(PNG.byteLength);
  new Uint8Array(ab).set(PNG);
  return new File([ab], name, { type: "image/png" });
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
