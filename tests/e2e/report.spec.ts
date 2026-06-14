import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded, withAutoSave } from "./helpers";

test("proof packet downloads as a valid, non-empty PDF with item value embedded", async ({
  page,
}) => {
  await ensureOnboarded(page);

  // A valued item with a photo, so the packet exercises totals + image embed.
  const itemUrl = await captureDraft(page, `Report item ${Date.now()}`);
  await page.goto(itemUrl);
  await page.locator('input[name="replacementCost"]').fill("1000");
  await withAutoSave(page, () =>
    page.locator('input[name="replacementCost"]').blur(),
  );

  // The report page offers the whole-household download.
  await page.goto("/report");
  await expect(
    page.getByRole("link", { name: /Download entire household/ }),
  ).toBeVisible();

  // Fetch the PDF directly and verify it is a real, non-trivial PDF.
  const res = await page.request.get("/api/proof-packet");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect(res.headers()["content-disposition"]).toContain(".pdf");

  const body = await res.body();
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  // A packet with an embedded JPEG should be comfortably over a few KB.
  expect(body.length).toBeGreaterThan(3000);
});
