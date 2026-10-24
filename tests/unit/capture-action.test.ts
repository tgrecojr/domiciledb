import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * captureItemAction in isolation: location validation (CAPTURE-FLOW-005),
 * the dropped-photo count carried to the next page (CAPTURE-FLOW-012), and the
 * redirect contract. Queries, storage, and Next's redirect are stubbed; the
 * redirect stub throws like the real one so code after it never runs.
 */

class RedirectSignal extends Error {
	constructor(public readonly url: string) {
		super(`redirect:${url}`);
	}
}

const createDraftItem = vi.fn();
const getLocation = vi.fn();
const storeItemPhotos = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new RedirectSignal(url);
	},
}));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/items", () => ({ createDraftItem }));
vi.mock("@/lib/queries/locations", () => ({ getLocation }));
vi.mock("@/lib/actions/store-photos", () => ({ storeItemPhotos }));

async function runCapture(fd: FormData): Promise<string> {
	const { captureItemAction } = await import("@/lib/actions/capture");
	try {
		await captureItemAction(fd);
	} catch (e) {
		if (e instanceof RedirectSignal) return e.url;
		throw e;
	}
	throw new Error("captureItemAction did not redirect");
}

function photo(name: string): File {
	return new File([new Uint8Array([1, 2, 3, 4])], name, {
		type: "image/jpeg",
	});
}

function form(fields: Record<string, string>, photos: File[] = []): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	for (const p of photos) fd.append("photos", p);
	return fd;
}

beforeEach(() => {
	vi.clearAllMocks();
	createDraftItem.mockReturnValue({ id: 42 });
	storeItemPhotos.mockImplementation(
		async (_itemId: number, files: File[]) => files.length,
	);
});

// @spec CAPTURE-FLOW-005
describe("captureItemAction location validation", () => {
	it.each(["abc", "0", "-3", "1.5", "1e2"])(
		"saves the draft unassigned for the invalid location value %j",
		async (raw) => {
			await runCapture(form({ title: "Lamp", locationId: raw }));
			expect(createDraftItem).toHaveBeenCalledWith(
				expect.objectContaining({ locationId: null }),
			);
		},
	);

	it("saves the draft unassigned when the location belongs to another household", async () => {
		getLocation.mockReturnValue({ id: 7, householdId: 2 });
		await runCapture(form({ title: "Lamp", locationId: "7" }));
		expect(createDraftItem).toHaveBeenCalledWith(
			expect.objectContaining({ locationId: null }),
		);
	});

	it("assigns the draft to a location in the household", async () => {
		getLocation.mockReturnValue({ id: 7, householdId: 1 });
		await runCapture(form({ title: "Lamp", locationId: "7" }));
		expect(createDraftItem).toHaveBeenCalledWith(
			expect.objectContaining({ locationId: 7 }),
		);
	});
});

// @spec CAPTURE-FLOW-012
describe("captureItemAction dropped-photo reporting", () => {
	it("carries the number of photos not saved to the capture page", async () => {
		storeItemPhotos.mockResolvedValue(1);
		const url = await runCapture(
			form({ intent: "another" }, [
				photo("a.jpg"),
				photo("b.jpg"),
				photo("c.jpg"),
			]),
		);
		expect(url).toBe("/capture?saved=1&dropped=2");
	});

	it("carries the number of photos not saved to the item page", async () => {
		storeItemPhotos.mockResolvedValue(0);
		const url = await runCapture(
			form({ intent: "details" }, [photo("a.jpg"), photo("b.jpg")]),
		);
		expect(url).toBe("/items/42?dropped=2");
	});

	it("adds nothing to the redirect when every photo was stored", async () => {
		const url = await runCapture(
			form({ intent: "another" }, [photo("a.jpg"), photo("b.jpg")]),
		);
		expect(url).toBe("/capture?saved=1");
	});
});

// @spec CAPTURE-FLOW-002, CAPTURE-FLOW-004, CAPTURE-FLOW-008, CAPTURE-FLOW-009
describe("captureItemAction redirect contract", () => {
	it("creates nothing and returns to capture with an error when there is no photo and no title", async () => {
		const url = await runCapture(form({ title: "   " }));
		expect(url).toBe("/capture?error=empty");
		expect(createDraftItem).not.toHaveBeenCalled();
	});

	it("titles a photo-only capture 'Untitled item' and goes to the item for intent=details", async () => {
		const url = await runCapture(form({ intent: "details" }, [photo("a.jpg")]));
		expect(createDraftItem).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Untitled item" }),
		);
		expect(url).toBe("/items/42");
	});
});
