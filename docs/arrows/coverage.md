# Arrow: coverage

The insurance spine: total active replacement cost versus the Coverage B – Personal Property
limit, the within / approaching / over status and its contextual alerts, the money conversion
rules, and the policy record (typed by hand or pre-filled from a declarations page) that supplies
the limit.

## Status

**AUDITED** — mapped and audited 2026-10-24 (git SHA `59605b6`, uncommitted working tree). Specs
verified against code and annotated at every entry point; the manual policy form now errors on
any unparseable amount (COVERAGE-POLICY-005), dec-page applies record provenance
(COVERAGE-DECPAGE-007), and the coverage module owns the totalling rules the packet consumes.
Every active spec is implemented.

## References

### HLD
- docs/high-level-design.md (Problem; Key Design Decisions: replacement-cost basis, Coverage B
  only, informational framing)

### LLD
- docs/intent/coverage/coverage-design.md

### EARS
- docs/intent/coverage/coverage-specs.md (35 specs: 10 CALC, 4 MONEY, 6 UI, 7 POLICY, 8 DECPAGE)

### Tests
- tests/unit/coverage.test.ts (100% line/function, 90% branch gate)
- tests/unit/money.test.ts (same gate)
- tests/unit/policy.security.test.ts (VULN-022)
- tests/unit/policy-action.test.ts (manual save: amount errors, overwrite semantics)
- tests/e2e/coverage.spec.ts
- tests/e2e/ai.spec.ts (dec-page pre-fill case)
- tests/integration/db-queries.test.ts (coverage-aggregation cases)

### Code
- src/lib/coverage.ts
- src/lib/money.ts
- src/lib/queries/coverage.ts
- src/lib/queries/policy.ts
- src/lib/actions/policy.ts
- src/components/coverage-widget.tsx
- src/app/policy/page.tsx, policy-form.tsx, decpage-parse.tsx
- src/lib/actions/items.ts (coverage-alert branch of `updateItemAction`; file owned by enrich)
- src/lib/actions/ai.ts (`aiParseDecPageAction`; file owned by enrich)
- src/app/page.tsx (renders `CoverageWidget`; file owned by platform)

## Architecture

**Purpose:** Answer the one question that decides whether the owner gets paid in full: is the
replacement value of what they actively own within the policy's personal-property limit? Coverage
is ambient (a dashboard card and a nudge right after the item that crossed a line), informational
(always "verify with your insurer"), and conservative (replacement cost, active items only,
unvalued items surfaced as excluded so the total reads "at least").

**Key Components:**
1. `computeCoverage` / `crossedThreshold` (`src/lib/coverage.ts`) — pure: total, percentage,
   status, excluded count, escalation detection.
2. `getCoverageSummary` (`src/lib/queries/coverage.ts`) — feeds every item's denormalized
   replacement cost, quantity, and lifecycle status plus the policy's Coverage B and
   `COVERAGE_WARN_PCT` into the pure spine.
3. `money.ts` — the only dollars↔cents conversion in the app.
4. `CoverageWidget` and the inline editor alert — the two places coverage surfaces.
5. Policy record — one row per household (DB-enforced), manual form with Coverage B foregrounded,
   dec-page AI pre-fill that merges into the existing row after user review.

## Spec Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| Computation | COVERAGE-CALC-001 to 010 | 10 | 0 | 0 |
| Money | COVERAGE-MONEY-001 to 004 | 4 | 0 | 0 |
| Surfaces | COVERAGE-UI-001 to 006 | 6 | 0 | 0 |
| Policy record | COVERAGE-POLICY-001 to 007 | 6 | 1 | 0 |
| Dec-page pre-fill | COVERAGE-DECPAGE-001 to 008 | 7 | 1 | 0 |

**Summary:** 33 of 33 active specs implemented; 0 gaps; 2 deferred (per-category sub-limits, PDF
dec pages). The policy saved from a dec-page parse now carries `source: "ai"` and records the
interaction outcome (COVERAGE-DECPAGE-007; `decpage-apply.test.ts`).

**Traceability (audit 2026-10-24):** every active spec is cited by `@spec` in code. Specs with a
citing test: all ten CALC specs, MONEY-001 to -003, UI-002, UI-006, POLICY-001, POLICY-004 to
-006, DECPAGE-001, -002, -005 (unit `coverage.test.ts`, `money.test.ts`, `policy.security.test.ts`,
`policy-action.test.ts`; integration `db-queries.test.ts`; e2e `coverage.spec.ts`, `ai.spec.ts`).
Untested by assertion: MONEY-004 (convention), UI-001, UI-003 to -005, POLICY-002, -003,
DECPAGE-003, -004, -006. No reverse orphans.

## Key Findings

1. **Exactly 100% is "approaching", not "over"** (`src/lib/coverage.ts:86-87`;
   `tests/unit/coverage.test.ts:80-88`). Deliberate and tested.
2. **Two totalling spines.** `coverage.ts` clamps the running total to the safe-integer range
   (`:66-69`); `report.ts` (proof-packet) sums the same items without a clamp (`report.ts:68,
   106`). The two can disagree only under absurd inputs, but the duplication is real.
3. **`hasPolicy` is true with a null Coverage B** (`src/lib/queries/coverage.ts:38`); the widget
   compensates by also checking `limitCents` and `status` (`coverage-widget.tsx:32`).
4. **Manual save overwrites, dec-page apply merges — by design.** The form clears any blank
   field and now errors on an unparseable amount in any of Coverage B, A, C, or the deductible
   (`src/lib/actions/policy.ts`, `firstAmountError`; `tests/unit/policy-action.test.ts`);
   dec-page apply keeps stored values for missing or unparseable fields because the parse is a
   suggestion and the form is authoritative.
5. **Policy source is always `user`**, including after a dec-page apply (`queries/policy.ts:38`),
   and dec-page apply records no `ai_interaction` outcome (`actions/policy.ts:62-89`).
6. **Percent label is deliberately uncapped** — the bar caps at 100% for layout but the text
   reads 130% when the household is 30% over, which is the signal (`coverage-widget.tsx:53, 71`).
7. **Dec-page parser accepts images only** (`decpage-parse.tsx:103`), and a failed apply shows a
   fixed "Could not save coverage." that drops the server's message (`:80`).
8. **Negative limit is untested** — the unit title says "zero/negative" but exercises only 0
   (`tests/unit/coverage.test.ts:123`); the code treats `<= 0` as no limit (`coverage.ts:74-83`).
9. **The real dec page grounds the fixtures**: Coverage B $456,750 appears in the unit test, the
   fake AI provider, and the policy-form placeholder.
10. **Best-tested segment.** `coverage.ts` and `money.ts` sit under the 100%/90% unit gate;
    integration and e2e cover the lifecycle → total and threshold → nudge paths.

## Work Required

### Must Fix
1. None. The spine's arithmetic and thresholds are pinned by tests.

### Should Fix
2. Record provenance when policy values come from a dec-page parse, and record the interaction
   outcome (COVERAGE-DECPAGE-007) — scheduled with enrich's AI provenance change.
3. Consolidate the two totalling implementations or make their shared rule explicit
   (cross-segment with proof-packet).

### Nice to Have
4. Accept PDF declarations pages (COVERAGE-DECPAGE-008).
5. Add the negative-limit unit case.
