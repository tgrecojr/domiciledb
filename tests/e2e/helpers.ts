import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

/** A small valid JPEG generated at runtime (no committed binary fixture). */
export async function sampleJpeg(): Promise<Buffer> {
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

/**
 * A random-noise JPEG comfortably larger than 1 MB (noise can't be compressed
 * away), to exercise the Server Action body-size limit like a real phone photo.
 */
export async function largeJpeg(): Promise<Buffer> {
  const size = 2200;
  const raw = randomBytes(size * size * 3);
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function ensureOnboarded(page: Page) {
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

/** Quick-capture a draft item with a photo + title; returns its detail URL. */
export async function captureDraft(page: Page, title: string): Promise<string> {
  await page.goto("/capture");
  await page.locator('input[name="photos"]').setInputFiles({
    name: "sample.jpg",
    mimeType: "image/jpeg",
    buffer: await sampleJpeg(),
  });
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "Save & finish details" }).click();
  await expect(page).toHaveURL(/\/items\/\d+$/);
  return page.url();
}
