import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The /report page knows the proof-packet item cap: above it, the
 * whole-household download would be refused with 413, so the page says so and
 * points at the per-location / per-category packets instead.
 */

const countActiveItems = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/app-shell", () => ({
	AppShell: ({ children }: { children: ReactNode }) =>
		createElement("div", null, children),
}));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/locations", () => ({
	listLocations: vi.fn(() => [{ id: 3, name: "Garage" }]),
}));
vi.mock("@/lib/queries/categories", () => ({
	listCategories: vi.fn(() => [{ id: 9, name: "Tools" }]),
}));
vi.mock("@/lib/queries/items", () => ({ countActiveItems }));

async function render(): Promise<string> {
	const { default: ReportPage } = await import("@/app/report/page");
	return renderToStaticMarkup(await ReportPage());
}

// @spec PACKET-ROUTE-005
describe("/report and the proof-packet item cap", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		vi.clearAllMocks();
	});

	it("offers the whole-household download while under the cap", async () => {
		vi.resetModules();
		vi.stubEnv("PROOF_PACKET_MAX_ITEMS", "50");
		countActiveItems.mockReturnValue(10);
		const markup = await render();
		expect(markup).toContain('href="/api/proof-packet"');
		expect(markup).not.toMatch(/limited to 50/);
	});

	it("explains the cap and withholds the whole-household link above it", async () => {
		vi.resetModules();
		vi.stubEnv("PROOF_PACKET_MAX_ITEMS", "50");
		countActiveItems.mockReturnValue(5000);
		const markup = await render();
		expect(markup).not.toContain('href="/api/proof-packet"');
		expect(markup).toMatch(/5,?000 active items/);
		expect(markup).toMatch(/limited to 50/);
		// The narrower packets are still offered.
		expect(markup).toContain('href="/api/proof-packet?location=3"');
		expect(markup).toContain('href="/api/proof-packet?category=9"');
	});
});
