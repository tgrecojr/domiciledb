import { expect, test } from "@playwright/test";
import sharp from "sharp";

/** A small valid JPEG generated at runtime (no committed binary fixture). */
async function sampleJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function ensureOnboarded(page: import("@playwright/test").Page) {
  await page.goto("/");
  const createBtn = page.getByRole("button", { name: "Create household" });
  if (await createBtn.isVisible().catch(() => false)) {
    await page.locator('input[name="name"]').fill("E2E Test Household");
    await createBtn.click();
    await expect(
      page.getByRole("button", { name: "Create household" }),
    ).toHaveCount(0);
  }
}

test("capture → draft → worklist → mark complete clears it", async ({
  page,
}) => {
  await ensureOnboarded(page);

  const title = `E2E item ${Date.now()}`;

  // Quick capture: attach a photo, give it a title, finish with details.
  await page.goto("/capture");
  await page
    .locator('input[name="photos"]')
    .setInputFiles({
      name: "sample.jpg",
      mimeType: "image/jpeg",
      buffer: await sampleJpeg(),
    });
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "Save & finish details" }).click();

  // Lands on the item detail page (draft).
  await expect(page).toHaveURL(/\/items\/\d+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const itemUrl = page.url();

  // The processed photo is served and renders (web variant).
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
