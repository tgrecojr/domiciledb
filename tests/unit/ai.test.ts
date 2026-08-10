import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_MAX_PHOTOS, buildManifest } from "@/lib/ai/manifest";
import { isTaskKey, parseTaskResponse, TASKS } from "@/lib/ai/tasks";

describe("buildManifest", () => {
	it("reflects the literal prompt + model and that an image will be sent", () => {
		const m = buildManifest("identify", {
			model: "openai/gpt-4o",
			hasImage: true,
		});
		expect(m.model).toBe("openai/gpt-4o");
		expect(m.prompt).toBe(TASKS.identify.prompt);
		expect(m.sendsImage).toBe(true);
		expect(m.imageNote).toBeTruthy();
	});

	it("does not claim to send an image when there is none", () => {
		const m = buildManifest("identify", { model: "x", hasImage: false });
		expect(m.sendsImage).toBe(false);
		expect(m.imageNote).toBeNull();
	});
});

describe("parseTaskResponse", () => {
	it("parses a clean JSON object", () => {
		const r = parseTaskResponse(
			"identify",
			'{"manufacturer":"Sony","model":null,"category":"Electronics"}',
		);
		expect(r.ok).toBe(true);
		expect(r.data).toMatchObject({
			manufacturer: "Sony",
			model: null,
			category: "Electronics",
		});
	});

	it("extracts JSON embedded in surrounding prose", () => {
		const r = parseTaskResponse(
			"describe",
			'Sure! {"description":"A blue mug."} Hope that helps.',
		);
		expect(r.ok).toBe(true);
		expect(r.data).toMatchObject({ description: "A blue mug." });
	});

	it("accepts a partial/empty object (all fields nullable)", () => {
		const r = parseTaskResponse("identify", "{}");
		expect(r.ok).toBe(true);
		expect(r.data).toMatchObject({
			manufacturer: null,
			model: null,
			category: null,
		});
	});

	it("rejects non-JSON and malformed JSON", () => {
		expect(parseTaskResponse("identify", "no json here").ok).toBe(false);
		expect(parseTaskResponse("identify", "{not valid}").ok).toBe(false);
	});

	it("rejects a value of the wrong type", () => {
		// manufacturer must be a string|null, not a number.
		expect(parseTaskResponse("identify", '{"manufacturer":123}').ok).toBe(
			false,
		);
	});

	it("dec-page parse keeps Coverage B and strips any fabricated sub-limits", () => {
		// The model must not invent per-category sub-limits; the schema drops them.
		const r = parseTaskResponse(
			"parse_decpage",
			'{"coverageBUsd":456750,"jewelryLimitUsd":1500,"firearmsLimitUsd":2500}',
		);
		expect(r.ok).toBe(true);
		const data = r.data as Record<string, unknown>;
		expect(data.coverageBUsd).toBe(456750);
		expect("jewelryLimitUsd" in data).toBe(false);
		expect("firearmsLimitUsd" in data).toBe(false);
	});
});

describe("isTaskKey own-property guard (VULN-013)", () => {
	it("rejects prototype-chain keys the `in` operator would admit", () => {
		// `v in TASKS` walks the prototype chain, so these would pass and then
		// crash at TASK_SCHEMAS[k].safeParse. Object.hasOwn rejects them.
		expect(isTaskKey("toString")).toBe(false);
		expect(isTaskKey("constructor")).toBe(false);
		expect(isTaskKey("__proto__")).toBe(false);
		expect(isTaskKey("hasOwnProperty")).toBe(false);
	});

	it("still accepts real task keys", () => {
		expect(isTaskKey("identify")).toBe(true);
		expect(isTaskKey("parse_decpage")).toBe(true);
	});
});

describe("config.ai gating (opt-in)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("is disabled when no API key is set, enabled when present", async () => {
		vi.resetModules();
		vi.stubEnv("OPENROUTER_API_KEY", "");
		const { config: disabled } = await import("@/lib/config");
		expect(disabled.ai.enabled).toBe(false);

		vi.resetModules();
		vi.stubEnv("OPENROUTER_API_KEY", "sk-test-123");
		const { config: enabled } = await import("@/lib/config");
		expect(enabled.ai.enabled).toBe(true);
	});
});

const fetchMock = vi.fn(async () => {
	return new Response(
		JSON.stringify({
			choices: [{ message: { content: '{"description":"a mug"}' } }],
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
});

async function loadRunTask(maxCallsPerHour?: number) {
	vi.resetModules();
	vi.stubEnv("OPENROUTER_API_KEY", "sk-test-key");
	vi.stubEnv("AI_FAKE", "0");
	if (maxCallsPerHour !== undefined) {
		vi.stubEnv("AI_MAX_CALLS_PER_HOUR", String(maxCallsPerHour));
	}
	const { runTask } = await import("@/lib/ai/openrouter");
	return runTask;
}

describe("AI spend caps (VULN-003)", () => {
	beforeEach(() => {
		fetchMock.mockClear();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("rate limits the paid provider call instead of billing every request", async () => {
		// Pin the ceiling to a small deterministic value via the real env knob so
		// the assertion targets the EXACT configured bound, not just "fewer than
		// attempts". A limiter that honoured any other cap would fail here.
		const limit = 5;
		const runTask = await loadRunTask(limit);
		// Prove the stubbed env actually flowed through the config module the
		// limiter reads (same fresh module registry as the runTask import).
		const { config } = await import("@/lib/config");
		expect(config.ai.maxCallsPerHour).toBe(limit);

		const attempts = 200;
		let refused = 0;
		for (let i = 0; i < attempts; i += 1) {
			const r = await runTask("describe", { imagesBase64Jpeg: ["AAAA"] });
			if (!r.ok) refused += 1;
		}
		// Exactly `limit` paid calls go out; every remaining attempt is refused.
		expect(fetchMock.mock.calls.length).toBe(limit);
		expect(refused).toBe(attempts - limit);
		expect(fetchMock.mock.calls.length).toBeLessThan(attempts);
		expect(refused).toBeGreaterThan(0);
	});

	it("refuses more images than the manifest cap, before any paid call", async () => {
		const runTask = await loadRunTask();
		const images = Array.from({ length: AI_MAX_PHOTOS + 10 }, () => "AAAA");
		const r = await runTask("describe", { imagesBase64Jpeg: images });
		expect(r.ok).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
