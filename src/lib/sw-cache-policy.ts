import type { RuntimeCaching, SerwistPlugin } from "serwist";
import { NetworkOnly, Strategy } from "serwist";

/**
 * What the service worker is allowed to keep in on-device Cache Storage.
 *
 * Serwist's `defaultCache` runs a NetworkFirst over same-origin `/api/` GETs
 * and pages and ignores `Cache-Control: no-store`, so the household's export
 * ZIP, proof-packet PDF, media and inventory pages end up persisted on the
 * device (CWE-524 / CWE-312). Offline support still matters — this narrows the
 * defaults instead of disabling the service worker:
 *
 *   1. same-origin `/api/*` never touches Cache Storage at all, and
 *   2. any response the server marked `no-store` is dropped before it is
 *      written, whichever strategy fetched it.
 *
 * Static assets (precache, `/_next/static`, fonts, styles) are untouched, so
 * the PWA stays installable and works offline.
 */

/** Same-origin prefixes whose responses carry household inventory data. */
const NEVER_CACHED_PREFIXES = ["/api/"];

/** Whether the service worker may keep a response for this URL on the device. */
export function isRuntimeCacheable(
  pathname: string,
  sameOrigin: boolean,
): boolean {
  if (!sameOrigin) return true;
  return !NEVER_CACHED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Whether a `Cache-Control` value permits storing the response. */
export function isStorableResponse(cacheControl: string | null): boolean {
  return !(cacheControl ?? "")
    .split(",")
    .some((directive) => directive.trim().toLowerCase() === "no-store");
}

/** Honours `no-store`, which the built-in strategies otherwise ignore. */
export const noStorePlugin: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) =>
    isStorableResponse(response.headers.get("Cache-Control")) ? response : null,
};

/** The service worker's route table: Serwist's defaults, narrowed as above. */
export function hardenRuntimeCaching(
  defaults: RuntimeCaching[],
): RuntimeCaching[] {
  return [
    {
      matcher: ({ url, sameOrigin }) =>
        !isRuntimeCacheable(url.pathname, sameOrigin),
      handler: new NetworkOnly(),
    },
    ...defaults.map((entry) => {
      if (
        entry.handler instanceof Strategy &&
        !entry.handler.plugins.includes(noStorePlugin)
      ) {
        entry.handler.plugins.push(noStorePlugin);
      }
      return entry;
    }),
  ];
}
