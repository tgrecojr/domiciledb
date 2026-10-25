---

parent: high-level-design
prefix: HOUSEHOLD
---

# Household and locations

## Context and Design Philosophy

DomicileDB serves one homeowner with one property in v1. Sharing happens by handing someone a
report, not by giving them an account, and multiple properties are explicitly deferred. That
single assumption simplifies everything downstream, so this segment makes it a hard invariant:
there is exactly one household row, the database refuses a second, and every page gates on its
existence.

Locations exist because adjusters walk a loss room by room and because "where was it" is part of
proving "that you had it". The set of kinds is wider than rooms on purpose: garage, shed, storage
unit, vehicle, safe-deposit box, and on loan are all places the policy may treat differently. An
item is in one location at a time and can be moved. Room photos are attached to the location,
not to any item, and lead the room's section in the proof packet.

## Household

**Record** (`src/db/schema.ts:28-38`): `name` (required), `description`, `address`,
`created_at`, `updated_at`, and `singleton INTEGER NOT NULL DEFAULT 1 UNIQUE`. Because every row
would carry `1`, the unique index admits one row. Migration 0003 (VULN-020) added the column,
deleted every household except the lowest id (cascading their locations, items, policy, and
transitively photos, valuations, documents), and created the index.

**Onboarding** (`src/app/page.tsx:26-38`, `onboarding-form.tsx`, `src/app/actions.ts`): while
`getHousehold()` is null, `/` renders "Welcome to DomicileDB" with a form (name required;
address and description optional) outside the app shell. `setupHouseholdAction` validates with
Zod (`name` trimmed, min 1, "Give your household a name"), coerces blank optionals to undefined,
calls `createHousehold`, and revalidates `/` so the dashboard replaces the form; it does not
redirect. `createHousehold` checks for an existing row and throws "A household is already set
up" before inserting; the unique index is the backstop for a race
(`src/lib/queries/household.ts:21-37`).

**Gate**: every page except `/` begins with `getHouseholdId()` and redirects to `/` when null
(capture, items, item detail, locations, location edit, policy, report, resilience, worklist).
Route handlers return 404 "No household set up" instead.

**Editing** (`src/app/household/page.tsx`, `household-form.tsx`, `updateHouseholdAction` in
`src/app/actions.ts`, `updateHousehold` in `queries/household.ts`): a Household page, reached
from a dashboard tile with a "← Home" back link, edits name (required, same Zod rule as
onboarding), address, and description with an explicit "Save changes" and a "Saved."
confirmation. Blank address or description clears the stored value; `updated_at` is set. The
dashboard and the proof packet read the new name on the next render. Nothing deletes a household.

## Locations

**Record** (`schema.ts:41-54`): `household_id` (cascade), `name`, `kind` from
`LOCATION_KINDS = ["room","garage","shed","storage","vehicle","safe_deposit","on_loan"]`
(default `room`; `src/lib/location-kinds.ts:6-14`), optional `description`, `created_at`. No
`updated_at`.

**List** (`src/app/locations/page.tsx`): reached from the dashboard tile, with a "← Home" back
link; not in the bottom nav. An inline add form (name required, kind select defaulting to room)
sits above the list, which is sorted by name and shows kind label, item count, photo count, an
Edit link, and a Delete button (`:28-64`). Item counts come from `locationItemCounts`, which
counts all items regardless of lifecycle although its docstring says "active"
(`src/lib/queries/locations.ts:47-60`).

**Actions** (`src/lib/actions/locations.ts`):

- `createLocationAction`: Zod `name` trimmed min 1 ("Name is required"), `kind` in the enum (no
  default at this layer, so a missing kind is a validation error); description cannot be set
  here (`:28-31, 46-49`). Returns null on success; the list revalidates.
- `updateLocationAction`: same schema plus optional description ("" → null); verifies the
  location belongs to the household, else `{ error: "Unknown location" }`; returns
  `{ saved: true }` (`:81-102`). The edit form is an explicit "Save changes" with "Saved." text.
- `deleteLocationAction`: verifies ownership, deletes the row, removes
  `media/locations/<id>/` (`:63-67`). The FK sets `item.location_id` to NULL, so items become
  "Unassigned" rather than blocking the delete; `location_photo` rows cascade. The list's
  `DeleteLocation` control (`src/app/locations/delete-location.tsx`) is a two-step in-page
  confirm that restates the item count ("N items will become unassigned") and that room photos
  are deleted, mirroring item delete.

An item's location is set from the capture form or the item editor (enrich); the FK checks only
that the location exists, not that it belongs to the household.

## Room photos

`location_photo` (`schema.ts:63-80`) mirrors `photo`: `path_original`, `path_web`,
`path_thumb`, `content_hash`, dimensions, `sort_order` (never written), `created_at`; cascades
with the location.

