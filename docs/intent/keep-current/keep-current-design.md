---
parent: high-level-design
prefix: CURRENT
---

# Keep current

## Context and Design Philosophy

An inventory that was accurate two years ago is a liability in a claim conversation: it lists the
television that was sold, values the laptop at its 2024 price, and misses that the warranty on the
dishwasher expired. The owner captures in bursts and will not revisit items unprompted, so
keeping the record current has to be structural:

- **Lifecycle, not deletion.** Items the owner no longer has stay in the record with a status and
  a date; they simply stop counting. Deletion is for mistakes.
- **Values carry their date.** Every value is a dated history row, and the item carries a
  "current" pointer with a last-valued timestamp so staleness is a query, not a guess.
- **The product reminds.** Aging values and expiring warranties generate reminders on an
  operator-set cadence. The owner dismisses or acts; nothing silently rots.

The first two are implemented and tested. The third is specified in the product spec and in the
project's own instructions, has a table, a config key, and a scheduler slot, and has no code.
This design describes both the current and the intended state and marks the boundary.

## Lifecycle

`LIFECYCLE_STATUSES = ["active", "sold", "disposed", "gifted", "broken", "replaced"]` with display
labels (`src/lib/lifecycle.ts:6-13`); the item column defaults to `active`
(`src/db/schema.ts:120`). Lifecycle is orthogonal to the draft/complete `status` column: a sold
item can still be a draft, and a complete item can be marked broken.

Rules in force:

- Only `active` items count toward coverage and appear in the proof packet
  (`src/lib/coverage.ts:45-47`; `src/lib/report.ts:77`). Changing status away from `active` drops
  the item from both on the next read (`tests/e2e/item-edit.spec.ts:44-58`).
- The editor exposes status and a lifecycle date (`item-edit-form.tsx:206-335`); the update action
  forces the date to null when status is `active` and otherwise stores the submitted text without
  date validation (`src/lib/actions/items.ts:153-154`).
- No transition rules exist: any status may become any other.

## Valuation history

The `valuation` table (`src/db/schema.ts:165-180`) is append-only: `item_id`, `kind`
(`price_paid` | `replacement_cost` | `acv`), `amount` integer cents, `valued_at` ISO text,
`source` (`user` | `ai`, default `user`), `note`. The item row carries two denormalized pointers,
`current_replacement_cost` (per unit; consumers multiply by quantity) and
`current_replacement_valued_at` (`schema.ts:128-131`).

`recordValuations(itemId, { replacementCostCents?, pricePaidCents?, purchaseDate? })`
(`src/lib/queries/valuations.ts:19-76`):

- "Latest" per item and kind is `ORDER BY valued_at DESC, id DESC LIMIT 1` (`:8-17`).
- **Replacement cost**: when non-null, append a row only if the amount differs from the latest,
  and in the same branch set the item's `current_replacement_cost`,
  `current_replacement_valued_at`, and `updated_at`; an unchanged amount touches nothing, so the
  last-valued date records the last change rather than the last autosave (`:39-62`). A null
  input does nothing, so a cost can never be cleared.
- **Price paid**: when non-null, append a row only if the amount differs; `valued_at` is the
  purchase date when supplied, else now (`:63-73`). A date change with an unchanged amount
  records nothing.
- Every row is written with `source: "user"` (`:48, 71`); the AI apply path in enrich reaches
  this function with no way to say otherwise.
- Nothing updates or deletes valuation rows; they go only with the item (FK cascade).

`currentValuations(itemId)` returns the latest replacement cost and the latest price paid with its
`valued_at` as the purchase date (`:79-86`); the editor and the proof packet read these.

Two statements per save, no transaction (`:42-60`).

## Reminders — intended and current

**Intended** (spec §4.4, §5 Document, §7 freshness; CLAUDE.md principle 5): a daily scan creates
a `revaluation` reminder for each active item whose value is older than the cadence, and a
`warranty_expiry` reminder for each warranty document approaching or past its expiry. Reminders
are surfaced to the owner, who dismisses them or acts (re-values, updates lifecycle). Cadence is
global, defaults to quarterly, and is operator configuration, never a user setting.

