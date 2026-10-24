# Keep current — EARS specs

Prefix `CURRENT`. Facets: `LIFE` (item lifecycle), `VAL` (valuation history and the current
pointers), `REMIND` (re-valuation and warranty-expiry reminders).

Markers: `[x]` observed working in current code · `[ ]` specified, not yet implemented or partial
· `[D]` deferred.

## Lifecycle

- [x] **CURRENT-LIFE-001**: Every item shall carry a lifecycle status that is one of `active`, `sold`, `disposed`, `gifted`, `broken`, or `replaced`, defaulting to `active`.
- [x] **CURRENT-LIFE-002**: While an item's lifecycle status is anything other than `active`, the item may carry a lifecycle date; when the status is set to `active`, the lifecycle date shall be cleared.
- [x] **CURRENT-LIFE-003**: When an item's lifecycle status changes away from `active`, the item shall stop counting toward the coverage total and shall be omitted from the proof packet on the next read, without being deleted.
- [x] **CURRENT-LIFE-004**: Lifecycle status shall be independent of the draft/complete status; either may be changed without affecting the other.
- [x] **CURRENT-LIFE-005**: The lifecycle statuses shall be shown to the user with the labels Active, Sold, Disposed, Gifted, Broken, and Replaced.

## Valuation history

- [x] **CURRENT-VAL-001**: Valuations shall be kept as an append-only history per item, each row carrying a kind (`price_paid`, `replacement_cost`, or `acv`), an amount in integer cents, a valued-at timestamp, a source (`user` or `ai`), and an optional note.
- [x] **CURRENT-VAL-002**: When a replacement cost is recorded for an item, a new history row shall be appended only if the amount differs from the item's latest replacement-cost row.
- [x] **CURRENT-VAL-003**: When a replacement cost is recorded for an item and it differs from the latest replacement-cost row, the item's current replacement cost and current-replacement-valued-at pointers shall be set to the new amount and the current time; when the amount is unchanged, both pointers shall be left untouched so the last-valued date reflects the last change, not the last save.
- [x] **CURRENT-VAL-004**: The latest valuation of a given kind for an item shall be the row with the greatest valued-at timestamp, ties broken by the highest id.
- [x] **CURRENT-VAL-005**: When a price paid is recorded for an item, a new history row shall be appended only if the amount differs from the latest price-paid row, with valued-at equal to the supplied purchase date or, absent one, the current time.
- [x] **CURRENT-VAL-006**: The item's current values presented for editing shall be the latest replacement-cost amount and the latest price-paid amount with that row's valued-at as the purchase date.
- [ ] **CURRENT-VAL-007**: When only the purchase date changes while the price-paid amount is unchanged, the system shall record the new purchase date.
- [ ] **CURRENT-VAL-008**: The user shall be able to clear an item's replacement cost so that the item becomes unvalued (excluded from totals and counted as not yet valued) again.
- [x] **CURRENT-VAL-009**: The application shall never update or delete a valuation row; rows shall be removed only by cascade when their item is deleted.
- [x] **CURRENT-VAL-010**: When a valuation is recorded, the recording function shall accept and store the caller's source (`user` or `ai`) rather than always writing `user`.
- [D] **CURRENT-VAL-011**: Where actual cash value is tracked, the system shall record a valuation of kind `acv` representing the replacement cost adjusted for age and condition.
- [x] **CURRENT-VAL-012**: An item's current replacement cost shall be the per-unit value; consumers shall multiply by quantity.

## Reminders

- [ ] **CURRENT-REMIND-001**: The system shall run a daily scan that creates a `revaluation` reminder for each active item whose current replacement cost was last valued more than `REVALUATION_CADENCE_DAYS` ago and that has no undismissed revaluation reminder.
- [ ] **CURRENT-REMIND-002**: The daily scan shall create a `warranty_expiry` reminder for each warranty document whose expiry date has passed or falls within the warranty lead time (to be decided) and that has no undismissed warranty-expiry reminder.
- [ ] **CURRENT-REMIND-003**: The system shall show the owner their undismissed reminders, each naming the item and the reason, with a way to dismiss.
- [ ] **CURRENT-REMIND-004**: When the owner dismisses a reminder, or re-values the item a revaluation reminder refers to, the reminder shall be marked dismissed and shall no longer be shown.
- [x] **CURRENT-REMIND-005**: `REVALUATION_CADENCE_DAYS` shall be operator configuration with no end-user setting, shall default to 90, and shall be rejected at startup unless it is a positive integer.
- [x] **CURRENT-REMIND-006**: The reminder table shall store a kind (`revaluation` or `warranty_expiry`), a due date, an optional dismissed date, and an optional item reference that cascades when the item is deleted.
- [D] **CURRENT-REMIND-007**: Where an item is flagged as high-value, the revaluation scan shall apply a shorter cadence to it.
