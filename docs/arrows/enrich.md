# Arrow: enrich

Finishing a draft later: the items list and "To finish" worklist, the autosaving item editor,
photos, receipts and warranties, categories, and the consent-gated AI assist that fills in
identity, description, and value.

## Status

**OK** — mapped and audited 2026-10-24 (git SHA `f74d36b`). Specs
verified against code and annotated at every entry point; the six gaps found in mapping (AI
provenance and outcomes, interaction ownership, household checks and fail-closed ids on every
write action, document caps, unmount flush) were built in the same pass, the editor now errors on
unparseable money, and `item-edit-form.tsx` was split under the 300-line cap. Every active spec
is implemented.

## References

### HLD

- docs/high-level-design.md (Approach: progressive enrichment; AI assists, the human confirms)

### LLD

- docs/intent/enrich/enrich-design.md

### EARS

- docs/intent/enrich/enrich-specs.md (62 specs: 6 LIST, 19 ITEM, 5 PHOTO, 8 DOC, 5 CAT, 19 AI)

### Tests

- tests/unit/ai.test.ts
- tests/unit/ai-apply.test.ts (AI provenance, outcomes, interaction ownership, discard)
- tests/unit/categories.security.test.ts
- tests/unit/item-actions.test.ts (ownership, fail-closed ids, money errors)
- tests/unit/documents-action.security.test.ts (cleanup, upload caps, ownership)
- tests/e2e/documents.spec.ts
- tests/e2e/item-edit.spec.ts (editor validation, unmount flush; the lifecycle → coverage case cascades)
- tests/e2e/ai.spec.ts (item tasks; the dec-page case cascades to coverage)
- tests/e2e/capture.spec.ts (status toggle and delete cases)
- tests/integration/db-queries.test.ts (`listItems`, `deleteItem` cases)

### Code

