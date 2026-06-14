/**
 * Client-safe lifecycle metadata (no `server-only`, no DB imports). Single
 * source of truth for the status list; the DB schema imports it from here.
 * Only "active" items count toward coverage (feature-spec §7).
 */
export const LIFECYCLE_STATUSES = [
  "active",
  "sold",
  "disposed",
  "gifted",
  "broken",
  "replaced",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  active: "Active (own it now)",
  sold: "Sold",
  disposed: "Disposed",
  gifted: "Gifted",
  broken: "Broken",
  replaced: "Replaced",
};
