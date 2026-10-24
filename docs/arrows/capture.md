# Arrow: capture

The snap-to-draft loop: take one or more photos on a phone, save a draft item in seconds with no
required fields, and admit uploads within operator-set bounds.

## Status

**OK** — mapped and audited 2026-10-24 (git SHA `f74d36b`). Specs
verified against code and annotated at every entry point; the two gaps (location validation,
dropped-photo reporting) were built in the same pass and `captureItemAction` moved into its own
module. Every active spec is implemented.

## References

### HLD
- docs/high-level-design.md (Approach: mobile-first capture; Tenets)

### LLD
- docs/intent/capture/capture-design.md

### EARS
- docs/intent/capture/capture-specs.md (30 specs: 7 UI, 13 FLOW, 10 ADM)

### Tests
- tests/unit/capture-action.test.ts (location validation, dropped-photo count, redirect contract)
- tests/unit/store-photos.security.test.ts
- tests/unit/image-format.security.test.ts (the `storePhotoFiles` cases; sniffing itself is platform's)
- tests/e2e/capture.spec.ts (capture, worklist, and large-upload cases)
- tests/e2e/helpers.ts (`captureDraft`)

### Code
- src/app/capture/page.tsx
- src/app/capture/capture-form.tsx
- src/lib/actions/capture.ts (`captureItemAction`)
- src/lib/actions/store-photos.ts (`storePhotoFiles`, `storeItemPhotos`)
- src/lib/queries/items.ts (`createDraftItem`; file owned by enrich)
- src/lib/queries/photos.ts (`addPhoto`; file owned by enrich)
- src/app/items/[id]/page.tsx (dropped-photo notice; file owned by enrich)
- src/lib/media.ts (`processAndStoreImage`, `remainingMediaQuotaBytes`; file owned by platform)

## Architecture

**Purpose:** Make capture effortless on a phone so the inventory actually gets built. A capture is
one Server Action round-trip: photos plus an optional title and location become a `draft` item
with `general` photos, and the user is returned to capture the next thing or sent to finish the
details.

**Key Components:**
1. `CaptureForm` (`src/app/capture/capture-form.tsx`) — native file picker with rear-camera
   hint, local previews, two submit intents ("Save & add another" / "Save & finish details").
2. `captureItemAction` (`src/lib/actions/capture.ts`) — the entry point: requires a photo or a
   title, validates the location against the household, creates the draft row, stores photos,
   revalidates, redirects by intent carrying the dropped-photo count.
3. `storePhotoFiles` (`src/lib/actions/store-photos.ts`) — bounded admission shared with the
   enrich and household-locations photo flows: per-request count cap, per-file size cap, sniffed
   MIME, remaining media quota, sanitized logging.
4. Platform media store (`src/lib/media.ts`) — produces the original/web/thumb variants and the
   content hash; owned by the platform segment.

## Spec Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| Page and form | CAPTURE-UI-001 to 007 | 7 | 0 | 0 |
| Capture action | CAPTURE-FLOW-001 to 013 | 12 | 1 | 0 |
| Shared admission | CAPTURE-ADM-001 to 010 | 10 | 0 | 0 |

**Summary:** 29 of 29 active specs implemented; 0 gaps; 1 deferred (CAPTURE-FLOW-013 photo
kinds).

**Traceability (audit 2026-10-24):** every active spec is cited by `@spec` in code. Specs with a
citing test: FLOW-002 to FLOW-005, FLOW-007 to FLOW-012 (unit `capture-action.test.ts`, e2e
`capture.spec.ts`, `helpers.ts`), ADM-001, ADM-003 to ADM-007, ADM-009 (unit security tests).
Untested by assertion: the seven UI specs, FLOW-001, FLOW-006, ADM-002, ADM-008, ADM-010. No
reverse orphans.

## Key Findings

1. **No required fields, by design** — capture succeeds with photos only or a title only; both
   missing redirects back with `?error=empty` (`src/lib/actions/items.ts:46-48`,
   `src/app/capture/capture-form.tsx:37-41`). Title defaults to "Untitled item"
   (`src/lib/actions/items.ts:52`). This matches product principle 6.
2. **Two intents, one action** — `intent=details` redirects to the new item page; anything else
   returns to `/capture?saved=1` with a success banner (`src/lib/actions/items.ts:60-63`,
   `src/app/capture/capture-form.tsx:32-36, 94-103`).
3. **Native picker, no live camera API** — `<input type="file" accept="image/*"
   capture="environment" multiple>`; a comment notes this works without HTTPS
   (`src/app/capture/capture-form.tsx:43-56`).
4. **Dropped photos are reported on capture.** `storePhotoFiles` still skips zero-byte,
   oversize, unrecognized, and over-quota files with a server-side warning, but
   `captureItemAction` now compares submitted with stored and carries `?dropped=N` to the next
   page, where an amber notice names the count (`src/lib/actions/capture.ts`,
   `capture-form.tsx`, `src/app/items/[id]/page.tsx`). Add-photos and room photos still ignore
   the count (enrich's and household-locations' call).
5. **Draft row is created before photos are stored** — a photo failure leaves a photo-less draft
   (`src/lib/actions/capture.ts`), by design: photos need the item id for their directory.
6. **`locationId` is validated** — `parseId` plus a household-ownership check; anything else
   saves the draft unassigned (`src/lib/actions/capture.ts`, `householdLocationId`), pinned by
   `tests/unit/capture-action.test.ts`.
7. **Quota is charged by original bytes only** — derived web/thumb variants are not counted until
   the next request (`src/lib/actions/store-photos.ts:51-52`).
8. **Body limit vs. upload caps are unreconciled** — Server Action body limit is 50 MB
   (`next.config.ts:27`) while `UPLOAD_MAX_FILE_MB=25` × `UPLOAD_MAX_FILES_PER_REQUEST=20`
   permits far more per request (`env.example:35-37`). Multi-photo captures above 50 MB fail at
   the framework layer before admission runs.
9. **Preview object URLs are never revoked** (`src/app/capture/capture-form.tsx`); harmless
   because the redirect reloads the page.
10. **Every photo is stored with kind `general`** — the schema's `condition` and `serial_plate`
    kinds are never written (`src/lib/actions/items.ts:26-31`).

## Work Required

### Must Fix
1. None. Every active spec is implemented and annotated; admission is bounded and sniffed
   (VULN-008, VULN-012, VULN-016 regression tests pass).

### Should Fix
2. None outstanding. The 50 MB Server Action body limit is documented as fixed (platform
   decision).

### Nice to Have
3. Revoke preview object URLs on unmount (Finding 9).
4. Decide photo kinds on capture (CAPTURE-FLOW-013, deferred).
