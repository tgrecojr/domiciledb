import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PLATFORM-OPS-010: the Node major is pinned in several places that must
 * agree, because the builder compiles native addons (better-sqlite3) for its
 * Node ABI and the distroless runtime has to load them. Renovate proposes the
 * bumps but cannot guarantee they land together (see the platform design,
 * "Node lockstep enforcement"), so this test is the gate.
 */

type NodePins = {
	builder: number | null;
	runtime: number | null;
	/** workflow file → every `node-version:` major found in it */
	workflows: Record<string, number[]>;
	typesNode: number | null;
};

const WORKFLOW_DIR = path.join(".github", "workflows");

function firstMajor(text: string, re: RegExp): number | null {
	const m = re.exec(text);
	return m ? Number(m[1]) : null;
}

function allMajors(text: string, re: RegExp): number[] {
	return [...text.matchAll(re)].map((m) => Number(m[1]));
}

export function readNodePins(root: string): NodePins {
	const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
	const pkg = JSON.parse(
		fs.readFileSync(path.join(root, "package.json"), "utf8"),
	) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const typesSpec =
		pkg.devDependencies?.["@types/node"] ?? pkg.dependencies?.["@types/node"];
	const workflows: Record<string, number[]> = {};
	for (const file of fs.readdirSync(path.join(root, WORKFLOW_DIR))) {
		if (!/\.ya?ml$/.test(file)) continue;
		const text = fs.readFileSync(path.join(root, WORKFLOW_DIR, file), "utf8");
		workflows[file] = allMajors(text, /node-version:\s*["']?(\d+)/g);
	}
	return {
		builder: firstMajor(dockerfile, /^FROM node:(\d+)[-@.\s]/m),
		runtime: firstMajor(dockerfile, /distroless\/nodejs(\d+)-debian\d+/),
		workflows,
		typesNode: typesSpec ? firstMajor(typesSpec, /^\D*(\d+)/) : null,
	};
}

/** Every way the pins disagree, as human-readable findings; empty means lockstep. */
export function lockstepProblems(pins: NodePins): string[] {
	const problems: string[] = [];
	if (pins.builder === null)
		problems.push("Dockerfile: no `FROM node:<major>` builder stage found");
	if (pins.runtime === null) {
		problems.push(
			"Dockerfile: no `distroless/nodejs<major>-debian<n>` runtime stage found",
		);
	}
	const expected = pins.builder;
	if (expected === null) return problems;
	if (pins.runtime !== null && pins.runtime !== expected) {
		problems.push(
			`Dockerfile: runtime is Node ${pins.runtime}, builder is Node ${expected}`,
		);
	}
	for (const [file, majors] of Object.entries(pins.workflows)) {
		for (const major of majors) {
			if (major !== expected) {
				problems.push(
					`${file}: node-version ${major}, builder is Node ${expected}`,
				);
			}
		}
	}
	if (pins.typesNode === null) {
		problems.push("package.json: no @types/node dependency found");
	} else if (pins.typesNode > expected) {
		problems.push(
			`package.json: @types/node ${pins.typesNode} exceeds the runtime Node ${expected}`,
		);
	}
	return problems;
}

const inLockstep: NodePins = {
	builder: 26,
	runtime: 26,
	workflows: { "ci.yml": [26, 26], "supply-chain.yml": [26] },
	typesNode: 26,
};

describe("Node major lockstep", () => {
	// @spec PLATFORM-OPS-010
	it("reports nothing when every pin names the same major", () => {
		expect(lockstepProblems(inLockstep)).toEqual([]);
	});

	// @spec PLATFORM-OPS-010
	it("fails when the distroless runtime lags the builder", () => {
		const problems = lockstepProblems({ ...inLockstep, runtime: 24 });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/runtime is Node 24, builder is Node 26/);
	});

	// @spec PLATFORM-OPS-010
	it("fails and names the file when a workflow pin disagrees", () => {
		const problems = lockstepProblems({
			...inLockstep,
			workflows: { ...inLockstep.workflows, "supply-chain.yml": [24] },
		});
		expect(problems).toEqual([
			"supply-chain.yml: node-version 24, builder is Node 26",
		]);
	});

	// @spec PLATFORM-OPS-010
	it("lets @types/node lag the runtime but never exceed it", () => {
		expect(lockstepProblems({ ...inLockstep, typesNode: 24 })).toEqual([]);
		expect(lockstepProblems({ ...inLockstep, typesNode: 27 })).toEqual([
			"package.json: @types/node 27 exceeds the runtime Node 26",
		]);
	});

	// @spec PLATFORM-OPS-010
	it("fails closed when a pin cannot be parsed", () => {
		expect(lockstepProblems({ ...inLockstep, builder: null })).not.toEqual([]);
		expect(lockstepProblems({ ...inLockstep, runtime: null })).not.toEqual([]);
		expect(lockstepProblems({ ...inLockstep, typesNode: null })).not.toEqual(
			[],
		);
	});

	// @spec PLATFORM-OPS-010
	it("holds for this repository's Dockerfile, workflows, and package.json", () => {
		const pins = readNodePins(process.cwd());
		expect(pins.builder).not.toBeNull();
		expect(pins.runtime).not.toBeNull();
		expect(Object.keys(pins.workflows).length).toBeGreaterThan(0);
		expect(lockstepProblems(pins)).toEqual([]);
	});
});
