# Arrow: household-locations

The single household and its places: first-run onboarding, the DB-enforced one-household
invariant that every page gates on, locations with their kinds, and the room photos that give
the proof packet context.

## Status

**OK** — mapped and audited 2026-10-24 (git SHA `f74d36b`). Specs
verified against code and annotated at every entry point; the two gaps (household edit, location
delete confirm) were built in the same pass and are pinned by a new Locations e2e journey. Every
active spec is implemented; the segment is one audit of a committed tree away from `OK`.

## References

### HLD

- docs/high-level-design.md (Target Users: one household, one editor; Non-Goals: multiple
  properties, multi-user)

### LLD

- docs/intent/household-locations/household-locations-design.md

### EARS

- docs/intent/household-locations/household-locations-specs.md (19 specs: 6 HH, 9 LOC, 4 PHOTO)

### Tests

- tests/unit/household.security.test.ts (VULN-020)
- tests/unit/location-photo-delete.security.test.ts (VULN-017)
- tests/e2e/household-locations.spec.ts (household edit; add, edit, room photo; confirmed delete
  that unassigns items)
- tests/e2e/helpers.ts (`ensureOnboarded`)

### Code

- src/app/actions.ts (`setupHouseholdAction`, `updateHouseholdAction`)
- src/app/onboarding-form.tsx
- src/app/household/page.tsx, household-form.tsx
- src/lib/queries/household.ts
- src/app/locations/page.tsx, add-location-form.tsx, delete-location.tsx
- src/app/locations/[id]/edit/page.tsx, location-edit-form.tsx, location-photo-grid.tsx, add-location-photos.tsx
- src/lib/actions/locations.ts
- src/lib/queries/locations.ts, location-photos.ts
- src/lib/location-kinds.ts
- src/app/page.tsx (onboarding branch; file owned by platform)
- drizzle/0003_square_black_queen.sql (singleton migration; owned by platform)

## Architecture

**Purpose:** Give the inventory a place to live. v1 is one household with one editor; locations
are the rooms, garages, sheds, storage units, vehicles, safe-deposit boxes, and on-loan places an
item can be in, one at a time. Room photos are context for the adjuster, not evidence for a
specific item.

**Key Components:**
1. **Onboarding** — `/` renders a create-household form until a household exists; every other
   page redirects to `/`.
2. **Singleton invariant** — `household.singleton` is `NOT NULL DEFAULT 1 UNIQUE`; the query
   layer also refuses a second create (VULN-020).
3. **Locations** — list with counts, inline add, edit page, one-click delete that orphans items
   to "unassigned" rather than refusing.
4. **Room photos** — per-location directory under `media/locations/<id>/`, same admission
   helper and variants as item photos, per-photo delete with reference counting (VULN-017).

## Spec Coverage

| Category    | Spec IDs                   | Implemented | Deferred | Gaps |
| ----------- | -------------------------- | ----------- | -------- | ---- |
| Household   | HOUSEHOLD-HH-001 to 006    | 5           | 1        | 0    |
| Locations   | HOUSEHOLD-LOC-001 to 009   | 9           | 0        | 0    |
| Room photos | HOUSEHOLD-PHOTO-001 to 004 | 4           | 0        | 0    |

**Summary:** 18 of 18 active specs implemented; 0 gaps; 1 deferred (multiple properties).

**Traceability (audit 2026-10-24):** every active spec is cited by `@spec` in code. Specs with a
citing test: HH-001, HH-002, HH-003, HH-006, LOC-002 to LOC-006, PHOTO-001 to PHOTO-003
(unit: VULN-020, VULN-017; e2e: `household-locations.spec.ts`, `helpers.ts`). Untested by
assertion: HH-004, LOC-001, LOC-007, LOC-008, LOC-009, PHOTO-004 (schema shape, kind enum, count
semantics, ownership checks, one-location-per-item, packet placement — the last is asserted by
proof-packet's unit tests). No reverse orphans.

## Key Findings

1. **One household, enforced twice.** Migration 0003 added `household.singleton` with a unique
   index and deleted all but the lowest-id household, cascading their data
   (`drizzle/0003_square_black_queen.sql`); `createHousehold` throws on a second row
   (`src/lib/queries/household.ts:25-27`). Both are tested.
2. **The household is editable** from `/household` (dashboard tile): name, address, description;
   blank optionals clear (`src/app/household/*`, `src/app/actions.ts`,
   `src/lib/queries/household.ts`). Nothing deletes a household.
3. **Deleting a location does not refuse while items reference it** — items are set to
   `location_id NULL` by the FK and become "Unassigned"; room photos cascade and the media
   directory is removed (`src/lib/actions/locations.ts:63-67`; `src/db/schema.ts:104-106`). The
   list's delete is a two-step in-page confirm that restates the item count
   (`src/app/locations/delete-location.tsx`).
4. **Item counts include every lifecycle status by design**; the docstring now says so
   (`src/lib/queries/locations.ts`).
5. **Ownership is checked consistently here** — delete, update, add-photos, and delete-photo all
   compare `householdId` (`actions/locations.ts:64, 83, 114, 139-144`), unlike the item actions.
6. **Room-photo deletion is reference-counted** by path across all three variant columns, so a
   duplicate upload does not lose its files when one row is deleted
   (`queries/location-photos.ts:54-79`; `actions/locations.ts:145-153`).
7. **`sort_order` is never written** for location photos; order is effectively by id.
8. **Description cannot be set on create**, only on edit (`actions/locations.ts:28-31, 46-49`).
9. **The room-photo picker has no rear-camera hint** (`add-location-photos.tsx:17-23`), unlike
   the item picker; on a phone it opens the gallery first.
10. **Onboarding placeholder carries the repository owner's surname**
    ("e.g. The Greco residence", `onboarding-form.tsx:24`).
11. **The Locations UI is now covered end to end** by `tests/e2e/household-locations.spec.ts`
    (add, edit, room photo, confirmed delete with item unassignment).

## Work Required

### Must Fix

1. None. Every active spec is implemented and the segment is annotated.

### Should Fix

2. None outstanding.

### Nice to Have

3. Replace the personal placeholder text in onboarding.
4. Allow description on create; decide the camera hint for room photos; write `sort_order`.
