import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * VULN-023 (CWE-524 + CWE-312): inventory photos and documents must not be
 * pinned in an on-device HTTP cache. The media route may only hand out a
 * private, short-lived, revalidated policy — never a long-lived immutable one.
 */

const DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/vuln023-${process.pid}`;
process.env.DATA_DIR = DATA_DIR;

const FILES: Array<{ parts: string[]; body: string }> = [
  { parts: ["items", "1", "receipt-web.webp"], body: "RIFFfake-photo" },
  { parts: ["documents", "items", "1", "policy.pdf"], body: "%PDF-1.4 fake" },
];

for (const { parts, body } of FILES) {
  const abs = path.join(DATA_DIR, "media", ...parts);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

afterAll(() => fs.rmSync(DATA_DIR, { recursive: true, force: true }));

function directives(cacheControl: string | null): string[] {
  return (cacheControl ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

describe("VULN-023 media cache policy", () => {
  it.each(FILES.map((f) => f.parts))(
    "serves /api/media/%s/%s with a private, non-persistent policy",
    async (...parts: string[]) => {
      const { GET } = await import("@/app/api/media/[...path]/route");
      const res = await GET(
        new Request(`http://localhost/api/media/${parts.join("/")}`),
        { params: Promise.resolve({ path: parts }) },
      );

      expect(res.status).toBe(200);

      const cc = res.headers.get("Cache-Control");
      const parsed = directives(cc);

      expect(parsed).toContain("private");
      expect(parsed).not.toContain("public");
      // `immutable` tells the device it never has to revalidate — the copy
      // survives deletion of the item in the app.
      expect(parsed).not.toContain("immutable");

      const maxAge = Number(
        /(?:^|,\s*)max-age=(\d+)/.exec(cc ?? "")?.[1] ?? "0",
      );
      // Either no stored copy at all, or one that expires immediately and must
      // be revalidated before reuse.
      expect(parsed.includes("no-store") || maxAge === 0).toBe(true);
      expect(maxAge).toBeLessThanOrEqual(60);
    },
  );
});
