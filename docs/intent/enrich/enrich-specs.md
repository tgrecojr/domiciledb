# Enrich — EARS specs

Prefix `ENRICH`. Facets: `LIST` (items list and worklist), `ITEM` (item detail page, editor,
status, delete), `PHOTO` (item photos after capture), `DOC` (documents), `CAT` (categories),
`AI` (AI assist for items; the dec-page task is specified under `COVERAGE`).

Markers: `[x]` observed working in current code · `[ ]` specified, not yet implemented or partial
· `[D]` deferred.

## Items list and worklist

- [x] **ENRICH-LIST-001**: The items list shall show every item in the household regardless of draft or complete status, newest first.
- [x] **ENRICH-LIST-002**: When the items list is opened with `?location=<id>`, it shall show only items in that location; with `?location=unassigned`, only items with no location; with any other value, all items.
- [x] **ENRICH-LIST-003**: While the household has at least one location, the items list shall show a location filter in the page header, and changing it shall navigate so the filter is carried in the URL.
- [x] **ENRICH-LIST-004**: Each items-list row shall show the item's first photo as a thumbnail (or a placeholder), the title, the location name or "Unassigned", and an amber "Draft" pill when the item is a draft.
- [x] **ENRICH-LIST-005**: While the items list is empty under a location filter, it shall say "No items in this location." with a "Show all items" link; while empty with no filter, it shall say "No items yet." with a capture call to action.
- [x] **ENRICH-LIST-006**: The worklist shall list only items with status `draft`, and while it is empty shall say "All caught up" with a "Capture more" link.

## Item detail page and editor

- [x] **ENRICH-ITEM-001**: If the requested item id is not an integer or the item belongs to another household, then the item detail page shall respond 404.
- [x] **ENRICH-ITEM-002**: While an item is a draft, the item detail page shall show a non-blocking "You might still add:" hint naming whichever of photo, category, location, manufacturer, and serial number are missing; a complete item shall show no hint.
- [x] **ENRICH-ITEM-003**: The item editor shall auto-save 800 ms after any field change and on blur of any field, and shall have no save button.
- [x] **ENRICH-ITEM-004**: If the title field is empty when a save would fire, then the item editor shall show "Title is required" and shall not call the server.
- [x] **ENRICH-ITEM-005**: When the user leaves the item detail page while a debounced save is pending, the item editor shall flush that save rather than cancel it.
- [x] **ENRICH-ITEM-006**: The item editor shall show one status text at a time in the precedence pending ("Saving…"), then the latest error, then "Saved ✓".
- [x] **ENRICH-ITEM-007**: The item editor shall edit: title, category, location, manufacturer, model number, serial number, quantity, condition, age estimate, replacement cost, price paid, purchase date, lifecycle status, lifecycle date, and description.
- [x] **ENRICH-ITEM-008**: The item editor shall accept replacement cost and price paid as dollar strings on a decimal keypad, and the item update action shall convert them to integer cents.
- [x] **ENRICH-ITEM-009**: When the item update action receives a submission, it shall require a trimmed non-empty title, a quantity that is an integer from 1 to 1,000,000 (default 1), a lifecycle status from the lifecycle enum (default `active`), and category and location ids that are positive integers or empty.
- [x] **ENRICH-ITEM-010**: When the item update action saves an item whose lifecycle status is `active`, it shall clear the lifecycle date.
- [x] **ENRICH-ITEM-011**: When the item update action saves, it shall overwrite the item's category and location with the submitted values, so an empty selection clears them.
- [x] **ENRICH-ITEM-012**: When the item update action receives a non-empty replacement cost or price paid that does not parse as a non-negative dollar amount, it shall save nothing and return the error "Enter replacement cost as a dollar amount" or "Enter price paid as a dollar amount"; a blank value shall be treated as no value.
- [x] **ENRICH-ITEM-013**: When the item update action saves a replacement cost or price paid, it shall record it through the valuation history (keep-current's `recordValuations`) rather than writing the item row directly.
- [x] **ENRICH-ITEM-014**: When an item save escalates the household's coverage status (per the coverage segment's threshold-crossing rule) and a Coverage B limit exists, the item update action shall return a coverage alert and the item editor shall show it inline after the save.
- [x] **ENRICH-ITEM-015**: The item detail page shall offer a status toggle, "Mark complete" for a draft and "Move back to drafts" for a complete item, and the status action shall accept only `draft` or `complete`.
- [x] **ENRICH-ITEM-016**: When the user starts deleting an item, the item detail page shall require an in-page second confirmation ("Yes, delete") that warns photos and documents will be deleted too.
- [x] **ENRICH-ITEM-017**: When an item is deleted, the delete action shall verify the item belongs to the household, hard-delete the row (cascading its photos, valuations, documents, tags, and reminders while AI interactions keep a null item reference), remove its media directories, and redirect to the items list.
- [x] **ENRICH-ITEM-018**: The item update, status, add-photos, add-document, delete-document, and AI suggest/apply actions shall verify the item belongs to the household before writing, as the delete action does.
- [x] **ENRICH-ITEM-019**: The item editor shall state next to the replacement-cost field that the value counts toward the coverage total multiplied by quantity.

