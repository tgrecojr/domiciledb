import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The item write actions in isolation: household ownership and fail-closed id
 * parsing (ENRICH-ITEM-018, PLATFORM-DATA-007), and the editor's money
 * validation (ENRICH-ITEM-012). Queries, storage, and Next's redirect are
 * stubbed; the redirect stub throws like the real one so code after it never
 * runs.
 */

class RedirectSignal extends Error {
	constructor(public readonly url: string) {
		super(`redirect:${url}`);
	}
}

const getItem = vi.fn();
const updateItem = vi.fn();
const setItemStatus = vi.fn();
const deleteItem = vi.fn();
const recordValuations = vi.fn();
const storeItemPhotos = vi.fn();
const deleteItemMedia = vi.fn();
const getCoverageSummary = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new RedirectSignal(url);
	},
}));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/items", () => ({
	getItem,
	updateItem,
	setItemStatus,
	deleteItem,
}));
vi.mock("@/lib/queries/valuations", () => ({ recordValuations }));
vi.mock("@/lib/queries/coverage", () => ({ getCoverageSummary }));
vi.mock("@/lib/media", () => ({ deleteItemMedia }));
vi.mock("@/lib/actions/store-photos", () => ({ storeItemPhotos }));

type RedirectingAction = (fd: FormData) => Promise<void>;

async function redirectOf(
	action: RedirectingAction,
	fd: FormData,
): Promise<string> {
	try {
		await action(fd);
	} catch (e) {
		if (e instanceof RedirectSignal) return e.url;
		throw e;
	}
	throw new Error("action did not redirect");
}

function form(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

const OWNED = { id: 5, householdId: 1 };
const FOREIGN = { id: 5, householdId: 2 };

async function actions() {
	return import("@/lib/actions/items");
}

beforeEach(() => {
	vi.clearAllMocks();
	getItem.mockReturnValue(OWNED);
	getCoverageSummary.mockReturnValue({
		status: "within",
		totalCents: 0,
		limitCents: null,
		pctUsed: null,
	});
});

// @spec ENRICH-ITEM-018, PLATFORM-DATA-007
describe("item write actions refuse items outside the household", () => {
	it("update returns an error and writes nothing", async () => {
		getItem.mockReturnValue(FOREIGN);
		const { updateItemAction } = await actions();
		const result = await updateItemAction(
			null,
			form({ itemId: "5", title: "Lamp" }),
		);
		expect(result).toEqual({ error: "Unknown item" });
		expect(updateItem).not.toHaveBeenCalled();
		expect(recordValuations).not.toHaveBeenCalled();
	});

	it("status change redirects to the list and writes nothing", async () => {
		getItem.mockReturnValue(FOREIGN);
		const { setItemStatusAction } = await actions();
		const url = await redirectOf(
			setItemStatusAction,
			form({ itemId: "5", status: "complete" }),
		);
		expect(url).toBe("/items");
		expect(setItemStatus).not.toHaveBeenCalled();
	});

	it("delete redirects to the list and deletes nothing", async () => {
		getItem.mockReturnValue(FOREIGN);
		const { deleteItemAction } = await actions();
		const url = await redirectOf(deleteItemAction, form({ itemId: "5" }));
		expect(url).toBe("/items");
		expect(deleteItem).not.toHaveBeenCalled();
		expect(deleteItemMedia).not.toHaveBeenCalled();
	});

	it("add-photos redirects to the list and stores nothing", async () => {
		getItem.mockReturnValue(FOREIGN);
		const { addPhotosAction } = await actions();
		const fd = form({ itemId: "5" });
		fd.append(
			"photos",
			new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }),
		);
		const url = await redirectOf(addPhotosAction, fd);
		expect(url).toBe("/items");
		expect(storeItemPhotos).not.toHaveBeenCalled();
	});
});

