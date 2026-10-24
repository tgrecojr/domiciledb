import { expect, test } from "@playwright/test";
import { ensureOnboarded, sampleJpeg } from "./helpers";

test.beforeEach(async ({ page }) => {
	await ensureOnboarded(page);
});

// @spec HOUSEHOLD-HH-006
test("household name and address can be edited after onboarding", async ({
	page,
}) => {
	await page.goto("/household");
	await page.locator('input[name="name"]').fill("Edited Household");
	await page.locator('input[name="address"]').fill("1 Main St");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Saved.")).toBeVisible();

	await page.goto("/");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Edited Household",
	);

	// Restore the shared fixture name for the specs that run after this one.
	await page.goto("/household");
	await page.locator('input[name="name"]').fill("E2E Test Household");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Saved.")).toBeVisible();
});

// @spec HOUSEHOLD-LOC-002, HOUSEHOLD-LOC-003, HOUSEHOLD-LOC-004, HOUSEHOLD-PHOTO-001, HOUSEHOLD-PHOTO-002
test("a location can be added, edited, and given a room photo", async ({
	page,
}) => {
	const name = `Garage ${Date.now()}`;
	await page.goto("/locations");
	await page.locator('input[name="name"]').fill(name);
	await page.locator('select[name="kind"]').selectOption("garage");
	await page.getByRole("button", { name: "Add location" }).click();

	const row = page.locator("li", { hasText: name });
	await expect(row).toContainText("0 items");

	await row.getByRole("link", { name: "Edit" }).click();
	await expect(page).toHaveURL(/\/locations\/\d+\/edit$/);
	await page.locator('textarea[name="description"]').fill("Detached, two cars");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Saved.")).toBeVisible();

	await page.locator('input[name="photos"]').setInputFiles({
		name: "room.jpg",
		mimeType: "image/jpeg",
		buffer: await sampleJpeg(),
	});
	await expect(
		page.locator('img[src^="/api/media/locations/"]').first(),
	).toBeVisible();
});

// @spec HOUSEHOLD-LOC-005, HOUSEHOLD-LOC-006
test("deleting a location needs a confirm and unassigns its items", async ({
	page,
}) => {
	const name = `Shed ${Date.now()}`;
	await page.goto("/locations");
	await page.locator('input[name="name"]').fill(name);
	await page.locator('select[name="kind"]').selectOption("shed");
	await page.getByRole("button", { name: "Add location" }).click();
	await expect(page.locator("li", { hasText: name })).toBeVisible();

	// Capture a title-only draft into the new location.
	await page.goto("/capture");
	await page.locator('input[name="title"]').fill(`Mower ${Date.now()}`);
	await page.locator('select[name="locationId"]').selectOption({ label: name });
	await page.getByRole("button", { name: "Save & finish details" }).click();
	await expect(page).toHaveURL(/\/items\/\d+$/);
	const itemUrl = page.url();

	await page.goto("/locations");
	const row = page.locator("li", { hasText: name });
	await expect(row).toContainText("1 items");
	await row.getByRole("button", { name: "Delete" }).click();
	await expect(row).toContainText("1 item will become unassigned");
	await row.getByRole("button", { name: "Yes, delete" }).click();
	await expect(page).toHaveURL(/\/locations$/);
	await expect(page.locator("li", { hasText: name })).toHaveCount(0);

	await page.goto(itemUrl);
	await expect(page.locator('select[name="locationId"]')).toHaveValue("");
});
