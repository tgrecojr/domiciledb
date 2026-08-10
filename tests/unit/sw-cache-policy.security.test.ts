import type {
	CacheWillUpdateCallbackParam,
	RouteMatchCallbackOptions,
	RuntimeCaching,
	Strategy,
} from "serwist";
import { NetworkOnly } from "serwist";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * VULN-007 (CWE-524 + CWE-312): the production service worker must not persist
 * household inventory responses into Cache Storage. Serwist's `defaultCache`
 * runs a NetworkFirst over same-origin /api/ GETs and pages and ignores
 * `Cache-Control: no-store`, which writes /api/export, /api/proof-packet, media
 * and inventory pages to on-device storage.
 */

// The service worker's route table, exactly as src/app/sw.ts builds it. The
// fallback is what sw.ts passed to Serwist before the fix, so removing the
// hardening module makes this test fail rather than error out.
let runtimeCaching: RuntimeCaching[];

beforeAll(async () => {
	// defaultCache degrades to a single NetworkOnly route outside production;
	// the vulnerability only exists in the production list.
	vi.stubEnv("NODE_ENV", "production");
	const { defaultCache } = await import("@serwist/next/worker");
	try {
		const { hardenRuntimeCaching } = await import("@/lib/sw-cache-policy");
		runtimeCaching = hardenRuntimeCaching(defaultCache);
	} catch {
		runtimeCaching = defaultCache;
	}
});

/** First matching route wins, GET only — Serwist's own resolution order. */
function handlerFor(rawUrl: string, headers: HeadersInit = {}) {
	const url = new URL(rawUrl);
	const request = new Request(url, { headers });
	for (const entry of runtimeCaching) {
		if ((entry.method ?? "GET") !== "GET") continue;
		const matched =
			typeof entry.matcher === "string"
				? entry.matcher === url.href || entry.matcher === url.pathname
				: entry.matcher instanceof RegExp
					? entry.matcher.test(url.href)
					: entry.matcher({
							url,
							request,
							sameOrigin: url.origin === "https://app.local",
							event: undefined,
						} as unknown as RouteMatchCallbackOptions);
		if (matched) return entry.handler as Strategy;
	}
	return null;
}

/** Would this strategy write a `no-store` response into Cache Storage? */
async function storesNoStoreResponse(handler: Strategy): Promise<boolean> {
	const request = new Request("https://app.local/items/1");
	let response: Response | null | undefined = new Response("serial numbers", {
		headers: { "Cache-Control": "private, no-store, max-age=0" },
	});
	for (const plugin of handler.plugins ?? []) {
		if (!plugin.cacheWillUpdate || !response) continue;
		response = await plugin.cacheWillUpdate({
			request,
			response,
			event: undefined,
			state: {},
		} as unknown as CacheWillUpdateCallbackParam);
	}
	return Boolean(response);
}

const SENSITIVE_URLS = [
	"https://app.local/api/export",
	"https://app.local/api/proof-packet?location=2",
	"https://app.local/api/media/items/1/receipt-web.webp",
	"https://app.local/api/media/documents/items/1/policy.pdf",
];

describe("VULN-007 service-worker runtime caching", () => {
	it.each(SENSITIVE_URLS)("never stores %s in Cache Storage", (url) => {
		const handler = handlerFor(url);
		expect(handler).toBeInstanceOf(NetworkOnly);
	});

	it("keeps static assets cacheable so the PWA still works offline", () => {
		expect(
			handlerFor("https://app.local/_next/static/chunk.abc123.js"),
		).not.toBe(null);
		expect(
			handlerFor("https://app.local/_next/static/chunk.abc123.js"),
		).not.toBeInstanceOf(NetworkOnly);
	});

	it("drops no-store inventory pages instead of caching them", async () => {
		const handler = handlerFor("https://app.local/items/1", {
			"Content-Type": "text/html",
		});
		expect(handler).not.toBe(null);
		expect(await storesNoStoreResponse(handler!)).toBe(false);
	});

	it("drops no-store RSC payloads instead of caching them", async () => {
		const handler = handlerFor("https://app.local/items", {
			RSC: "1",
			"Next-Router-Prefetch": "1",
		});
		expect(handler).not.toBe(null);
		expect(await storesNoStoreResponse(handler!)).toBe(false);
	});
});
