import { expect, test } from "@playwright/test";

import { captureDraft, ensureOnboarded } from "./helpers";

test("export downloads a valid zip; backup shows disabled (no-op) without S3", async ({
  page,
}) => {
  await ensureOnboarded(page);
  await captureDraft(page, `Export item ${Date.now()}`);

  // With no S3 configured in e2e, the backup section is the disabled no-op state.
  await page.goto("/resilience");
  await expect(page.getByText("Not configured")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back up now" }),
  ).toBeDisabled();

  // Full export downloads a real ZIP (PK magic bytes).
  const res = await page.request.get("/api/export");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("application/zip");
  const body = await res.body();
  expect(body.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(body.length).toBeGreaterThan(100);
});
