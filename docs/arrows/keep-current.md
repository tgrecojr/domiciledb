# Arrow: keep-current

Trustworthy means current: item lifecycle statuses, the append-only valuation history with its
last-valued pointer, and the re-valuation and warranty-expiry reminders that are specified but not
yet built.

## Status

**AUDITED** — mapped and audited 2026-10-24 (git SHA `f74d36b`). Specs
verified against code and annotated at every entry point; the valued-at pointer rule
(CURRENT-VAL-003) was fixed and is pinned by the integration test. Intent still exceeds the code:
reminders exist only as a table, a config key, and a commented-out scheduler stub, and are
scheduled to be built after the segment audits.

## References

### HLD
- docs/high-level-design.md (Tenets: trustworthy means current; Goals)

### LLD
- docs/intent/keep-current/keep-current-design.md

### EARS
- docs/intent/keep-current/keep-current-specs.md (24 specs: 5 LIFE, 12 VAL, 7 REMIND)

### Tests
- tests/integration/db-queries.test.ts (valuation-history and lifecycle → coverage cases)
- tests/e2e/item-edit.spec.ts (sold → dashboard total drops)
- No test touches reminders.

### Code
- src/lib/lifecycle.ts
- src/lib/queries/valuations.ts
- src/db/schema.ts (`valuation`, `reminder`, `REMINDER_KINDS`, `item.current_replacement_*`; file owned by platform)
- src/lib/config.ts (`valuation.revaluationCadenceDays`; file owned by platform)
- src/lib/scheduler.ts (commented-out daily scan; file owned by platform)
- src/app/items/[id]/item-edit-form.tsx (lifecycle fields; file owned by enrich)
- src/lib/actions/items.ts (lifecycle-date rule in `updateItemAction`; file owned by enrich)
- src/lib/actions/documents.ts (`warrantyExpiresAt`; file owned by enrich)

## Architecture

**Purpose:** Keep the record honest after the capture burst ends. Items that were sold, broken,
or replaced must stop counting; values must carry the date they were last set; and the product,
not the owner's memory, must prompt re-review of aging values and expiring warranties.

**Key Components:**
1. **Lifecycle** (`src/lib/lifecycle.ts`) — six statuses with labels; `active` is the only one
   that counts for coverage and the packet; a lifecycle date accompanies the others.
2. **Valuation history** (`src/lib/queries/valuations.ts`) — append-only rows per item and kind,
   deduplicated on unchanged amounts, with denormalized `current_replacement_cost` and
   `current_replacement_valued_at` on the item for fast aggregation and staleness.
3. **Reminders** (intended) — a daily scan over `REVALUATION_CADENCE_DAYS` and warranty expiry
   dates writing `reminder` rows; nothing implements, surfaces, or dismisses them today.

## Spec Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| Lifecycle | CURRENT-LIFE-001 to 005 | 5 | 0 | 0 |
| Valuation history | CURRENT-VAL-001 to 012 | 9 | 1 | 2 |
| Reminders | CURRENT-REMIND-001 to 007 | 2 | 1 | 4 |

**Summary:** 16 of 22 active specs implemented; 6 gaps (CURRENT-VAL-007 purchase-date-only
changes, CURRENT-VAL-008 clearing a replacement cost, and CURRENT-REMIND-001 to 004); 2
deferred (actual cash value, high-value cadence). Valuation rows now carry their source
(CURRENT-VAL-010, built with enrich's AI provenance change).

**Traceability (audit 2026-10-24):** every active spec with a code anchor is cited by `@spec`
(lifecycle constants, `recordValuations`, `currentValuations`, the lifecycle-date rule in the
item update action, the active filters in `coverage.ts` and `report.ts`, and the schema, config,
and scheduler lines placed by the platform pass). REMIND-003 and -004 have no anchor until the
reminder surface exists. Specs with a citing test: LIFE-003, VAL-002, VAL-003, VAL-005, VAL-006
(integration) and LIFE-003 (e2e). No reverse orphans.

## Key Findings

1. **Reminders are specified but not built.** The scheduler's daily scan is a reserved comment
   (`src/lib/scheduler.ts`), `config.valuation.revaluationCadenceDays` is validated but has no
   consumer, and the `reminder` table has no reader or writer. CLAUDE.md and `docs/architecture.md`
   now say so plainly; CURRENT-REMIND-001 to 004 carry the intent and are the next planned change.
2. **"Last valued" now means last changed.** `recordValuations` moves
   `current_replacement_valued_at` only when a new replacement-cost row is appended
   (`src/lib/queries/valuations.ts:39-62`); an autosave with an unchanged amount leaves the date
   alone, so a cadence reminder can fire. Pinned by `tests/integration/db-queries.test.ts`.
3. **A replacement cost can never be cleared.** A null input is a no-op; no path writes
   `current_replacement_cost = NULL` (`valuations.ts:38`).
4. **Changing only the purchase date is silently dropped** when the price-paid amount is unchanged
   (`valuations.ts:63-75`).
5. **Every valuation is written with `source: "user"`**, including AI-applied costs
   (`valuations.ts:48, 71`); the `ai` enum value and `kind = "acv"` are never written.
6. **Lifecycle date is forced null when status is `active`** (`src/lib/actions/items.ts:153-154`);
   otherwise it is free text, not validated as a date.
7. **Lifecycle is tested only through `sold`** (`tests/e2e/item-edit.spec.ts:44-58`;
   `tests/integration/db-queries.test.ts:148-154`).
8. **Reminders would cascade-delete with the item** (`reminder.item_id ON DELETE CASCADE`) while
   AI interactions survive with a null reference; consistent with reminders being transient.

## Work Required

### Must Fix
1. Build the reminder scan, surfacing, and dismissal (CURRENT-REMIND-001 to 004) as one change
   after the segment audits. This is the largest intent gap in the repository.

### Should Fix
3. Allow clearing a replacement cost (CURRENT-VAL-008).
4. Record purchase-date-only changes (CURRENT-VAL-007).
5. Carry a `source` through `recordValuations` (CURRENT-VAL-010; pairs with ENRICH-AI-014).

### Nice to Have
6. Validate lifecycle date as a date.
7. Unit-test lifecycle statuses other than `sold`.