## Item photos

- [x] **ENRICH-PHOTO-001**: The item detail page shall offer an "Add" photo tile that opens the native picker with a rear-camera hint and submits automatically on selection.
- [x] **ENRICH-PHOTO-002**: When photos are added to an existing item, the add-photos action shall admit them through the shared photo-admission helper (`CAPTURE-ADM`) and attach each admitted photo as kind `general`.
- [x] **ENRICH-PHOTO-003**: The item detail page shall show photo thumbnails that open a full-screen lightbox of the web-size image with a "View original" link, closing on backdrop click or Escape.
- [x] **ENRICH-PHOTO-004**: Item photos shall be ordered by sort order then id, and the items-list thumbnail shall be the first photo in that order.
- [D] **ENRICH-PHOTO-005**: Where an item has photos, the item detail page shall let the user delete or reorder an individual photo without deleting the item.

## Documents

- [x] **ENRICH-DOC-001**: The item detail page shall let the user attach one document at a time (PDF or image, required) with a kind of receipt (default), warranty, or manual, and an optional warranty expiry date.
- [x] **ENRICH-DOC-002**: When a document is attached, the add-document action shall admit it on sniffed bytes (JPEG, PNG, WebP, HEIC, or PDF), store the bytes unchanged under `media/documents/items/<itemId>/<sha256>-<sanitized filename>`, and record its kind, filename, and content hash.
- [x] **ENRICH-DOC-003**: When a document is attached with kind `warranty`, the add-document action shall store the warranty expiry date; for any other kind it shall store no expiry.
- [x] **ENRICH-DOC-004**: If the attached document is missing, over the per-file cap, over the media quota, or its bytes are not an admitted type, then the add-document action shall store nothing and return to the item page with `docError` set to `missing`, `size`, `quota`, or `type` respectively.
- [x] **ENRICH-DOC-005**: The item detail page shall list documents oldest first with filename, kind label, and "expires YYYY-MM-DD" when set, each linking to the stored file.
- [x] **ENRICH-DOC-006**: When a document is removed, the delete-document action shall delete the row and then unlink the stored file.
- [x] **ENRICH-DOC-007**: Document uploads shall be subject to the same per-file size cap and media quota as photos, and while `docError` is set the item detail page shall show an amber notice naming the reason and that nothing was saved.
- [x] **ENRICH-DOC-008**: Document filenames shall be reduced to a basename, restricted to `[A-Za-z0-9._-]`, capped at 120 characters, and replaced by "file" when empty, before use on disk.

## Categories

