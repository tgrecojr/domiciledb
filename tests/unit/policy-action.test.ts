import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * savePolicyAction: every amount field errors on an unparseable value and the
 * save overwrites all fields (blank clears). COVERAGE-POLICY-004/005.
 */

const upsertPolicy = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/queries/household", () => ({
	getHouseholdId: vi.fn(async () => 1),
}));
vi.mock("@/lib/queries/policy", () => ({
	upsertPolicy,
	getPolicy: vi.fn(() => null),
}));

function form(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

async function save(fields: Record<string, string>) {
	const { savePolicyAction } = await import("@/lib/actions/policy");
	return savePolicyAction(null, form(fields));
}

beforeEach(() => {
	vi.clearAllMocks();
});

// @spec COVERAGE-POLICY-004
it("refuses an unparseable Coverage B and stores nothing", async () => {
	const res = await save({ coverageB: "lots" });
	expect(res?.error).toMatch(/Coverage B/);
	expect(upsertPolicy).not.toHaveBeenCalled();
});

// @spec COVERAGE-POLICY-005
describe("savePolicyAction secondary amounts", () => {
	it.each([
		["coverageA", /Coverage A/],
		["coverageC", /Coverage C/],
		["deductible", /deductible/i],
	])(
		"refuses an unparseable %s, names the field, and stores nothing",
		async (field, pattern) => {
			const res = await save({ coverageB: "456,750", [field]: "abc" });
			expect(res?.error).toMatch(pattern);
			expect(upsertPolicy).not.toHaveBeenCalled();
		},
	);

	it("overwrites every field, storing null for blanks", async () => {
		const res = await save({
			coverageB: "456,750",
			coverageA: "",
			coverageC: "",
			deductible: "",
			insurer: "",
			policyNumber: "",
		});
		expect(res).toEqual({ saved: true });
		expect(upsertPolicy).toHaveBeenCalledWith(1, {
			coverageBPersonalProperty: 45_675_000,
			coverageADwelling: null,
			coverageCLossOfUse: null,
			deductible: null,
			policyNumber: null,
			insurer: null,
		});
	});

	it("stores parsed cents for every amount that is given", async () => {
		await save({
			coverageB: "456,750",
			coverageA: "$609,000",
			coverageC: "182,700.50",
			deductible: "3045",
			insurer: " Acme ",
			policyNumber: "78-B1",
		});
		expect(upsertPolicy).toHaveBeenCalledWith(1, {
			coverageBPersonalProperty: 45_675_000,
			coverageADwelling: 60_900_000,
			coverageCLossOfUse: 18_270_050,
			deductible: 304_500,
			policyNumber: "78-B1",
			insurer: "Acme",
		});
	});
});
