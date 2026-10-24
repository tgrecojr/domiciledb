import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI apply/discard in isolation: an applied replacement cost is recorded with
 * source `ai` (ENRICH-AI-014 / CURRENT-VAL-010), the outcome distinguishes
 * accepted from edited from rejected (ENRICH-AI-012/013), the interaction must
 * belong to the item (ENRICH-AI-018), and the item must belong to the
 * household (ENRICH-ITEM-018). Queries and Next's cache are stubbed.
 */

const getItem = vi.fn();
const updateItem = vi.fn();
const recordValuations = vi.fn();
const setOutcome = vi.fn();
const getInteraction = vi.fn();
const logInteraction = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/config", () => ({
	config: { ai: { enabled: true, model: "test-model" } },
}));
vi.mock("@/lib/ai/openrouter", () => ({ runTask: vi.fn() }));
vi.mock("@/lib/ai/image", () => ({
	bufferToBase64Jpeg: vi.fn(),
	imageToBase64Jpeg: vi.fn(),
}));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/items", () => ({ getItem, updateItem }));
vi.mock("@/lib/queries/ai", () => ({
	logInteraction,
	setOutcome,
	getInteraction,
}));
vi.mock("@/lib/queries/categories", () => ({
	findOrCreateCategory: vi.fn(() => 3),
}));
vi.mock("@/lib/queries/photos", () => ({ listPhotos: vi.fn(() => []) }));
vi.mock("@/lib/queries/valuations", () => ({ recordValuations }));

const ITEM = 5;
const INTERACTION = 9;

async function actions() {
	return import("@/lib/actions/ai");
}

function expectNothingWritten() {
	expect(updateItem).not.toHaveBeenCalled();
	expect(recordValuations).not.toHaveBeenCalled();
	expect(setOutcome).not.toHaveBeenCalled();
}

beforeEach(() => {
	vi.clearAllMocks();
	getItem.mockReturnValue({ id: ITEM, householdId: 1 });
	getInteraction.mockReturnValue({ id: INTERACTION, itemId: ITEM });
});

// @spec ENRICH-AI-014, CURRENT-VAL-010
it("records an applied replacement cost with source ai", async () => {
	const { applyItemSuggestion } = await actions();
	const res = await applyItemSuggestion(
		ITEM,
		INTERACTION,
		{ replacementCost: "1,200" },
		false,
	);
	expect(res).toEqual({ ok: true });
	expect(recordValuations).toHaveBeenCalledWith(
		ITEM,
		{ replacementCostCents: 120_000 },
		"ai",
	);
});

// @spec ENRICH-AI-012, ENRICH-AI-013
describe("applyItemSuggestion outcome", () => {
	it("marks the interaction accepted when no field was edited", async () => {
		const { applyItemSuggestion } = await actions();
		await applyItemSuggestion(
			ITEM,
			INTERACTION,
			{ manufacturer: "Acme" },
			false,
		);
		expect(setOutcome).toHaveBeenCalledWith(INTERACTION, "accepted");
		expect(updateItem).toHaveBeenCalledWith(ITEM, { manufacturer: "Acme" });
	});

	it("marks the interaction edited when the user changed a field", async () => {
		const { applyItemSuggestion } = await actions();
		await applyItemSuggestion(
			ITEM,
			INTERACTION,
			{ manufacturer: "Acme" },
			true,
		);
		expect(setOutcome).toHaveBeenCalledWith(INTERACTION, "edited");
	});

	it("records no outcome when the suggestion carried no interaction id", async () => {
		const { applyItemSuggestion } = await actions();
		const res = await applyItemSuggestion(
			ITEM,
			null,
			{ manufacturer: "Acme" },
			false,
		);
		expect(res).toEqual({ ok: true });
		expect(setOutcome).not.toHaveBeenCalled();
	});
});

// @spec ENRICH-AI-018
describe("applyItemSuggestion interaction ownership", () => {
	it("writes nothing when the interaction belongs to another item", async () => {
		getInteraction.mockReturnValue({ id: INTERACTION, itemId: ITEM + 1 });
		const { applyItemSuggestion } = await actions();
		const res = await applyItemSuggestion(
			ITEM,
			INTERACTION,
			{ manufacturer: "Acme", replacementCost: "10" },
			false,
		);
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/Unknown suggestion/);
		expectNothingWritten();
	});

	it("writes nothing when the interaction does not exist", async () => {
		getInteraction.mockReturnValue(null);
		const { applyItemSuggestion } = await actions();
		const res = await applyItemSuggestion(
			ITEM,
			INTERACTION,
			{ manufacturer: "Acme" },
			false,
		);
		expect(res.ok).toBe(false);
		expectNothingWritten();
	});
});

// @spec ENRICH-ITEM-018
describe("household ownership of the item", () => {
	it("refuses to apply to an item from another household", async () => {
		getItem.mockReturnValue({ id: ITEM, householdId: 2 });
		const { applyItemSuggestion } = await actions();
		const res = await applyItemSuggestion(
			ITEM,
			INTERACTION,
			{ manufacturer: "Acme" },
			false,
		);
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/Unknown item/);
		expectNothingWritten();
	});

	it("refuses to suggest for an item from another household before logging anything", async () => {
		getItem.mockReturnValue({ id: ITEM, householdId: 2 });
		const { aiSuggestForItem } = await actions();
		const res = await aiSuggestForItem(ITEM, "describe", null);
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/Unknown item/);
		expect(logInteraction).not.toHaveBeenCalled();
	});
});

// @spec ENRICH-AI-013
describe("discardSuggestion", () => {
	it("marks the interaction rejected", async () => {
		const { discardSuggestion } = await actions();
		const res = await discardSuggestion(ITEM, INTERACTION);
		expect(res).toEqual({ ok: true });
		expect(setOutcome).toHaveBeenCalledWith(INTERACTION, "rejected");
	});

	it("records nothing when the interaction belongs to another item", async () => {
		getInteraction.mockReturnValue({ id: INTERACTION, itemId: ITEM + 1 });
		const { discardSuggestion } = await actions();
		const res = await discardSuggestion(ITEM, INTERACTION);
		expect(res.ok).toBe(false);
		expect(setOutcome).not.toHaveBeenCalled();
	});
});