**Current**: the `reminder` table exists (`src/db/schema.ts:267-280`: `item_id` nullable with
cascade, `kind` in `REMINDER_KINDS`, `due_at`, `dismissed_at`, index on `due_at`);
`REVALUATION_CADENCE_DAYS` is parsed and validated as a positive integer, default 90
(`src/lib/config.ts:141-144`); the scheduler reserves the slot as a comment
(`src/lib/scheduler.ts:34-35`); `warrantyExpiresAt` is captured on warranty documents
(`src/lib/actions/documents.ts:40`). No code reads or writes `reminder`, no UI shows one, and no
test mentions them. The module CLAUDE.md names, `src/lib/staleness.ts`, does not exist.

The scan depends on `current_replacement_valued_at` meaning "last changed", not "last saved";
CURRENT-VAL-003 fixes the pointer rule first. The scan, its dashboard surface, and dismissal are
to be built as one change once the eight segments are audited.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Disposal model | Lifecycle status + date; row stays | Delete; archive flag | Spec §4.4 and §5: history survives, totals exclude; a claim may need to show what was owned at a date. |
| Which status counts | `active` only | Configurable set | Spec §7: the claim picture is what the owner holds now. |
| Lifecycle vs. completeness | Two independent columns | One combined state | architecture.md: draft/complete is about data entry, lifecycle is about the object; conflating them would make a sold draft impossible. |
| Value storage | Append-only history + denormalized current pointer | Columns on the item only; history only | architecture.md: history gives dated provenance; the pointer makes coverage a single-table aggregate and carries the staleness timestamp. |
| Duplicate suppression | No new row when the amount equals the latest | Row on every save | Autosave would otherwise write a history row on every blur; identical amounts carry no information. |
| Pointer refresh | Only when the amount changes (a history row is appended) | On every save with a non-null cost; an explicit "still correct" control | The editor autosaves on blur of any field, so a save is not a re-confirmation of the value; moving the date only on change makes the cadence reminder meaningful. An explicit re-confirm control can be added later without changing this rule. |
| Price-paid date | `valued_at` = purchase date when given | Separate purchase-date column | One timestamp column serves both kinds; the purchase date is the valuation date for price paid. |
| Reminder cadence | Global, operator env, default 90 days | Per-item; user setting | Spec §4.4 and §11, principle 7. |
| Reminder kinds | `revaluation`, `warranty_expiry` | Also lifecycle review, backup health | Spec §4.4 and §5 name exactly these two. |
| Reminder lifetime | Cascade with the item | Survive as audit | A reminder about a deleted item is noise; schema chooses cascade here and set-null for AI interactions. |

## Open Questions & Future Decisions

### Resolved
1. ✅ Re-valuation cadence is global, defaults to quarterly, operator-set (spec §11).
2. ✅ "Last valued" means last changed: the pointers move only when a replacement-cost row is
   appended (CURRENT-VAL-003).
3. ✅ Reminders will be built, not retracted: scan, surface, and dismissal as one change after the
   segment audits; the warranty lead time and the surface are decided in that change.

### Deferred
1. **Clearing a value.** There is no way to make a valued item unvalued again.
2. **Purchase-date-only edits** are dropped when the amount is unchanged.
3. **Source on valuation rows.** `recordValuations` hardcodes `user`; enrich's AI apply needs to
   pass `ai` (ENRICH-AI-014).
4. **Actual cash value.** `kind = "acv"` exists in the schema and spec §5/§7 describe an ACV view;
   nothing computes or stores it.
5. **"High-value" as a reminder criterion** (spec §4.4) has no definition or threshold.
6. **Lifecycle date validation** — stored as free text.
7. **Transactions** around the valuation insert and pointer update.

## References

- Product spec: `feature-spec.md` §3 P5, §4.4 (keep current), §5 Valuation and Document, §7
  freshness, §11 resolved decisions.
- Upstream: `docs/intent/enrich/enrich-design.md` (editor fields, AI apply, warranty expiry
  capture), `docs/intent/platform/platform-design.md` (schema, scheduler, config key).
- Downstream: `docs/intent/coverage/coverage-design.md`,
  `docs/intent/proof-packet/proof-packet-design.md` (consume the active filter and the current
  pointer).
- Operator configuration: `REVALUATION_CADENCE_DAYS`.
- Tests: `tests/integration/db-queries.test.ts` (valuation history), `tests/e2e/item-edit.spec.ts`.
