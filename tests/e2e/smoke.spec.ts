import { expect, test } from "@playwright/test";

// @spec PLATFORM-BOOT-005
test("health endpoint reports ok (server booted + migrations applied)", async ({
	request,
}) => {
	const res = await request.get("/api/health");
	expect(res.ok()).toBeTruthy();
	expect(await res.json()).toEqual({ status: "ok" });
});

// @spec PLATFORM-PWA-001
test("home page renders the app shell", async ({ page }) => {
	const res = await page.goto("/");
	expect(res?.ok()).toBeTruthy();
	await expect(page).toHaveTitle(/DomicileDB/);
});

// @spec PLATFORM-PWA-007
test("root declares a light-only color scheme", async ({ page }) => {
	await page.goto("/");
	const scheme = await page.evaluate(
		() => getComputedStyle(document.documentElement).colorScheme,
	);
	expect(scheme).toBe("light");
});
