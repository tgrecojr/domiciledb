import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The document actions in isolation: on-disk cleanup on delete (VULN-015),
 * the upload caps (ENRICH-DOC-007), and household ownership (ENRICH-ITEM-018).
 * Queries and the document store are stubbed; the redirect stub throws like
 * the real one so code after it never runs. DATA_DIR is a fresh temp dir per
 * test so the real media helpers see an empty, in-quota store.
 */

class RedirectSignal extends Error {
	constructor(public readonly url: string) {
		super(`redirect:${url}`);
	}
}

const addDocument = vi.fn();
const deleteDocument = vi.fn();
const getDocument = vi.fn();
const getItem = vi.fn();
const storeDocument = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
	redirect: (url: string) => {
		throw new RedirectSignal(url);
	},
}));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/items", () => ({ getItem }));
vi.mock("@/lib/queries/documents", () => ({
	addDocument,
	deleteDocument,
	getDocument,
}));
vi.mock("@/lib/documents-store", () => ({ storeDocument }));

const REL = path.join("media", "documents", "items", "1", "abc-receipt.pdf");
const PDF_HEADER = new TextEncoder().encode("%PDF-1.4\n");

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

function uploadForm(file: File | null): FormData {
	const fd = new FormData();
	fd.set("itemId", "1");
	fd.set("kind", "receipt");
	if (file) fd.set("document", file);
	return fd;
}

let dataDir: string;

beforeEach(() => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-action-unit-"));
	vi.resetModules();
	vi.stubEnv("DATA_DIR", dataDir);
	getItem.mockReturnValue({ id: 1, householdId: 1 });
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	vi.clearAllMocks();
	fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("deleteDocumentAction on-disk cleanup (VULN-015)", () => {
	// @spec ENRICH-DOC-006
	it("removes the stored file when the document row is deleted", async () => {
		const abs = path.join(dataDir, REL);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, "receipt-bytes");
		getDocument.mockReturnValue({ id: 7, itemId: 1, path: REL });

		const { deleteDocumentAction } = await import("@/lib/actions/documents");
		const fd = new FormData();
		fd.set("itemId", "1");
		fd.set("docId", "7");
		const url = await redirectOf(deleteDocumentAction, fd);

		expect(url).toBe("/items/1");
		expect(deleteDocument).toHaveBeenCalledWith(7);
		expect(fs.existsSync(abs)).toBe(false);
	});
});

// @spec ENRICH-DOC-007, ENRICH-DOC-004
describe("addDocumentAction upload caps", () => {
	it("stores nothing and reports 'size' for a file over the per-file cap", async () => {
		vi.stubEnv("UPLOAD_MAX_FILE_MB", "1");
		vi.resetModules();
		const oversize = new File(
			[new Uint8Array(1024 * 1024 + 1)],
			"big-receipt.pdf",
			{ type: "application/pdf" },
		);

		const { addDocumentAction } = await import("@/lib/actions/documents");
		const url = await redirectOf(addDocumentAction, uploadForm(oversize));

		expect(url).toBe("/items/1?docError=size");
		expect(storeDocument).not.toHaveBeenCalled();
		expect(addDocument).not.toHaveBeenCalled();
	});

	it("stores nothing and reports 'quota' when the media quota is exhausted", async () => {
		vi.stubEnv("MEDIA_MAX_TOTAL_MB", "0");
		vi.resetModules();
		const file = new File([PDF_HEADER], "receipt.pdf", {
			type: "application/pdf",
		});

		const { addDocumentAction } = await import("@/lib/actions/documents");
		const url = await redirectOf(addDocumentAction, uploadForm(file));

		expect(url).toBe("/items/1?docError=quota");
		expect(storeDocument).not.toHaveBeenCalled();
	});

	it("stores nothing and reports 'type' for bytes that are not an admitted type", async () => {
		const file = new File([new TextEncoder().encode("<svg/>")], "x.pdf", {
			type: "application/pdf",
		});

		const { addDocumentAction } = await import("@/lib/actions/documents");
		const url = await redirectOf(addDocumentAction, uploadForm(file));

		expect(url).toBe("/items/1?docError=type");
		expect(storeDocument).not.toHaveBeenCalled();
	});

	it("stores nothing and reports 'missing' when no file is attached", async () => {
		const { addDocumentAction } = await import("@/lib/actions/documents");
		const url = await redirectOf(addDocumentAction, uploadForm(null));

		expect(url).toBe("/items/1?docError=missing");
		expect(storeDocument).not.toHaveBeenCalled();
	});

	it("stores an admitted document and returns to the item page", async () => {
		storeDocument.mockResolvedValue({
			path: REL,
			contentHash: "abc",
			filename: "receipt.pdf",
		});
		const file = new File([PDF_HEADER], "receipt.pdf", {
			type: "application/pdf",
		});

		const { addDocumentAction } = await import("@/lib/actions/documents");
		const url = await redirectOf(addDocumentAction, uploadForm(file));

		expect(url).toBe("/items/1");
		expect(storeDocument).toHaveBeenCalledWith(
			1,
			expect.any(Buffer),
			"receipt.pdf",
		);
		expect(addDocument).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ path: REL }),
			"receipt",
			null,
		);
	});
});

// @spec ENRICH-ITEM-018, PLATFORM-DATA-007
describe("document actions refuse items outside the household", () => {
	it("add-document redirects to the list and stores nothing", async () => {
		getItem.mockReturnValue({ id: 1, householdId: 2 });
		const file = new File([PDF_HEADER], "receipt.pdf", {
			type: "application/pdf",
		});

		const { addDocumentAction } = await import("@/lib/actions/documents");
		const url = await redirectOf(addDocumentAction, uploadForm(file));

		expect(url).toBe("/items");
		expect(storeDocument).not.toHaveBeenCalled();
		expect(addDocument).not.toHaveBeenCalled();
	});

	it("delete-document redirects to the list and deletes nothing", async () => {
		getItem.mockReturnValue({ id: 1, householdId: 2 });
		getDocument.mockReturnValue({ id: 7, itemId: 1, path: REL });

		const { deleteDocumentAction } = await import("@/lib/actions/documents");
		const fd = new FormData();
		fd.set("itemId", "1");
		fd.set("docId", "7");
		const url = await redirectOf(deleteDocumentAction, fd);

		expect(url).toBe("/items");
		expect(deleteDocument).not.toHaveBeenCalled();
	});

	it.each(["abc", "0", "-1", "1.5"])(
		"delete-document refuses docId %j without a lookup",
		async (raw) => {
			const { deleteDocumentAction } = await import("@/lib/actions/documents");
			const fd = new FormData();
			fd.set("itemId", "1");
			fd.set("docId", raw);
			const url = await redirectOf(deleteDocumentAction, fd);

			expect(url).toBe("/items");
			expect(getDocument).not.toHaveBeenCalled();
			expect(deleteDocument).not.toHaveBeenCalled();
		},
	);
});
