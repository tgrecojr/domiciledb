---

parent: high-level-design
prefix: ENRICH
---

# Enrich

## Context and Design Philosophy

Capture produces drafts in seconds; enrich is where they become evidence an adjuster will accept.
The owner does this later, in bursts, often on the phone, so the segment follows three rules:

- **Completeness is user-determined.** There are no required fields beyond a title. The product
  nudges (a worklist of drafts, a "you might still add" hint) but never blocks, and the user alone
  decides when an item is complete.
- **Every keystroke is saved.** The editor autosaves; there is no save button to forget.
- **AI assists, the human confirms.** Identity, serials, descriptions, and values can be suggested
  by a remote model, but only after the user sees exactly what will be sent, and nothing is
  written until the user reviews, optionally edits, and applies.

Enrich owns the list and worklist surfaces, the item detail page and its editor, photo and
document attachment, categories, and the AI core. It writes replacement cost and price paid
through keep-current's valuation history and surfaces coverage's threshold alert; it does not own
either rule.

## Surfaces

**Items list** (`src/app/items/page.tsx`, `src/components/item-list.tsx`,
`src/components/location-filter.tsx`): every item regardless of status, newest first
(`src/lib/queries/items.ts:83-112`). A `?location=` search param filters by id or `unassigned`;
anything else means all (`items/page.tsx:26-31`). The filter control lives in the header only when
a location exists and pushes the URL so the view is shareable (`location-filter.tsx:26-29`). Rows
show the first photo's thumbnail or a placeholder, title, location name or "Unassigned", and an
amber "Draft" pill (`item-list.tsx:21-34`). Two empty states distinguish filtered from unfiltered
(`items/page.tsx:58-80`).

**Worklist** (`src/app/worklist/page.tsx`): drafts only (`listItems(..., { status: "draft" })`),
with "All caught up" and a capture link when empty (`worklist/page.tsx:17, 29-39`).

**Item detail** (`src/app/items/[id]/page.tsx`): 404 on a non-integer id or an item from another
household (`page.tsx:50-53`). Composes, top to bottom: photo gallery with add tile, the draft-only
"You might still add: …" hint over photo, category, location, manufacturer, serial
(`page.tsx:27-38, 79-84`), the AI panel when AI is enabled (`page.tsx:86-92`), the editor, the
document list and attach form, the status toggle, and the two-step delete.

## The autosave editor

`ItemEditForm` (`src/app/items/[id]/item-edit-form.tsx`) keeps every field as a string, debounces
800 ms after any change and also saves on blur (`item-edit-form.tsx:13, 147-152, 169`). An empty
title is refused client-side with "Title is required" and no server call (`:134-137`). Status
text precedence is pending → error → "Saving…" → "Saved ✓" (`:194-202`). Money is typed in
dollars on a decimal keypad and converted on the server (`:175-192`). The unmount cleanup clears
the timer, so a pending save is cancelled rather than flushed; the adjacent comment says the
opposite (`:154-159`).

`updateItemAction` (`src/lib/actions/items.ts:79-175`):

1. Parse the id (`Number` + `isInteger`) and load the item; no household check (`:126-130`).
2. Validate with Zod: title trimmed non-empty; quantity integer 1–1,000,000 (the ceiling keeps
   cost × quantity a safe integer); lifecycle status from the enum, default `active`; category and
   location ids positive integers or absent; other text fields trimmed optional (`:79-103`).
3. Lifecycle date is forced null when status is `active` (`:153-154`). Category and location are
   always overwritten, so an empty select clears them (`:144-145`).
4. Replacement cost and price paid are parsed with `parseDollarsToCents`; `null` results are
   ignored silently (`:158-162`) and valid ones go to `recordValuations` (keep-current).
5. Coverage is read before and after; when `crossedThreshold` reports an escalation and a limit
   exists, the action returns `{ coverageAlert }`, which the editor renders inline as "approaching
   … X% of limit" or "you appear underinsured" (`:138-139, 164-175`; `item-edit-form.tsx:76-107`).

The patch, the valuation insert, and the denormalized cost update are separate statements; there
is no transaction.

**Status toggle and delete.** `setItemStatusAction` accepts only `draft` or `complete` and is a
silent no-op otherwise (`items.ts:203-209`). `deleteItemAction` verifies ownership, hard-deletes
the row (FK cascades remove photos, valuations, documents, tags, reminders; `ai_interaction`
keeps a null item reference), removes `media/items/<id>` and `media/documents/items/<id>`, and
redirects to `/items` (`items.ts:186-194`; `src/lib/media.ts:145-159`). The UI requires an
in-page "Yes, delete" confirmation (`delete-item.tsx:11-47`).

## Photos and documents

