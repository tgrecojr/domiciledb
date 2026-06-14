import { expect, test, type Page } from "@playwright/test";

import { captureDraft, ensureOnboarded } from "./helpers";

/** Whole-dollar "$X inventoried of …" total from the dashboard coverage widget. */
async function inventoriedDollars(page: Page): Promise<number> {
  await page.goto("/");
  const txt =
    (await page
      .getByText(/inventoried of/)
      .first()
      .textContent()) ?? "";
  const m = txt.match(/\$([\d,]+)\s+inventoried/);
  if (!m) throw new Error(`no inventoried total in: ${txt}`);
  return Number(m[1]!.replace(/,/g, ""));
}

test("editing rejects an empty title and does not save", async ({ page }) => {
  await ensureOnboarded(page);
  const itemUrl = await captureDraft(page, `Edit item ${Date.now()}`);
  await page.goto(itemUrl);

  await page.locator('input[name="title"]').fill("");
  await page.getByRole("button", { name: "Save details" }).click();

  await expect(page.getByText("Title is required")).toBeVisible();
});

test("marking an item sold drops it from the coverage total", async ({
  page,
}) => {
  await ensureOnboarded(page);

  // A high limit keeps status stable; we assert the relative total change.
  await page.goto("/policy");
  await page.locator('input[name="coverageB"]').fill("100000000");
  await page.getByRole("button", { name: "Save coverage" }).click();
  await expect(page.getByText("Coverage saved")).toBeVisible();

  const itemUrl = await captureDraft(page, `Sellable ${Date.now()}`);
  await page.goto(itemUrl);
  await page.locator('input[name="replacementCost"]').fill("5000");
  await page.getByRole("button", { name: "Save details" }).click();

  const before = await inventoriedDollars(page);

  // Mark it sold -> it must leave the active coverage total.
  await page.goto(itemUrl);
  await page.locator('select[name="lifecycleStatus"]').selectOption("sold");
  await page.getByRole("button", { name: "Save details" }).click();

  const after = await inventoriedDollars(page);
  expect(before - after).toBe(5000);
});
