# Capture — EARS specs

Prefix `CAPTURE`. Facets: `UI` (the capture page and form), `FLOW` (the capture Server Action),
`ADM` (the shared photo-admission helper `storePhotoFiles`, which capture owns and which item
add-photos and location photos also call).

Markers: `[x]` observed working in current code · `[ ]` specified, not yet implemented or partial
· `[D]` deferred.

## Capture page and form

- [x] **CAPTURE-UI-001**: The capture page shall offer a native file picker that accepts multiple images and hints the rear camera, and shall not depend on a live camera API or on HTTPS.
- [x] **CAPTURE-UI-002**: The capture form shall mark no field as required; title and location shall be labelled optional.
- [x] **CAPTURE-UI-003**: When the user selects photos on the capture form, the form shall show a thumbnail preview of each selected photo before submission.
- [x] **CAPTURE-UI-004**: The capture form shall offer two submit intents, "Save & add another" and "Save & finish details", and shall disable both while a submission is pending.
- [x] **CAPTURE-UI-005**: When the capture page is opened with `?saved=1`, the capture form shall show a success banner inviting the user to capture the next item or finish details later.
- [x] **CAPTURE-UI-006**: When the capture page is opened with `?error=empty`, the capture form shall show "Add at least one photo or a title."
- [x] **CAPTURE-UI-007**: The capture page's location picker shall list the household's locations plus an unassigned choice, and shall default to unassigned.

## Capture action

- [x] **CAPTURE-FLOW-001**: If no household exists when a capture is submitted, then the capture action shall create nothing and redirect to `/`.
- [x] **CAPTURE-FLOW-002**: If a capture submission contains no non-empty photo and no non-empty title, then the capture action shall create nothing and redirect to `/capture?error=empty`.
- [x] **CAPTURE-FLOW-003**: When a capture submission contains at least one photo or a title, the capture action shall create one item in the household with status `draft` and lifecycle status `active`.
- [x] **CAPTURE-FLOW-004**: When a capture submission has no title, the capture action shall title the new draft "Untitled item".
- [x] **CAPTURE-FLOW-005**: When a capture submission names a location, the capture action shall assign the draft to it only if the value is a positive-integer id of a location in the household; otherwise the draft shall be created unassigned.
- [x] **CAPTURE-FLOW-006**: The capture action shall create the draft item row before storing its photos, so every stored photo is written under that item's own media directory.
- [x] **CAPTURE-FLOW-007**: When photos are admitted during a capture, the capture action shall attach each to the new draft as a photo of kind `general`.
- [x] **CAPTURE-FLOW-008**: When a capture succeeds with intent `details`, the capture action shall redirect to the new item's detail page.
- [x] **CAPTURE-FLOW-009**: When a capture succeeds with any intent other than `details`, the capture action shall redirect to `/capture?saved=1`.
- [x] **CAPTURE-FLOW-010**: When a capture succeeds, the capture action shall revalidate the worklist and the items list so the new draft appears on both.
- [x] **CAPTURE-FLOW-011**: The capture action shall accept a single photo larger than 1 MB (up to the configured per-file cap) in one submission.
- [x] **CAPTURE-FLOW-012**: If one or more submitted photos were rejected by admission or failed to store during a capture, then the capture action shall carry the count to the page it redirects to (`?dropped=N` on the capture page or the new item's page), and that page shall tell the user how many photos were not saved.
- [D] **CAPTURE-FLOW-013**: Where the user marks a capture shot as a condition photo or a serial-plate photo, the capture action shall store it with that photo kind instead of `general`.

## Shared photo admission (`storePhotoFiles`)

- [x] **CAPTURE-ADM-001**: The shared photo-admission helper (used by capture, item add-photos, and location photos) shall admit at most `UPLOAD_MAX_FILES_PER_REQUEST` files per request and shall drop the remainder with a server-side warning.
- [x] **CAPTURE-ADM-002**: The shared photo-admission helper shall skip any file whose declared size is zero.
- [x] **CAPTURE-ADM-003**: If a file's declared size exceeds `UPLOAD_MAX_FILE_MB`, then the shared photo-admission helper shall reject it from the declared size alone, without reading its bytes, and log a warning.
- [x] **CAPTURE-ADM-004**: The shared photo-admission helper shall decide each file's type from its magic bytes and shall never trust the client-declared MIME type.
- [x] **CAPTURE-ADM-005**: If a file's bytes are not a recognized photo format (JPEG, PNG, WebP, or HEIC), then the shared photo-admission helper shall skip the file.
- [x] **CAPTURE-ADM-006**: When the shared photo-admission helper stores a file, it shall pass the sniffed MIME type, not the declared one, to the storage callback.
- [x] **CAPTURE-ADM-007**: If admitting a file would exceed the remaining media quota (`MEDIA_MAX_TOTAL_MB` minus bytes already under the media directory), then the shared photo-admission helper shall stop admitting the rest of that request's files and log a warning.
- [x] **CAPTURE-ADM-008**: Within one request, the shared photo-admission helper shall charge the media quota by each admitted file's original size.
- [x] **CAPTURE-ADM-009**: If the storage callback throws for a file, then the shared photo-admission helper shall log exactly one line with control characters removed and length bounded, and shall continue with the next file.
- [x] **CAPTURE-ADM-010**: The shared photo-admission helper shall return the number of files it stored.
