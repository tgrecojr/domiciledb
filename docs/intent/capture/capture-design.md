---

parent: high-level-design
prefix: CAPTURE
---

# Capture

## Context and Design Philosophy

Capture exists so the inventory gets built at all. The owner has little patience for data entry
and captures in short bursts on a phone, so the loop is: open the app, take one or more photos,
save, repeat. Everything else about an item is deferred to the enrich segment. Two rules follow:

- **Nothing is required.** A capture with only photos, or only a title, is a valid draft. A
  capture with neither is the only rejected input.
- **Seconds, not minutes.** One Server Action round-trip creates the draft and stores the photos;
  the user is returned to the camera or sent to the new item, never to an intermediate screen.

Capture owns the page, the form, and the bounded upload-admission helper that every photo flow in
the app shares. It does not own image processing or storage (platform's media store) or the item
and photo tables it writes to (enrich's queries); it is the entry point that composes them.

## The capture loop

```
/capture  ──►  CaptureForm (client)
                 photos[] (native picker, rear camera hint)
                 title (optional) · locationId (optional)
                 intent = "another" | "details"
                      │ submit
                      ▼
         captureItemAction (server, src/lib/actions/capture.ts)
           1. household gate → redirect("/") if none
           2. reject if no photos AND no title → /capture?error=empty
           3. locationId = positive-integer id of a household location, else null
           4. createDraftItem({ title ?? "Untitled item", locationId })   status = draft
           5. stored = storeItemPhotos(id, photos)   → admission → variants → addPhoto("general")
           6. revalidatePath("/worklist", "/items")
           7. dropped = photos − stored; redirect by intent, with ?dropped=N when > 0
              details → /items/{id}[?dropped=N]   ·   else → /capture?saved=1[&dropped=N]
```

Current behavior, with evidence:

- The form has no `required` attributes; title and location are labelled optional
  (`src/app/capture/capture-form.tsx:72-91`).
- The picker is `<input type="file" accept="image/*" capture="environment" multiple>`; no
  `getUserMedia`, so basic capture works over plain HTTP (`capture-form.tsx:43-56`).
- Selected photos are previewed as 80 px thumbnails from object URLs (`capture-form.tsx:59-70`).
- Two submit buttons share `name="intent"` with values `another` and `details`; both are
  disabled while pending via `useFormStatus` (`capture-form.tsx:94-103`).
- Feedback is carried in search params: `?saved=1` renders "Saved ✓ — capture the next item, or
  finish details later."; `?error=empty` renders "Add at least one photo or a title."
  (`src/app/capture/page.tsx:25`, `capture-form.tsx:32-41`).
- The action rejects only when there are no non-empty files and no title
  (`src/lib/actions/capture.ts`); the title falls back to "Untitled item".
- The location value is honoured only when `parseId` accepts it and `getLocation` returns a
  location in this household; anything else saves the draft unassigned (`capture.ts`,
  `householdLocationId`). Pinned by `tests/unit/capture-action.test.ts`.
- The draft row is inserted before any photo is processed, so photos land under the item's own
  media directory.
- Every photo is stored with kind `general` by `storeItemPhotos` (`src/lib/actions/store-photos.ts`),
  which capture and enrich's add-photos share.
- The shortfall between photos submitted and photos stored travels as `?dropped=N`; the capture
  form and the item page render an amber notice naming the count (`capture-form.tsx`,
  `src/app/items/[id]/page.tsx`).

## Upload admission

`storePhotoFiles(files, context, store)` (`src/lib/actions/store-photos.ts`) is the single
admission path for item photos (capture and enrich's add-photos) and location photos. It takes a
`store` callback so the caller decides where bytes land.

Per request, in order (`store-photos.ts:44-83`):

1. Keep at most `config.uploads.maxFilesPerRequest` files; extras are dropped with a warning.
2. For each file: skip if size is 0; skip with a warning if size exceeds
   `config.uploads.maxFileBytes` (decided from the declared size, before reading bytes).
3. Read bytes and sniff the MIME from magic bytes (platform's `sniffImageMime`); unrecognized
   content is skipped silently. The client-declared `File.type` is never trusted.
4. If the file would exceed the remaining media quota (`remainingMediaQuotaBytes`), stop the whole
   batch with a warning. Quota is charged by original bytes; derived variants are not counted until
   the next request.
5. Call `store(buffer, sniffedMime)`; a thrown error is logged once, sanitized of control
   characters and bounded in length, and the loop continues.

The function returns the number stored. Capture uses it to report dropped photos
(CAPTURE-FLOW-012); enrich's add-photos and household-locations' room photos still ignore it, so
a partially failed batch on those two paths is indistinguishable from success at the UI (their
segments' call).

Operator knobs (all read through `src/lib/config.ts`): `UPLOAD_MAX_FILE_MB` (25),
`UPLOAD_MAX_FILES_PER_REQUEST` (20), `MEDIA_MAX_TOTAL_MB` (20480). The Next.js Server Action body
limit is a separate, framework-level cap of 50 MB (`next.config.ts:27`), which is the binding
limit for a multi-photo capture and is not derived from the knobs above.

## Decisions & Alternatives

| Decision                          | Chosen                                                                                                                                                           | Alternatives Considered                                               | Rationale                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required fields on capture        | None; photo OR title suffices                                                                                                                                    | Require a title; require a photo                                      | Product principle 6: a half-finished item is always acceptable. Rejecting only the empty capture keeps the loop at one tap.                                                                                |
| Camera access                     | Native file picker with `capture="environment"`                                                                                                                  | `getUserMedia` live viewfinder                                        | Works without HTTPS and without permission prompts; the comment at `capture-form.tsx:43` cites the HTTPS constraint. Live capture is listed as an HTTPS-only feature in the README.                        |
| Save flow                         | One Server Action creates the draft and stores photos, then redirects                                                                                            | Two-step (create, then upload); client-side upload to a route handler | Keeps capture to one round-trip and lets the server own validation and redirects; consistent with the "mutations are Server Actions" convention.                                                           |
| Post-save navigation              | Two explicit intents, `another` (stay) and `details` (go to item)                                                                                                | Always go to the item; always stay                                    | Burst capture needs "stay"; a single important item needs "go finish it now". The two buttons make the choice at submit time rather than after.                                                            |
| Feedback transport                | Search params (`?saved=1`, `?error=empty`)                                                                                                                       | `useActionState` return value                                         | The action always redirects, so state cannot be returned; search params survive the redirect and keep the form a plain `<form action>`.                                                                    |
| Admission ownership               | One shared helper with a `store` callback                                                                                                                        | Per-caller admission in each action                                   | The caps and sniffing were added as a security pass (VULN-008, VULN-012, VULN-016) and centralizing them gives one place to test.                                                                          |
| Trusting the client MIME          | Never; magic-byte sniff decides                                                                                                                                  | Trust `File.type` with an allowlist                                   | VULN-012: a renamed SVG or HTML file must not reach the image pipeline. The `ACCEPTED_IMAGE` regex is a UI hint only.                                                                                      |
| Order of insert vs. photo storage | Draft row first, then photos                                                                                                                                     | Photos first, then row; transactional                                 | Photo storage needs the item id for the on-disk path (`media/items/<id>/`). SQLite has no transaction here, so a photo failure leaves a photo-less draft rather than an orphaned directory.                |
| Partial-failure reporting         | The action compares photos submitted with photos stored and carries the shortfall to the next page as `?dropped=N`; the page says how many photos were not saved | Log only; per-file error list                                         | The owner must know a photo is missing while the item is still in hand to re-shoot; the count is enough, since the reason (too large, unsupported, storage full) is operator territory and already logged. |
| Location on capture               | Positive-integer id of a location in the household, else unassigned                                                                                              | Trust `Number(raw)`; reject the capture                               | Principle 6: a bad picker value must never block a capture, but it must never attach an item to a location that is not the household's either. Mirrors the editor's rule.                                  |
| Entry-point module                | `src/lib/actions/capture.ts` owns `captureItemAction`; item editing stays in `actions/items.ts`                                                                  | Keep it in the items action file                                      | One file per segment entry point keeps `@spec` ownership one-to-one with files.                                                                                                                            |

## Open Questions & Future Decisions

### Resolved

1. ✅ Capture must work over plain HTTP via the native picker; PWA install and offline are
   HTTPS-only (README, env.example).

2. ✅ Dropped photos are reported to the user by count (CAPTURE-FLOW-012).
3. ✅ `locationId` is validated on capture with the editor's rule (CAPTURE-FLOW-005).
4. ✅ The 50 MB Server Action body limit stays fixed and documented (platform decision); the
   dropped-photo count is the user-facing signal.
5. ✅ `captureItemAction` lives in its own module, `src/lib/actions/capture.ts`.

### Deferred

1. **Photo kinds.** The schema defines `condition` and `serial_plate` photo kinds (spec §5 names
   serial-plate close-ups) but capture and add-photos always write `general`. Decide whether
   capture should let the user tag a shot, or whether kinds are an enrich concern, or whether the
   enum should shrink.
2. **Preview object URLs are never revoked** (`capture-form.tsx`). Harmless under the current
   redirect-reload flow; would leak if the form ever became a client-side reset.

## References

- Product spec: `feature-spec.md` §3 P1/P6 (mobile-first, low-friction), §4.1 (quick capture).
- Downstream: `docs/intent/enrich/enrich-design.md` (what happens to the draft),
  `docs/intent/platform/platform-design.md` (media store: variants, hashing, quota, path safety).
- Operator configuration: `env.example` upload and media sections; `docs/configuration.md`.
- Regression tests that pin admission behavior: `tests/unit/store-photos.security.test.ts`
  (VULN-008, VULN-016), `tests/unit/image-format.security.test.ts` (VULN-012).