On the edit page (`src/app/locations/[id]/edit/page.tsx`) the copy explains that room photos
"appear in the proof packet ahead of the item close-ups to give context — they are not tied to
any item". `AddLocationPhotos` auto-submits on selection without a rear-camera hint
(`add-location-photos.tsx:17-23`); `addLocationPhotosAction` verifies ownership and runs the
shared admission helper (capture's `storePhotoFiles`) with `processAndStoreLocationImage`, which
writes the three variants under `media/locations/<locationId>/` (`actions/locations.ts:106-125`;
`src/lib/media.ts:277-289`). `LocationPhotoGrid` shows thumbnails in a grid with the same lightbox
as item photos plus a one-click trash overlay per photo.

`deleteLocationPhotoAction` verifies the photo's `location_id` matches the posted location,
deletes the row, then unlinks only those variant paths that no remaining `location_photo` row
references (`unreferencedLocationPhotoPaths`, by path string across all three columns), so a
duplicate upload sharing content-addressed files survives the deletion of one row (VULN-017;
`actions/locations.ts:131-156`; `queries/location-photos.ts:54-79`).

The proof packet reads `locationPhotosByLocation` for the rooms in scope and places up to four
on the room's first page (proof-packet segment).

## Decisions & Alternatives

| Decision                       | Chosen                                                                    | Alternatives Considered                  | Rationale                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Household cardinality          | Exactly one, enforced by a unique singleton column                        | Application check only; allow many       | Spec §1 and §10: one property, one editor in v1; VULN-020 found the application check alone let duplicates in.                                                                                |
| Second-household attempt       | Refused with a message; DB rejects a raw insert                           | Silently return the existing row         | The error names the invariant; a race still fails safely on the index.                                                                                                                        |
| Onboarding placement           | `/` renders the form until a household exists; other pages redirect there | Dedicated `/setup` route                 | The first screen a new install shows is the one that needs filling; no empty dashboard to explain.                                                                                            |
| Location kinds                 | Fixed enum of seven                                                       | Free text; rooms only                    | Spec §5: the named places (garage, shed, storage, vehicle, safe-deposit, on loan) are exactly those a policy may treat differently; an enum keeps the packet and filters consistent.          |
| One location per item          | `item.location_id`, nullable                                              | Many-to-many                             | Spec §5: "an item belongs to one location at a time and can be moved".                                                                                                                        |
| Deleting a location with items | Allowed; items become unassigned                                          | Refuse while items exist; reassign first | A room can stop existing (renovation, move) without its contents vanishing; "Unassigned" is already a first-class room in the packet. The absence of a confirmation step is an open question. |
| Room photos                    | Separate table and per-location directory                                 | Reuse `photo` with nullable item         | Spec §8: room photos give context and are not evidence for an item; a separate table keeps item photo counts honest.                                                                          |
| Room-photo deletion            | Per-photo, reference-counted by path                                      | Delete files unconditionally             | VULN-017: content-addressed names mean two rows can share files.                                                                                                                              |
| Ownership checks               | On every location write                                                   | Existence only                           | Written during the hardening pass; defense in depth even under the singleton.                                                                                                                 |
| Per-location item count        | All items in the location, regardless of lifecycle                        | Active items only                        | The list answers "what is in this room", which includes things no longer owned but still recorded there; coverage and the packet already apply the active filter where value matters.         |
| Household edits                | Name, address, and description editable after onboarding                  | Immutable after setup                    | A typo in the name appears on every proof packet; the record is the owner's to correct.                                                                                                       |
| Location delete                | Two-step in-page confirm naming the item count                            | One click                                | Mirrors item delete; the count beside the button is exactly the information the confirm should restate.                                                                                       |

## Open Questions & Future Decisions

### Resolved

1. ✅ One household and one editor in v1; multiple properties and multi-user are out of scope
   (spec §10).
2. ✅ The per-location item count includes every item in the location regardless of lifecycle
   (HOUSEHOLD-LOC-007).
3. ✅ The household is editable after onboarding (HOUSEHOLD-HH-006) and location delete requires
   an in-page confirm (HOUSEHOLD-LOC-006); both are built with a Locations e2e journey.

### Deferred

1. **Description on create** is impossible; only the edit form has the field.
2. **Camera hint for room photos.** Items use `capture="environment"`; locations do not. Decide
   whether in-situ room shots should default to the camera.
3. **`sort_order`** is never written for room photos; no reorder exists.
4. **Placeholder text** in onboarding carries a personal surname.
5. **Cross-household location ids** on items are prevented only by the singleton, not by the
   item actions.

## References

- Product spec: `feature-spec.md` §1 (single owner), §4.6 (onboarding), §5 Household and
  Location, §8 (room context), §10 (multiple properties deferred).
- Downstream: `docs/intent/capture/capture-design.md` and `docs/intent/enrich/enrich-design.md`
  (location picker and filter), `docs/intent/proof-packet/proof-packet-design.md` (rooms and
  room photos), `docs/intent/platform/platform-design.md` (schema, media store, dashboard
  onboarding branch).
- Tests: `tests/unit/household.security.test.ts` (VULN-020),
  `tests/unit/location-photo-delete.security.test.ts` (VULN-017).