- [x] **ENRICH-CAT-001**: When the category table is empty at boot, the system shall insert the 15 default categories (Electronics, Appliances, Furniture, Jewelry, Art, Firearms, Tools, Kitchenware, Clothing, Sporting Goods, Musical Instruments, Collectibles, Books & Media, Outdoor & Garden, Other).
- [x] **ENRICH-CAT-002**: Categories shall be global rather than per household and shall be listed alphabetically.
- [x] **ENRICH-CAT-003**: When a category name is resolved by find-or-create, the system shall match an existing category case-insensitively ignoring surrounding whitespace, and otherwise create a new category with the trimmed name.
- [x] **ENRICH-CAT-004**: If the number of categories has reached `MAX_CATEGORIES`, then find-or-create shall not create a new category and shall return no category.
- [D] **ENRICH-CAT-005**: Where free-form tags are enabled, an item shall carry zero or more tags, each with a unique name.

## AI assist for items

- [x] **ENRICH-AI-001**: While `OPENROUTER_API_KEY` is empty, the item detail page shall not render the AI assist panel and the AI actions shall refuse with "AI is not configured."
- [x] **ENRICH-AI-002**: The AI assist panel shall offer four item tasks: identify item, read serial plate, draft description, and suggest replacement cost.
- [x] **ENRICH-AI-003**: When the user picks an AI task, the panel shall show a consent card naming the model, whether and how many photos will be sent (each resized to at most 1024 px), and the literal prompt text, and shall send nothing until the user clicks "Send to AI".
- [x] **ENRICH-AI-004**: While an AI task needs a photo and the item has none, the panel shall disable "Send to AI" and say "This item has no photo to send."
- [x] **ENRICH-AI-005**: When an item AI task is sent, the AI action shall transmit only the task's literal prompt and up to 6 of the item's photos re-encoded as JPEG, with no item metadata, system prompt, or other fields.
- [x] **ENRICH-AI-006**: If more than 6 photos would be sent in one AI call, then the AI action shall refuse before contacting the provider.
- [x] **ENRICH-AI-007**: The system shall cap paid provider calls at `AI_MAX_CALLS_PER_HOUR` per process over a rolling hour, and shall refuse excess calls without sending them.
- [x] **ENRICH-AI-008**: When a provider reply arrives, the AI action shall extract the first JSON object, validate it against the task's schema (nullable fields, non-negative numbers, unknown keys stripped), and treat any mismatch as a failure with an app-authored message.
- [x] **ENRICH-AI-009**: The AI action shall record every provider call, successful or failed, as an `ai_interaction` row with the action, model, prompt text, photo references, and the response or error.
- [x] **ENRICH-AI-010**: When a suggestion arrives, the AI assist panel shall show it as editable fields with "Nothing is saved until you click Apply.", and Discard shall abandon it without writing.
- [x] **ENRICH-AI-011**: When the user applies a suggestion, the apply action shall write only non-empty fields (identify → manufacturer, model number, category; serial plate → serial number, model number; describe → description; suggest cost → replacement cost through the valuation history) and shall never clear an existing field.
- [x] **ENRICH-AI-012**: When a suggestion is applied, the apply action shall mark the originating interaction's outcome `accepted` when no field was edited.
- [x] **ENRICH-AI-013**: When a suggestion is applied after the user edited any field, the apply action shall record outcome `edited`; when the user discards a suggestion, the panel shall record outcome `rejected`.
- [x] **ENRICH-AI-014**: When an AI-suggested replacement cost is applied, the resulting valuation shall be recorded with source `ai`, not `user`.
- [x] **ENRICH-AI-015**: AI task prompts shall instruct the model never to guess serial or model numbers and to return null when unsure.
- [x] **ENRICH-AI-016**: If the provider is unreachable, returns a non-2xx status, or returns an unreadable body, then the AI action shall surface only an app-authored message and never the provider's response text.
- [x] **ENRICH-AI-017**: While `AI_FAKE=1`, the AI action shall return deterministic canned suggestions without network access.
- [x] **ENRICH-AI-018**: When a suggestion is applied, the apply action shall verify the interaction id belongs to the item being edited before recording an outcome.
- [x] **ENRICH-AI-019**: The AI action shall accept a task key only if it is an own property of the task registry, so prototype names such as `__proto__` are rejected.
