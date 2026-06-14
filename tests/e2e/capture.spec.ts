import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded, largeJpeg } from "./helpers";

test("capture → draft → worklist → mark complete clears it", async ({
  page,
}) => {
  await ensureOnboarded(page);

  const title = `E2E item ${Date.now()}`;
  const itemUrl = await captureDraft(page, title);

  // Lands on the item detail page (draft) with the title and processed photo.
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator('img[src^="/api/media/"]').first()).toBeVisible();

  // It shows up in the "to finish" worklist while it's a draft.
  await page.goto("/worklist");
  await expect(page.getByText(title)).toBeVisible();

  // Mark complete from the detail page.
  await page.goto(itemUrl);
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(
    page.getByRole("button", { name: "Move back to drafts" }),
  ).toBeVisible();

  // Now it's gone from the worklist.
  await page.goto("/worklist");
  await expect(page.getByText(title)).toHaveCount(0);
});

test("deletes an item (created by accident) and removes it from the inventory", async ({
  page,
}) => {
  await ensureOnboarded(page);
  const title = `Delete me ${Date.now()}`;
  const itemUrl = await captureDraft(page, title);

  await page.goto(itemUrl);
  // Two-step confirm guards against accidental deletion.
  await page.getByRole("button", { name: "Delete item" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();

  // Redirected to the items list, and the item is gone.
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.getByText(title)).toHaveCount(0);
});

test("captures a large (>1MB) photo without hitting the Server Action body limit", async ({
  page,
}) => {
  await ensureOnboarded(page);

  const big = await largeJpeg();
  expect(big.length).toBeGreaterThan(1_000_000);

  await page.goto("/capture");
  await page.locator('input[name="photos"]').setInputFiles({
    name: "iphone.jpg",
    mimeType: "image/jpeg",
    buffer: big,
  });
  await page.locator('input[name="title"]').fill(`Large photo ${Date.now()}`);
  await page.getByRole("button", { name: "Save & finish details" }).click();

  // Reaches the item page (would 413 under the default 1 MB limit) and the
  // processed photo serves.
  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.locator('img[src^="/api/media/"]').first()).toBeVisible();
});
