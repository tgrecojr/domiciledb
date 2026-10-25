# Arrow: proof-packet

The claim-ready PDF: the household inventory organized by room with photos, specs, values,
attached-document kinds, totals by room and category, and the coverage summary, for the whole
household or a single location or category.

## Status

**OK** — mapped and audited 2026-10-24 (git SHA `f74d36b`). Specs
verified against code and annotated at every entry point; in the same pass the packet took the
coverage module's totalling rules, photo order now matches the item page, receipt images are
embedded, and the report page withholds the whole-household link above the item cap. Every
active spec is implemented.

## References

### HLD

- docs/high-level-design.md (Goals: the headline output; Non-Goals: structured export)

### LLD

- docs/intent/proof-packet/proof-packet-design.md

### EARS

- docs/intent/proof-packet/proof-packet-specs.md (29 specs: 12 DATA, 12 PDF, 5 ROUTE)

### Tests

- tests/unit/report.test.ts (100% line/function, 90% branch gate)
- tests/unit/receipts.test.ts
- tests/unit/report-page.test.ts (item-cap notice)
- tests/unit/paginate.test.ts
- tests/unit/proof-packet-route.security.test.ts (VULN-010)
- tests/e2e/report.spec.ts
- tests/integration/db-queries.test.ts (location-filtered packet case)

### Code

- src/lib/report.ts
- src/lib/queries/report.ts
- src/lib/pdf/proof-packet.tsx, render.tsx, images.ts, receipts.ts, paginate.ts, styles.ts
- src/lib/coverage.ts (`itemValueCents`, `addCents`; file owned by coverage)
- src/lib/queries/items.ts (`countActiveItems`; file owned by enrich)
- src/app/api/proof-packet/route.ts
- src/app/report/page.tsx

## Architecture

**Purpose:** Produce the document the owner hands an adjuster. It must be credible (photos,
serials, receipts), complete for the scope requested, and honest about what is not yet valued.
It is print-ready PDF, generated on demand, never stored except as the latest copy the backup
uploads.

**Key Components:**
1. `assembleReport` (`src/lib/report.ts`) — pure: active items into rooms, room and grand
   totals, category totals, excluded count, deterministic ordering.
2. `getReportPacket` (`src/lib/queries/report.ts`) — batched reads of items, categories, photos,
   documents, latest price paid, location names and room photos, plus household and a fresh
   coverage summary; applies the location or category filter and labels it.
3. `renderProofPacket` (`src/lib/pdf/render.tsx`) — loads and downscales up to 4 photos per item
   and per room from the originals, one at a time, then renders `ProofPacketDocument`.
4. `ProofPacketDocument` (`src/lib/pdf/proof-packet.tsx`) — summary page then room pages in
   explicit 10-item chunks (`paginate.ts`).
5. `GET /api/proof-packet` and `/report` — the link page and the route with the item cap.

## Spec Coverage

| Category       | Spec IDs                | Implemented | Deferred | Gaps |
| -------------- | ----------------------- | ----------- | -------- | ---- |
| Assembly       | PACKET-DATA-001 to 012  | 12          | 0        | 0    |
| Document       | PACKET-PDF-001 to 012   | 12          | 0        | 0    |
| Route and page | PACKET-ROUTE-001 to 005 | 5           | 0        | 0    |

**Summary:** 29 of 29 active specs implemented; 0 gaps; 0 deferred.

**Traceability (audit 2026-10-24):** every spec is cited by `@spec` in code. Specs with a citing
test: all 12 DATA specs, PDF-004, PDF-011, ROUTE-001, -003 to -005 (unit `report.test.ts`,
`paginate.test.ts`, `receipts.test.ts`, `report-page.test.ts`, `proof-packet-route.security.test.ts`;
integration `db-report-items.test.ts`; e2e `report.spec.ts`). Pinned by code review only: the
layout specs PDF-001 to -003, -005 to -010, -012, and ROUTE-002 (real rendering is exercised
end to end). No reverse orphans.

## Key Findings

1. **Explicit pagination exists because react-pdf's auto-pagination is O(n²)** and crashed past
   about 80 items; rooms are chunked at 10 items per page (`src/lib/pdf/paginate.ts:4-7, 9`).
2. **Photos are re-encoded from the originals** because react-pdf cannot embed WebP; each is
   downscaled to 600 px JPEG, sequentially, and failures are skipped silently
   (`src/lib/pdf/images.ts:9-12, 29-46`; `render.tsx:12, 20-31`).
3. **Receipt images are embedded.** Up to two image receipts per item render under the photos
   (`src/lib/pdf/receipts.ts`, `render.tsx`, `proof-packet.tsx`); every document is listed as
   kind (filename). PDF receipts are named, not rasterized: the runtime image has no PDF
   renderer.
4. **One totalling spine.** `report.ts` consumes `itemValueCents` and `addCents` from
   `coverage.ts`, so room, category, and grand totals are clamped exactly like the dashboard
   total; `report.test.ts` pins the overflow case.
5. **The item cap is enforced in the route and announced on the page.** `PROOF_PACKET_MAX_ITEMS`
   (default 2000) returns 413 with guidance to narrow by location or category
   (`src/app/api/proof-packet/route.ts`); `/report` counts active items and replaces the
   whole-household link with a notice above the cap (`report-page.test.ts`).
6. **Packet photos follow `sort_order` then id**, like the item page (`queries/report.ts`;
   `db-report-items.test.ts`).
7. **"Latest" price paid is a lexicographic max on `valued_at`**, which mixes date-only purchase
   dates with full ISO timestamps (`queries/report.ts:105-126`; `valuations.ts:70`).
8. **A location literally named "Unassigned" would sort last and share the label** with the
   no-location room, though grouping is by id (`report.ts:62, 114-118`).
9. **Category filter label falls back to "Category: Selected"** when the filtered set is empty
   (`queries/report.ts:151`).
10. **Serial numbers print in plain text** (`proof-packet.tsx:80`); the PDF is a sensitive
    artifact and is also uploaded to S3 by the backup.
11. **Real rendering is exercised only end-to-end**; both unit route tests mock the renderer.

## Work Required

### Must Fix

1. None. Every spec is implemented and annotated; assembly is under the 100% gate.

### Should Fix

2. None outstanding.

### Nice to Have

3. Make "latest price paid" compare dates, not strings.
4. Guard the "Unassigned" label collision; a renderer smoke test on a small packet.
