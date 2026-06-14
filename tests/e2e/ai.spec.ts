import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded, sampleJpeg } from "./helpers";

test("AI identify: consent shows what's sent, then review applies to the item", async ({
  page,
}) => {
  await ensureOnboarded(page);
  const itemUrl = await captureDraft(page, `AI item ${Date.now()}`);
  await page.goto(itemUrl);

  // The opt-in panel is present (AI enabled via fake provider in e2e).
  await expect(page.getByText("AI assist")).toBeVisible();

  // Choosing a task shows the consent manifest BEFORE anything is sent.
  await page.getByRole("button", { name: "Identify item" }).click();
  await expect(page.getByText(/Will be sent to fake\/model/)).toBeVisible();
  await expect(page.getByText(/Prompt:/)).toBeVisible();

  // Confirm -> the fake provider returns a suggestion to review (not yet saved).
  await page.getByRole("button", { name: "Send to AI" }).click();
  const aiPanel = page.locator("section", { hasText: "AI assist" });
  await expect(aiPanel.getByText("Review the AI suggestion")).toBeVisible();
  await expect(aiPanel.locator('input[name="manufacturer"]')).toHaveValue(
    "Sony",
  );

  // Apply the (reviewed) suggestion; the panel resets afterward.
  await page.getByRole("button", { name: "Apply to item" }).click();
  await expect(page.getByText("Review the AI suggestion")).toHaveCount(0);

  // Reload: the applied value persisted to the item.
  await page.reload();
  await expect(page.locator('input[name="manufacturer"]')).toHaveValue("Sony");
});

test("AI dec-page parse pre-fills Coverage B for review", async ({ page }) => {
  await ensureOnboarded(page);

  await page.goto("/policy");
  await expect(
    page.getByText(/Pre-fill from your declarations page/),
  ).toBeVisible();

  // Selecting a file surfaces the consent step; no auto-send.
  await page.locator('input[type="file"]').setInputFiles({
    name: "decpage.jpg",
    mimeType: "image/jpeg",
    buffer: await sampleJpeg(),
  });
  await expect(page.getByRole("button", { name: "Send to AI" })).toBeVisible();
  await page.getByRole("button", { name: "Send to AI" }).click();

  // The fake dec-page result pre-fills Coverage B = 456750 for confirmation.
  const decPanel = page.locator("section", {
    hasText: "Pre-fill from your declarations page",
  });
  await expect(decPanel.getByText("Review extracted coverages")).toBeVisible();
  await expect(decPanel.locator('input[name="coverageB"]')).toHaveValue(
    "456750",
  );
});