// @spec PLATFORM-DATA-007
describe("item write actions fail closed on a malformed id", () => {
	const BAD_IDS = ["abc", "0", "-5", "1.5", "1e2", ""];

	it.each(BAD_IDS)("update refuses itemId %j without a lookup", async (raw) => {
		const { updateItemAction } = await actions();
		const result = await updateItemAction(
			null,
			form({ itemId: raw, title: "Lamp" }),
		);
		expect(result).toEqual({ error: "Unknown item" });
		expect(getItem).not.toHaveBeenCalled();
		expect(updateItem).not.toHaveBeenCalled();
	});

	it.each(BAD_IDS)("status change refuses itemId %j", async (raw) => {
		const { setItemStatusAction } = await actions();
		const url = await redirectOf(
			setItemStatusAction,
			form({ itemId: raw, status: "complete" }),
		);
		expect(url).toBe("/items");
		expect(setItemStatus).not.toHaveBeenCalled();
	});

	it.each(BAD_IDS)("delete refuses itemId %j", async (raw) => {
		const { deleteItemAction } = await actions();
		const url = await redirectOf(deleteItemAction, form({ itemId: raw }));
		expect(url).toBe("/items");
		expect(deleteItem).not.toHaveBeenCalled();
	});

	it.each(BAD_IDS)("add-photos refuses itemId %j", async (raw) => {
		const { addPhotosAction } = await actions();
		const url = await redirectOf(addPhotosAction, form({ itemId: raw }));
		expect(url).toBe("/items");
		expect(storeItemPhotos).not.toHaveBeenCalled();
	});

	it("update refuses an absent itemId", async () => {
		const { updateItemAction } = await actions();
		const result = await updateItemAction(null, form({ title: "Lamp" }));
		expect(result).toEqual({ error: "Unknown item" });
		expect(updateItem).not.toHaveBeenCalled();
	});
});

// @spec ENRICH-ITEM-012
describe("updateItemAction money validation", () => {
	it("rejects an unparseable replacement cost and saves nothing", async () => {
		const { updateItemAction } = await actions();
		const result = await updateItemAction(
			null,
			form({ itemId: "5", title: "Lamp", replacementCost: "abc" }),
		);
		expect(result).toEqual({
			error: "Enter replacement cost as a dollar amount",
		});
		expect(updateItem).not.toHaveBeenCalled();
		expect(recordValuations).not.toHaveBeenCalled();
	});

	it("rejects an unparseable price paid and saves nothing", async () => {
		const { updateItemAction } = await actions();
		const result = await updateItemAction(
			null,
			form({ itemId: "5", title: "Lamp", pricePaid: "-20" }),
		);
		expect(result).toEqual({ error: "Enter price paid as a dollar amount" });
		expect(updateItem).not.toHaveBeenCalled();
		expect(recordValuations).not.toHaveBeenCalled();
	});

	it("treats a blank money field as no value, not an error", async () => {
		const { updateItemAction } = await actions();
		const result = await updateItemAction(
			null,
			form({
				itemId: "5",
				title: "Lamp",
				replacementCost: "  ",
				pricePaid: "",
			}),
		);
		expect(result).toMatchObject({ saved: true });
		expect(recordValuations).toHaveBeenCalledWith(5, {
			replacementCostCents: null,
			pricePaidCents: null,
			purchaseDate: null,
		});
	});
});

// @spec ENRICH-ITEM-008, ENRICH-ITEM-013, ENRICH-ITEM-018
describe("updateItemAction on an owned item", () => {
	it("patches the row and records the valuations in cents", async () => {
		const { updateItemAction } = await actions();
		const result = await updateItemAction(
			null,
			form({
				itemId: "5",
				title: "Lamp",
				replacementCost: "$1,234.56",
				pricePaid: "99",
				purchaseDate: "2024-01-02",
			}),
		);
		expect(result).toMatchObject({ saved: true });
		expect(updateItem).toHaveBeenCalledWith(
			5,
			expect.objectContaining({ title: "Lamp", quantity: 1 }),
		);
		expect(recordValuations).toHaveBeenCalledWith(5, {
			replacementCostCents: 123456,
			pricePaidCents: 9900,
			purchaseDate: "2024-01-02",
		});
	});
});
