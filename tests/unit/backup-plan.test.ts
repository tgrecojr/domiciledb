import { describe, expect, it } from "vitest";

import { keyForPath, mediaToUpload } from "@/lib/backup/plan";

describe("mediaToUpload", () => {
  it("returns only keys not already present in S3", () => {
    const local = ["media/items/1/a.jpg", "media/items/1/b.jpg"];
    const existing = new Set(["media/items/1/a.jpg"]);
    expect(mediaToUpload(local, existing)).toEqual(["media/items/1/b.jpg"]);
  });

  it("uploads everything when the bucket is empty", () => {
    const local = ["media/x", "media/y"];
    expect(mediaToUpload(local, new Set())).toEqual(local);
  });

  it("uploads nothing when all keys exist", () => {
    const local = ["media/x"];
    expect(mediaToUpload(local, new Set(local))).toEqual([]);
  });
});

describe("keyForPath", () => {
  it("maps an absolute path under dataDir to a posix-relative key", () => {
    expect(keyForPath("/data/media/items/1/a.jpg", "/data")).toBe(
      "media/items/1/a.jpg",
    );
  });

  it("strips leading slashes and normalizes separators", () => {
    expect(keyForPath("/data/backup/snap.db", "/data")).toBe("backup/snap.db");
    expect(keyForPath("C:\\data\\media\\a.jpg", "C:\\data")).toBe(
      "media/a.jpg",
    );
  });
});
