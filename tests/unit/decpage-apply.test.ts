import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * applyDecPagePolicy / discardDecPage: an applied dec-page parse is saved with
 * source `ai` and the originating interaction's outcome is recorded; an
 * interaction tied to an item is not a dec-page parse and is refused.
 * COVERAGE-DECPAGE-007.
 */

const upsertPolicy = vi.fn();
const setOutcome = vi.fn();
const getInteraction = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/policy", () => ({
	upsertPolicy,
	getPolicy: vi.fn(() => null),
}));
vi.mock("@/lib/queries/ai", () => ({ setOutcome, getInteraction }));

const INTERACTION = 4;

async function actions() {
	return import("@/lib/actions/policy");
}

beforeEach(() => {
	vi.clearAllMocks();
	getInteraction.mockReturnValue({ id: INTERACTION, itemId: null });
});

// @spec COVERAGE-DECPAGE-007
describe("applyDecPagePolicy provenance", () => {
	it("saves the policy with source ai and marks the interaction accepted", async () => {
		const { applyDecPagePolicy } = await actions();
		const res = await applyDecPagePolicy(
			{ coverageB: "456,750" },
			INTERACTION,
			false,
		);
		expect(res).toEqual({ ok: true });
		expect(upsertPolicy).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ coverageBPersonalProperty: 45_675_000 }),
			"ai",
		);
		expect(setOutcome).toHaveBeenCalledWith(INTERACTION, "accepted");
	});

	it("marks the interaction edited when the user changed a field", async () => {
		const { applyDecPagePolicy } = await actions();
		await applyDecPagePolicy({ coverageB: "456,750" }, INTERACTION, true);
		expect(setOutcome).toHaveBeenCalledWith(INTERACTION, "edited");
	});

	it("still saves with source ai when no interaction id is known", async () => {
		const { applyDecPagePolicy } = await actions();
		const res = await applyDecPagePolicy({ coverageB: "456,750" }, null, false);
		expect(res).toEqual({ ok: true });
		expect(upsertPolicy).toHaveBeenCalledWith(1, expect.anything(), "ai");
		expect(setOutcome).not.toHaveBeenCalled();
	});

	it("refuses an interaction that belongs to an item and writes nothing", async () => {
		getInteraction.mockReturnValue({ id: INTERACTION, itemId: 12 });
		const { applyDecPagePolicy } = await actions();
		const res = await applyDecPagePolicy(
			{ coverageB: "456,750" },
			INTERACTION,
			false,
		);
		expect(res).toEqual({ ok: false });
		expect(upsertPolicy).not.toHaveBeenCalled();
		expect(setOutcome).not.toHaveBeenCalled();
	});
});

// @spec COVERAGE-DECPAGE-007
describe("discardDecPage", () => {
	it("marks the interaction rejected", async () => {
		const { discardDecPage } = await actions();
		expect(await discardDecPage(INTERACTION)).toEqual({ ok: true });
		expect(setOutcome).toHaveBeenCalledWith(INTERACTION, "rejected");
	});

	it("records nothing for an interaction that belongs to an item", async () => {
		getInteraction.mockReturnValue({ id: INTERACTION, itemId: 12 });
		const { discardDecPage } = await actions();
		expect(await discardDecPage(INTERACTION)).toEqual({ ok: false });
		expect(setOutcome).not.toHaveBeenCalled();
	});
});
