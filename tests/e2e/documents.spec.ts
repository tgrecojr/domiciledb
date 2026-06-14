import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded, sampleJpeg } from "./helpers";

test("attach a receipt to an item and see it listed", async ({ page }) => {
  await ensureOnboarded(page);

  const itemUrl = await captureDraft(page, `Doc item ${Date.now()}`);
  await page.goto(itemUrl);

  await page.locator('input[name="document"]').setInputFiles({
    name: "receipt.jpg",
    mimeType: "image/jpeg",
    buffer: await sampleJpeg(),
  });
  await page.getByRole("button", { name: "Attach" }).click();

  // The document appears in the item's Documents list, tagged as a receipt.
  const docLink = page.getByRole("link", { name: /receipt\.jpg/ });
  await expect(docLink).toBeVisible();
  await expect(docLink).toContainText("Receipt");
  // And it is served from the media route.
  await expect(docLink).toHaveAttribute("href", /^\/api\/media\//);
});
