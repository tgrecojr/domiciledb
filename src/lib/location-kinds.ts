/**
 * Client-safe location kind metadata (no `server-only`, no DB imports) so both
 * server queries and client forms can share it. This is the single source of
 * truth for the kind list; the DB schema imports LOCATION_KINDS from here.
 */
export const LOCATION_KINDS = [
  "room",
  "garage",
  "shed",
  "storage",
  "vehicle",
  "safe_deposit",
  "on_loan",
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  room: "Room",
  garage: "Garage",
  shed: "Shed",
  storage: "Storage unit",
  vehicle: "Vehicle",
  safe_deposit: "Safe deposit box",
  on_loan: "On loan",
};
