import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded } from "./helpers";

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
