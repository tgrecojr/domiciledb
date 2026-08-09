import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// Relative import: this file is compiled by @serwist/next's own webpack pass,
// which does not get the app's `@/` alias.
import { hardenRuntimeCaching } from "../lib/sw-cache-policy";

// Serwist injects the precache manifest at build time.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Never Serwist's raw defaults: they persist inventory data on the device.
  runtimeCaching: hardenRuntimeCaching(defaultCache),
});

serwist.addEventListeners();
