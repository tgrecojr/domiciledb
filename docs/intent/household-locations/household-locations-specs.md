# Household and locations — EARS specs

Prefix `HOUSEHOLD`. Facets: `HH` (the household record and onboarding), `LOC` (locations),
`PHOTO` (room photos attached to a location).

Markers: `[x]` observed working in current code · `[ ]` specified, not yet implemented or partial
· `[D]` deferred.

## Household

- [x] **HOUSEHOLD-HH-001**: While no household exists, the home page shall render the create-household form (name required; address and description optional) instead of the dashboard, and every other page shall redirect to the home page.
- [x] **HOUSEHOLD-HH-002**: When the create-household form is submitted, the setup action shall require a trimmed non-empty name (otherwise "Give your household a name"), store blank optional fields as null, and revalidate the home page so the dashboard appears.
- [x] **HOUSEHOLD-HH-003**: The system shall allow exactly one household: the create path shall refuse a second with "A household is already set up", and the database shall reject a second row through a unique singleton constraint.
- [x] **HOUSEHOLD-HH-004**: The household record shall store a name, an optional description, an optional address, and created and updated timestamps.
- [D] **HOUSEHOLD-HH-005**: Where multiple properties are supported, each shall be a separate household with its own locations, items, and policy.
- [x] **HOUSEHOLD-HH-006**: The user shall be able to edit the household's name, address, and description after onboarding, from a Household page reached by a dashboard tile; a blank address or description shall clear the stored value.

## Locations

- [x] **HOUSEHOLD-LOC-001**: A location shall belong to the household and carry a name, a kind that is one of `room` (default), `garage`, `shed`, `storage`, `vehicle`, `safe_deposit`, or `on_loan`, and an optional description.
- [x] **HOUSEHOLD-LOC-002**: The locations page shall show an inline add form (name required, kind defaulting to room) and a list sorted by name showing each location's kind label, item count, photo count, an Edit link, and a Delete control.
- [x] **HOUSEHOLD-LOC-003**: When a location is created, the create action shall require a trimmed non-empty name (otherwise "Name is required") and a valid kind, and shall not accept a description.
- [x] **HOUSEHOLD-LOC-004**: The location edit page shall let the user change name, kind, and description with an explicit "Save changes" and a "Saved." confirmation, and the update action shall refuse with "Unknown location" when the location is not in the household.
- [x] **HOUSEHOLD-LOC-005**: When a location is deleted, its items shall become unassigned (location cleared, not deleted), its room photos and media directory shall be removed, and the user shall return to the locations list.
- [x] **HOUSEHOLD-LOC-006**: When the user deletes a location, the locations page shall require an in-page confirmation that states how many items will become unassigned.
- [x] **HOUSEHOLD-LOC-007**: The item count shown per location shall count every item in that location regardless of lifecycle status.
- [x] **HOUSEHOLD-LOC-008**: The location update, delete, add-photos, and delete-photo actions shall verify the location belongs to the household before writing.
- [x] **HOUSEHOLD-LOC-009**: An item shall be in at most one location at a time, and the user shall be able to move it by changing its location in the item editor.

## Room photos

- [x] **HOUSEHOLD-PHOTO-001**: The location edit page shall let the user add room photos through the native picker, submitting automatically on selection, admitted by the shared photo-admission helper (`CAPTURE-ADM`) and stored as original, web, and thumbnail variants under `media/locations/<locationId>/`.
- [x] **HOUSEHOLD-PHOTO-002**: Room photos shall be listed by sort order then id in a grid whose thumbnails open the lightbox, each with a per-photo delete control.
- [x] **HOUSEHOLD-PHOTO-003**: When a room photo is deleted, the delete action shall verify the photo belongs to the posted location, delete the row, and unlink only those variant files that no remaining room-photo row references.
- [x] **HOUSEHOLD-PHOTO-004**: Room photos shall be attached to the location, not to any item, and shall appear in the proof packet ahead of that room's item entries.
