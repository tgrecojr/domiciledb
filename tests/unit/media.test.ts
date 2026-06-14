import path from "node:path";
import { describe, expect, it } from "vitest";

import { mediaUrl, resolveMediaPath } from "@/lib/media";

describe("mediaUrl", () => {
  it("maps a DATA_DIR-relative path to the /api media route", () => {
    expect(mediaUrl("media/items/1/abc-web.webp")).toBe(
      "/api/media/items/1/abc-web.webp",
    );
  });
});

describe("resolveMediaPath", () => {
  it("resolves a normal relative path inside the media dir", () => {
    const abs = resolveMediaPath("items/1/abc-web.webp");
    expect(abs).not.toBeNull();
    expect(abs!.endsWith(path.join("items", "1", "abc-web.webp"))).toBe(true);
  });

  it("rejects parent-traversal escapes", () => {
    expect(resolveMediaPath("../../../etc/passwd")).toBeNull();
    expect(resolveMediaPath("items/../../../../etc/passwd")).toBeNull();
  });

  it("rejects absolute-path escapes", () => {
    expect(resolveMediaPath("/etc/passwd")).toBeNull();
  });
});
