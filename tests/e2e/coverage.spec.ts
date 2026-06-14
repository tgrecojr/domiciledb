import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded, withAutoSave } from "./helpers";

test("set Coverage B, value an item over the limit → contextual alert + red dashboard widget", async ({
  page,
}) => {
  await ensureOnboarded(page);

  // Set a small Coverage B limit so a single item can cross it.
  await page.goto("/policy");
  await page.locator('input[name="coverageB"]').fill("1000");
  await page.getByRole("button", { name: "Save coverage" }).click();
  await expect(page.getByText("Coverage saved")).toBeVisible();

  // Before any valued item, the dashboard shows "within coverage".
  await page.goto("/");
  await expect(page.getByText("Within coverage")).toBeVisible();

  // Capture an item and give it a replacement cost OVER the limit.
  const itemUrl = await captureDraft(page, `Coverage item ${Date.now()}`);
  await page.goto(itemUrl);
  await page.locator('input[name="replacementCost"]').fill("2000");
  await withAutoSave(page, () =>
    page.locator('input[name="replacementCost"]').blur(),
  );

  // Contextual nudge appears right where the user crossed the threshold.
  await expect(page.getByText(/underinsured/i)).toBeVisible();

  // The ambient dashboard widget now reads red / over.
  await page.goto("/");
  await expect(page.getByText("Over your limit")).toBeVisible();
});

test("approaching the limit shows the amber status", async ({ page }) => {
  await ensureOnboarded(page);

  await page.goto("/policy");
  await page.locator('input[name="coverageB"]').fill("100000");
  await page.getByRole("button", { name: "Save coverage" }).click();
  await expect(page.getByText("Coverage saved")).toBeVisible();

  // $85,000 against a $100,000 limit = 85% → approaching (warn at 80%).
  const itemUrl = await captureDraft(page, `Approaching item ${Date.now()}`);
  await page.goto(itemUrl);
  await page.locator('input[name="replacementCost"]').fill("85000");
  await withAutoSave(page, () =>
    page.locator('input[name="replacementCost"]').blur(),
  );

  await page.goto("/");
  await expect(page.getByText("Approaching your limit")).toBeVisible();
});
