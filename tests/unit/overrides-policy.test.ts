import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PLATFORM-OPS-011: `package.json` `overrides` are security floors for
 * transitive dependencies. Each is a caret range from the first fixed release
 * or a `$name` alias onto a direct dependency, never an exact pin, and the
 * advisory behind every one is recorded in the platform design (the only place
 * a reason can live, since JSON carries no comments).
 */

type RenovateConfig = {
	packageRules?: { matchDepTypes?: string[]; rangeStrategy?: string }[];
};

/**
 * PLATFORM-OPS-012: Renovate must not attempt a lock-only update of an
 * overridden package (npm refuses it with EOVERRIDE and the whole group's lock
 * update fails), so `overrides` entries use the `replace` range strategy.
 */
export function overrideRangeStrategies(config: RenovateConfig): string[] {
	return (config.packageRules ?? [])
		.filter((rule) => rule.matchDepTypes?.includes("overrides"))
		.map((rule) => rule.rangeStrategy ?? "(default)");
}

type PackageJson = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	overrides?: Record<string, string>;
};

const DESIGN_DOC = path.join(
	"docs",
	"intent",
	"platform",
	"platform-design.md",
);

const CARET_RANGE = /^\^\d+\.\d+\.\d+$/;
const ALIAS = /^\$(.+)$/;

export function overrideProblems(
	pkg: PackageJson,
	designDoc: string,
): string[] {
	const problems: string[] = [];
	const direct = { ...pkg.dependencies, ...pkg.devDependencies };
	for (const [key, value] of Object.entries(pkg.overrides ?? {})) {
		const alias = ALIAS.exec(value)?.[1];
		if (alias !== undefined) {
			if (!(alias in direct)) {
				problems.push(`${key}: alias ${value} names no direct dependency`);
			}
		} else if (!CARET_RANGE.test(value)) {
			problems.push(
				`${key}: "${value}" is not a caret range from a fixed release`,
			);
		}
		if (!designDoc.includes(`\`${key}\``)) {
			problems.push(`${key}: no entry in ${DESIGN_DOC}`);
		}
	}
	return problems;
}

const compliant: PackageJson = {
	dependencies: { zod: "^4.3.5" },
	overrides: { glob: "^14.0.2", "brace-expansion@5": "^5.0.9", zod: "$zod" },
};
const compliantDoc = "| `glob` | | `brace-expansion@5` | | `zod` |";

describe("override policy", () => {
	// @spec PLATFORM-OPS-011
	it("accepts caret floors and aliases that are all recorded", () => {
		expect(overrideProblems(compliant, compliantDoc)).toEqual([]);
	});

	// @spec PLATFORM-OPS-011
	it("rejects an exact pin", () => {
		const pkg = { ...compliant, overrides: { glob: "14.0.2" } };
		expect(overrideProblems(pkg, compliantDoc)).toEqual([
			'glob: "14.0.2" is not a caret range from a fixed release',
		]);
	});

	// @spec PLATFORM-OPS-011
	it("rejects an alias onto something that is not a direct dependency", () => {
		const pkg = { ...compliant, overrides: { nanoid: "$nanoid" } };
		expect(overrideProblems(pkg, "`nanoid`")).toEqual([
			"nanoid: alias $nanoid names no direct dependency",
		]);
	});

	// @spec PLATFORM-OPS-011
	it("rejects a floor the design doc does not explain", () => {
		expect(overrideProblems(compliant, "| `glob` | | `zod` |")).toEqual([
			`brace-expansion@5: no entry in ${DESIGN_DOC}`,
		]);
	});

	// @spec PLATFORM-OPS-011
	it("holds for this repository's package.json and platform design", () => {
		const root = process.cwd();
		const pkg = JSON.parse(
			fs.readFileSync(path.join(root, "package.json"), "utf8"),
		) as PackageJson;
		const doc = fs.readFileSync(path.join(root, DESIGN_DOC), "utf8");
		expect(Object.keys(pkg.overrides ?? {}).length).toBeGreaterThan(0);
		expect(overrideProblems(pkg, doc)).toEqual([]);
	});

	// @spec PLATFORM-OPS-012
	it("reports the range strategy of each rule that targets overrides", () => {
		const config = {
			packageRules: [
				{ matchDepTypes: ["overrides"], rangeStrategy: "replace" },
				{ matchDepTypes: ["devDependencies"], rangeStrategy: "bump" },
				{ matchDepTypes: ["overrides", "dependencies"] },
			],
		};
		expect(overrideRangeStrategies(config)).toEqual(["replace", "(default)"]);
		expect(overrideRangeStrategies({})).toEqual([]);
	});

	// @spec PLATFORM-OPS-012
	it("holds for this repository's renovate.json", () => {
		const config = JSON.parse(
			fs.readFileSync(path.join(process.cwd(), "renovate.json"), "utf8"),
		) as RenovateConfig;
		expect(overrideRangeStrategies(config)).toEqual(["replace"]);
	});
});
