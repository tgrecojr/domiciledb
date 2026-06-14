import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded } from "./helpers";

// Encoded so the HTTP client doesn't normalize the `..` away before it reaches
// the server (a raw `../` would be collapsed client-side).
const TRAVERSAL_PAYLOADS = [
  "/api/media/..%2f..%2f..%2f..%2f..%2fetc%2fpasswd",
  "/api/media/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "/api/media/items%2f..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd",
  "/api/media/..%2F..%2F..%2Fetc%2Fhostname",
  "/api/media/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
];

test("media route serves stored files with anti-sniffing headers", async ({
  page,
}) => {
  await ensureOnboarded(page);
  const itemUrl = await captureDraft(page, `Sec item ${Date.now()}`);
  await page.goto(itemUrl);

  const src = await page
    .locator('img[src^="/api/media/"]')
    .first()
    .getAttribute("src");
  expect(src).toBeTruthy();

  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/");
  // Must not be MIME-sniffable into something executable.
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("media route refuses path-traversal and never leaks host files", async ({
  page,
}) => {
  for (const payload of TRAVERSAL_PAYLOADS) {
    const res = await page.request.get(payload, { maxRedirects: 0 });
    expect(res.status(), `${payload} should not 200`).not.toBe(200);
    const body = await res.text().catch(() => "");
    // No /etc/passwd or /etc/hostname contents ever come back.
    expect(body, `${payload} leaked file contents`).not.toContain("root:");
    expect(body.toLowerCase()).not.toContain("/bin/bash");
  }
});

test("media route rejects a NUL-byte path", async ({ page }) => {
  const res = await page.request.get("/api/media/items%2f1%2fa%00.webp", {
    maxRedirects: 0,
  });
  expect(res.status()).not.toBe(200);
});
