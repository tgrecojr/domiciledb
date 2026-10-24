import { describe, expect, it } from "vitest";

import { MAX_RECEIPTS_PER_ITEM, receiptCandidates } from "@/lib/pdf/receipts";
import type { ReportDocument } from "@/lib/report";

function doc(kind: string, filename: string): ReportDocument {
	return { kind, filename, path: `media/documents/1/${filename}` };
}

// @spec PACKET-PDF-011
describe("receiptCandidates", () => {
	it("exports a cap of two receipts per item", () => {
		expect(MAX_RECEIPTS_PER_ITEM).toBe(2);
	});

	it("keeps only documents of kind receipt", () => {
		const out = receiptCandidates([
			doc("warranty", "w.jpg"),
			doc("receipt", "r.jpg"),
			doc("manual", "m.png"),
		]);
		expect(out.map((d) => d.filename)).toEqual(["r.jpg"]);
	});

	it("keeps only image extensions, so PDF receipts are listed, not rendered", () => {
		const out = receiptCandidates([
			doc("receipt", "invoice.pdf"),
			doc("receipt", "a.jpg"),
			doc("receipt", "b.jpeg"),
			doc("receipt", "c.png"),
			doc("receipt", "d.webp"),
			doc("receipt", "e.heic"),
			doc("receipt", "f.txt"),
			doc("receipt", "noext"),
		]);
		expect(out.map((d) => d.filename)).toEqual(
			["a.jpg", "b.jpeg", "c.png", "d.webp", "e.heic"].slice(
				0,
				MAX_RECEIPTS_PER_ITEM,
			),
		);
	});

	it("accepts every image extension when the cap allows", () => {
		const docs = [
			doc("receipt", "a.jpg"),
			doc("receipt", "b.jpeg"),
			doc("receipt", "c.png"),
			doc("receipt", "d.webp"),
			doc("receipt", "e.heic"),
			doc("receipt", "f.pdf"),
		];
		expect(receiptCandidates(docs, 10).map((d) => d.filename)).toEqual([
			"a.jpg",
			"b.jpeg",
			"c.png",
			"d.webp",
			"e.heic",
		]);
	});

	it("matches extensions case-insensitively", () => {
		const out = receiptCandidates([
			doc("receipt", "SCAN.JPG"),
			doc("receipt", "Photo.PnG"),
		]);
		expect(out.map((d) => d.filename)).toEqual(["SCAN.JPG", "Photo.PnG"]);
	});

	it("respects the cap and keeps input order", () => {
		const out = receiptCandidates([
			doc("receipt", "third.png"),
			doc("receipt", "first.jpg"),
			doc("receipt", "second.webp"),
		]);
		expect(out.map((d) => d.filename)).toEqual(["third.png", "first.jpg"]);
		expect(receiptCandidates([doc("receipt", "x.jpg")], 0)).toEqual([]);
	});

	it("returns an empty list when there are no documents", () => {
		expect(receiptCandidates([])).toEqual([]);
	});
});