**Photos.** The add tile auto-submits on selection (`add-photos.tsx:24`); `addPhotosAction` runs
the shared admission helper (capture's `storePhotoFiles`) and attaches each as kind `general`
(`items.ts:66-75, 26-31`). Photos list by `sort_order` then id (`queries/photos.ts:29-36`);
nothing ever writes `sort_order`. The gallery opens a lightbox on the web variant with a "View
original" link (`photo-gallery.tsx:17-69`). There is no per-photo delete or reorder.

**Documents.** The attach form requires a file (PDF or image), a kind (receipt default, warranty,
manual), and an optional warranty expiry (`documents-section.tsx:39-58`). `addDocumentAction`
admits on sniffed bytes (`sniffDocumentMime`: the photo formats plus PDF), stores the bytes
unchanged under `media/documents/items/<itemId>/<sha256>-<sanitized name>`, and records kind,
filename, hash, and the expiry only when kind is `warranty` (`actions/documents.ts:21-47`;
`documents-store.ts:22-46`). No per-file cap or quota applies; a missing or rejected file redirects
back with no error. Documents list oldest first and link to the stored file; "Remove" deletes the
row then unlinks the file with no confirmation step (`page.tsx:120-156`;
`actions/documents.ts:49-64`).

## Categories

Categories are global, not per household (`listCategories()` takes no id). Boot seeds 15 defaults
when the table is empty (`src/db/seed.ts:11-37`). The only creator is AI apply via
`findOrCreateCategory`, which matches case-insensitively ignoring surrounding whitespace and
refuses to create past `MAX_CATEGORIES` (`queries/categories.ts:19-44`). Nothing renames or
deletes a category. The `tag` and `item_tag` tables exist with no code path.

## AI assist

**Registry** (`src/lib/ai/tasks.ts`): five tasks, each with a label, consent blurb, literal
prompt, `needsPhoto: true`, and a Zod response schema with nullable fields, trimmed non-empty
strings, and non-negative numbers. Item tasks are `identify`, `ocr_plate`, `describe`,
`suggest_cost`; `parse_decpage` is consumed by the coverage segment. Prompts tell the model never
to guess serials and to return null when unsure (`tasks.ts:75, 87`). Money comes back as USD
floats and is converted to cents by the caller.

**Panel state machine** (`ai-assist.tsx:78-83`): idle → consent → loading → review | error.
Choosing a task only enters consent; the card shows the model, whether and how many photos go
(each resized to ≤1024 px, at most `AI_MAX_PHOTOS` = 6), and the literal prompt (`:149-200`).
"Send to AI" is disabled when the task needs a photo and there is none. Review shows editable
fields pre-filled from the suggestion with "Nothing is saved until you click Apply."; Discard
abandons it (`:206-244`).

**Execute** (`src/lib/actions/ai.ts:aiSuggestForItem`): refuse when AI is disabled or the task key
is unknown; pick the given photo or the first 6; encode via `imageToBase64Jpeg`; call `runTask`;
log an `ai_interaction` row on success or failure (`ai.ts:36-74`). `runTask`
(`openrouter.ts:52-124`) checks in order: fake mode → enabled → photo count → rolling-hour rate
limit → `fetch`. The request body is `{ model, messages: [{ role: "user", content: [prompt,
...image_url data URIs] }] }` and nothing else. Errors are app-authored strings; no provider body
text reaches the UI. There is no timeout or retry.

**Apply** (`ai.ts:applyItemSuggestion`): verifies the item belongs to the household and that the
interaction id was logged for that item (otherwise nothing is written), writes only non-empty
trimmed fields, resolves category by find-or-create, records replacement cost through
`recordValuations` with `source: "ai"`, sets the interaction outcome to `accepted` or, when the
panel reports that any review field differs from what the model returned, `edited`, and
revalidates. Discard calls `discardSuggestion`, which records `rejected` under the same checks.
The client-side map from suggestion keys to field names (`ai-assist.tsx`) must agree with this
function.

## Decisions & Alternatives

| Decision                       | Chosen                                                                | Alternatives Considered                                    | Rationale                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness                   | User-marked `complete`; only title required                           | Required-field checklist; auto-complete when fields filled | Product principle 6 and spec §4.3: a half-finished item is always acceptable; the worklist clears only on the user's say-so.                            |
| Editor save model              | Debounced autosave + blur, no button                                  | Explicit save button; `useActionState` form                | Mobile users abandon forms; the comment at `item-edit-form.tsx:341` says "no button to forget".                                                         |
| Money entry                    | Dollar strings in the form, cents on the server                       | Cents in the form; number inputs                           | Convention: cents everywhere, formatting at the edge; `money.ts` is the only conversion point.                                                          |
| Quantity ceiling               | 1,000,000                                                             | Unbounded                                                  | `items.ts:92-95`: keeps cost × quantity within the safe-integer range (VULN-021).                                                                       |
| Where cost is written          | Through keep-current's valuation history, never the item row directly | Write `current_replacement_cost` directly                  | Append-only history with a last-valued pointer is the staleness signal (architecture.md).                                                               |
| Coverage alert placement       | Returned from the save and shown inline in the editor                 | Only on the dashboard                                      | Spec §7: alerts escalate where the user is, "right after adding the item that crossed the threshold".                                                   |
| Item deletion                  | Hard delete with cascades and in-page confirmation                    | Soft delete; `window.confirm`                              | Lifecycle statuses already cover "no longer owned" without losing history; hard delete is for mistakes. In-page confirm avoids blocked dialogs in PWAs. |
| Photo admission for add-photos | Reuse capture's `storePhotoFiles`                                     | Separate path                                              | One place for the caps and sniffing (VULN-008/012/016).                                                                                                 |
| Document storage               | Bytes unchanged, content-addressed, sanitized basename                | Re-encode; original filename                               | Receipts must be evidentially intact; the full sha256 doubles as integrity check (VULN-018); basename stripping blocks traversal.                       |
| Category scope                 | Global table, seeded, AI may create up to a cap                       | Per-household; fixed list                                  | Single-household app; the cap exists because AI free text would otherwise grow the table without bound (VULN-019).                                      |
| AI transparency                | Manifest shows model, photo count, and the literal prompt before send | Summary only                                               | Product principle 4: the user sees exactly what is sent.                                                                                                |
| AI payload                     | Prompt + photos only; no item metadata                                | Include title/fields for context                           | Minimizes what leaves the device; the manifest can then be exact.                                                                                       |
| AI output validation           | Strict Zod per task; unknown keys stripped                            | Trust JSON as returned                                     | Spec §6: the model may not invent sub-limits or fields; a wrong serial is worse than a blank.                                                           |
| AI spend guard                 | Process-wide rolling-hour cap, refused before send                    | Per-user quota; none                                       | VULN-003; operator-controlled via `AI_MAX_CALLS_PER_HOUR`.                                                                                              |
| Audit log                      | Every call logged to `ai_interaction`, write-only today               | No log; log only applied                                   | CLAUDE.md names the audit log; spec §6 requires accountability for AI-derived data. The read side is an open question.                                  |
| Apply semantics                | Only non-empty fields written; never clears                           | Overwrite all suggested fields                             | A null suggestion must not erase user-entered data.                                                                                                     |

## Open Questions & Future Decisions

### Resolved

1. ✅ Dec-page parsing shares the AI core but belongs to coverage; enrich owns the registry and
   client, coverage owns the policy-apply step.

### Deferred

1. **Ownership checks on write actions.** Only delete verifies `householdId`. Decide whether to
   add the check to update, status, add-photos, and both AI actions (consistency and
   defense-in-depth) now that the household is a DB-enforced singleton.
2. **Flush vs. cancel on unmount.** The comment and the code disagree; the e2e helper waits for
   the POST, so tests do not catch the lost-edit case.
3. **AI provenance.** Applied values are stored as `source: "user"` and every outcome is
   `accepted`. The schema has `source: "ai"`, and outcomes `edited`/`rejected`. Decide whether
   provenance lives on the valuation row, on the interaction row, or both, and whether the audit
   log should be readable in the app.
4. **Document caps.** Documents have no size or quota limit and silent failure on rejection.
5. **Silent money parse failures** in the editor versus the explicit error on the policy form.
6. **Per-photo delete and reorder** for item photos; `sort_order` is never written.
7. **Transactions.** Patch + valuation + cost pointer are three statements.
8. **AI robustness**: no fetch timeout, fake mode skips schema validation, empty strings fail
   schemas instead of nulling.
9. **Tags.** `tag`/`item_tag` are in the schema and spec §5, with no UI or code path.
10. **Interaction-id ownership.** `applyItemSuggestion` sets the outcome on any integer id.

## References

- Product spec: `feature-spec.md` §3 P3/P4/P6, §4.2–4.3, §5 (item, document, category), §6.
- Upstream: `docs/intent/capture/capture-design.md` (admission helper, draft creation).
- Downstream and cross-segment: `docs/intent/keep-current/keep-current-design.md` (valuation
  history), `docs/intent/coverage/coverage-design.md` (threshold crossing, dec-page apply),
  `docs/intent/platform/platform-design.md` (media store, serving, schema).
- Operator configuration: `OPENROUTER_*`, `AI_MAX_CALLS_PER_HOUR`, `AI_FAKE`, `MAX_CATEGORIES`.
- Regression tests: `tests/unit/ai.test.ts` (VULN-003, VULN-013),
  `tests/unit/categories.security.test.ts` (VULN-019),
  `tests/unit/documents-action.security.test.ts` (VULN-015).