- src/app/items/page.tsx, src/app/worklist/page.tsx
- src/app/items/[id]/page.tsx, item-edit-form.tsx, item-edit-fields.tsx, coverage-alert-banner.tsx, add-photos.tsx, photo-gallery.tsx, delete-item.tsx, documents-section.tsx, ai-assist.tsx
- src/components/item-list.tsx, src/components/location-filter.tsx
- src/lib/actions/items.ts (`updateItemAction`, `setItemStatusAction`, `deleteItemAction`, `addPhotosAction`; `captureItemAction` is capture's)
- src/lib/actions/documents.ts, src/lib/actions/ai.ts, src/lib/actions/owned-item.ts
- src/lib/queries/items.ts, photos.ts, documents.ts, categories.ts, ai.ts
- src/lib/documents-store.ts, src/lib/document-kinds.ts
- src/lib/ai/tasks.ts, manifest.ts, openrouter.ts, image.ts
- src/lib/rate-limit.ts
- src/db/seed.ts

## Architecture

**Purpose:** Turn a seconds-old draft into a claim-grade record at the owner's pace. Completeness
is user-determined: the worklist nudges, the detail page hints, and the user decides when to mark
an item complete.

**Key Components:**
1. **Surfaces** — `/items` (all items, URL-driven location filter), `/worklist` (drafts only),
   `/items/[id]` (gallery, hints, AI panel, editor, documents, status toggle, delete).
2. **Autosave editor** — `ItemEditForm` debounces 800 ms and saves on blur; `updateItemAction`
   validates with Zod, patches the row, records valuations through keep-current, and returns a
   coverage alert when a threshold is crossed.
3. **Photos and documents** — add-photos reuses capture's admission helper; documents are stored
   byte-for-byte with a content hash under `media/documents/items/<id>/`.
4. **Categories** — global, seeded with 15 defaults, find-or-create with a `MAX_CATEGORIES`
   ceiling; the only writer is AI apply.
5. **AI assist** — task registry with literal prompts and Zod schemas (`tasks.ts`), transparency
   manifest (`manifest.ts`), OpenRouter client with hourly spend cap (`openrouter.ts`,
   `rate-limit.ts`), server actions that log every call to `ai_interaction`, and a
   consent → send → review → apply panel.

## Spec Coverage

| Category          | Spec IDs                | Implemented | Deferred | Gaps |
| ----------------- | ----------------------- | ----------- | -------- | ---- |
| List and worklist | ENRICH-LIST-001 to 006  | 6           | 0        | 0    |
| Detail and editor | ENRICH-ITEM-001 to 019  | 19          | 0        | 0    |
| Photos            | ENRICH-PHOTO-001 to 005 | 4           | 1        | 0    |
| Documents         | ENRICH-DOC-001 to 008   | 8           | 0        | 0    |
| Categories        | ENRICH-CAT-001 to 005   | 4           | 1        | 0    |
| AI assist         | ENRICH-AI-001 to 019    | 19          | 0        | 0    |

**Summary:** 60 of 60 active specs implemented; 0 gaps; 2 deferred (per-photo delete and
reorder, free-form tags).

**Traceability (audit 2026-10-24):** every active spec is cited by `@spec` in code. Specs with a
citing test: 32 of 60 (unit `ai.test.ts`, `ai-apply.test.ts`, `item-actions.test.ts`,
`categories.security.test.ts`, `documents-action.security.test.ts`,
`content-integrity.security.test.ts`; integration `db-queries.test.ts`,
`db-report-items.test.ts`; e2e `documents.spec.ts`, `item-edit.spec.ts`, `ai.spec.ts`,
`capture.spec.ts`). Pinned by code review only: LIST-001, -003 to -005, ITEM-001 to -003, -006,
-007, -009 to -011, -014, -019, PHOTO-001 to -003, DOC-003, CAT-001, -002, AI-004, -005, -009,
-015 to -017. No reverse orphans.

## Key Findings

1. **Every write action checks household ownership and parses ids fail-closed.** Item update,
   status, delete, add-photos, add-document, delete-document (`src/lib/actions/owned-item.ts`)
   and the three AI actions (`ownedItem` in `src/lib/actions/ai.ts`) refuse anything that is not
   a positive-integer id of an item in the household; pinned by `item-actions.test.ts`,
   `documents-action.security.test.ts`, `ai-apply.test.ts`.
2. **Autosave flushes on unmount.** A pending debounced save is sent, not cancelled, when the
   editor unmounts through in-app navigation (`item-edit-form.tsx`); a hard navigation or tab
   close can still lose an edit inside the 800 ms window (see the LLD's open questions).
3. **AI provenance is recorded.** Applied cost suggestions are stored with `source: "ai"`,
   outcomes distinguish `accepted`, `edited`, and `rejected`, and an outcome is written only when
   the interaction id belongs to the item (`src/lib/actions/ai.ts`, `queries/ai.ts`,
   `queries/valuations.ts`). The dec-page path does the same for the policy. Nothing in the UI
   reads `ai_interaction` yet.
4. **Documents go through the same caps as photos.** Declared size against `UPLOAD_MAX_FILE_MB`,
   the media quota, then byte sniffing; a rejected document stores nothing and the item page
   names the reason (`src/lib/actions/documents.ts`, `documents-section.tsx`).
5. **Unparseable money is an error, not a silent skip.** The editor refuses the whole save with
   "Enter replacement cost as a dollar amount" (or price paid), matching the policy form
   (`src/lib/actions/items.ts`).
6. **No transactions.** Item patch + valuation insert + item cost update are separate statements
   (`items.ts`, `valuations.ts:38-61`).
7. **The AI request has no timeout and no retry** (`src/lib/ai/openrouter.ts:99-111`); fake-mode
   responses bypass schema validation (`openrouter.ts:52-55`).
8. **Empty strings fail AI schemas** rather than becoming null (`src/lib/ai/tasks.ts:17-22`), so a
   reply with `"model": ""` fails the whole task.
9. **Suggestion-to-field mapping is hand-maintained in the client** (`ai-assist.tsx:28-76`) and
   must agree with `applyItemSuggestion`'s field list (`ai.ts:152-171`).
10. **Id parsing is uniform**: every action uses `parseId` (PLATFORM-DATA-007).
11. **No per-photo delete or reorder for item photos**, although location photos have delete
    (`photo-gallery.tsx` vs. `location-photo-grid.tsx:39-52`); `photo.sort_order` is never written.
12. **Dormant schema in this segment's territory**: `tag`/`item_tag` have no code path; photo
    kinds `condition`/`serial_plate` are never written.
13. **Code hygiene**: the editor is now `item-edit-form.tsx` (state and save contract),
    `item-edit-fields.tsx` (field groups), and `coverage-alert-banner.tsx`, all under 300 lines;
    the input class string is still duplicated across files and the lightbox in two.

## Work Required

### Must Fix

1. None. Every active spec is implemented and annotated.

### Should Fix

2. A read surface for `ai_interaction` (the audit log is still write-only).
3. Transactions around patch + valuation + pointer (Finding 6); AI fetch timeout (Finding 7).

### Nice to Have

4. Per-photo delete/reorder parity with location photos (ENRICH-PHOTO-005).
5. Share the input class and lightbox; decide the fate of `tag`/`item_tag` (ENRICH-CAT-005).
