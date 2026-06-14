import { expect, test } from "@playwright/test";

test("health endpoint reports ok (server booted + migrations applied)", async ({
  request,
}) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: "ok" });
});

test("home page renders the app shell", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/DomicileDB/);
});
