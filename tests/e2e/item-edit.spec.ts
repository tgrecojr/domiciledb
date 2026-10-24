import { expect, type Page, test } from "@playwright/test";

import { captureDraft, ensureOnboarded, withAutoSave } from "./helpers";

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

// @spec ENRICH-ITEM-004
test("editing rejects an empty title and does not save", async ({ page }) => {
	await ensureOnboarded(page);
	const itemUrl = await captureDraft(page, `Edit item ${Date.now()}`);
	await page.goto(itemUrl);

	// Clearing the title and blurring triggers an auto-save attempt, which the
	// form rejects client-side without persisting.
	await page.locator('input[name="title"]').fill("");
	await page.locator('input[name="title"]').blur();

	await expect(page.getByTestId("save-status")).toHaveText("Title is required");
});

// @spec CURRENT-LIFE-003
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
	await withAutoSave(page, () =>
		page.locator('input[name="replacementCost"]').blur(),
	);

	const before = await inventoriedDollars(page);

	// Mark it sold -> it must leave the active coverage total.
	await page.goto(itemUrl);
	await withAutoSave(page, () =>
		page.locator('select[name="lifecycleStatus"]').selectOption("sold"),
	);

	const after = await inventoriedDollars(page);
	expect(before - after).toBe(5000);
});

// @spec ENRICH-ITEM-005
test("a debounced edit is flushed when the user leaves the page", async ({
	page,
}) => {
	await ensureOnboarded(page);
	const itemUrl = await captureDraft(page, `Flush item ${Date.now()}`);
	await page.goto(itemUrl);

	// Change the field WITHOUT focusing it (a Playwright fill() focuses, and the
	// later click would then blur it — saving through the blur path and proving
	// nothing about the unmount flush). Set the value through the native setter
	// and fire `input` so React's onChange arms the 800 ms debounce.
	const manufacturer = `Flushed ${Date.now()}`;
	await page.locator('input[name="manufacturer"]').evaluate((el, value) => {
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		if (!setter) throw new Error("no native value setter");
		setter.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	}, manufacturer);

	// Leave through the in-app back link (a client-side navigation, so the
	// editor unmounts) well inside the debounce window. A hard navigation such
	// as page.goto tears the document down without running React cleanups and
	// would not exercise the flush. The only POST that can follow is the
	// flushed save.
	const flushed = page.waitForResponse(
		(r) => r.request().method() === "POST" && r.status() < 400,
	);
	// The header's back link, not the bottom-nav "Items" tab.
	await page.locator("header").getByRole("link", { name: /Items/ }).click();
	await flushed;

	await page.goto(itemUrl);
	await expect(page.locator('input[name="manufacturer"]')).toHaveValue(
		manufacturer,
	);
});
