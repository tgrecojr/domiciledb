import { describe, expect, it } from "vitest";

import { parseId } from "@/lib/parse-id";

describe("parseId fails closed (VULN-014)", () => {
	it("rejects an absent id instead of coercing null to 0", () => {
		// Number(null) === 0 would pass Number.isInteger and proceed as item 0.
		expect(parseId(null)).toBeNull();
	});

	it("rejects empty/whitespace and the literal zero", () => {
		expect(parseId("")).toBeNull();
		expect(parseId("   ")).toBeNull();
		expect(parseId("0")).toBeNull();
	});

	it("rejects non-integer and negative values", () => {
		expect(parseId("abc")).toBeNull();
		expect(parseId("1.5")).toBeNull();
		expect(parseId("-3")).toBeNull();
		expect(parseId("3e2")).toBeNull();
	});

	it("accepts a valid positive integer id", () => {
		expect(parseId("42")).toBe(42);
	});
});
