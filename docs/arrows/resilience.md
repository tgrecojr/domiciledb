# Arrow: resilience

The data survives the event: a consistent SQLite snapshot, the media tree, and the latest proof
packet synced to S3 on a cron; a full ZIP export on demand; a restore runbook that rebuilds
`DATA_DIR` from the bucket; and the concurrency guards that keep all of it single-flight.

## Status

**AUDITED** — mapped and audited 2026-10-24 (git SHA `59605b6`, uncommitted working tree). Specs
verified against code and annotated at every entry point; in the same pass an invalid
`BACKUP_CRON` became a startup failure, restore validates the snapshot header and brings back
only referenced media, and a throttled export returns a readable retry page. Every active spec
is implemented.

## References

### HLD
- docs/high-level-design.md (Tenets: the data survives the event; Non-Goals)

### LLD
- docs/intent/resilience/resilience-design.md

### EARS
- docs/intent/resilience/resilience-specs.md (28 specs: 13 BACKUP, 4 EXPORT, 7 RESTORE, 4 UI)

### Tests
- tests/unit/backup-plan.test.ts
- tests/unit/backup-run.security.test.ts (VULN-006, VULN-011)
- tests/unit/snapshot.security.test.ts (VULN-001)
- tests/unit/export-route.security.test.ts (VULN-002)
- tests/unit/restore-path.security.test.ts (VULN-005; snapshot header check; referenced-only restore)
- tests/unit/config.test.ts (`BACKUP_CRON` validation)
- tests/integration/backup.test.ts (RustFS round trip, including `scripts/restore.ts`)
- tests/e2e/resilience.spec.ts

### Code
- src/lib/backup/plan.ts, snapshot.ts, s3.ts, run.ts
- src/lib/single-flight.ts
- src/lib/actions/backup.ts
- src/app/api/export/route.ts
- src/app/resilience/page.tsx
- scripts/restore.ts, scripts/restore-path.ts
- src/lib/scheduler.ts (backup cron registration; file owned by platform)
- src/lib/config.ts (`BACKUP_CRON` validation; file owned by platform)

## Architecture

**Purpose:** A home inventory that burned with the house has failed. Backup and export are
first-class and non-optional: the operator points the app at an S3-compatible bucket and the
inventory, its photos and documents, and a current claim packet leave the premises every night
without the owner doing anything; the owner can also pull a complete ZIP at any time; and a
documented script rebuilds the data directory from the bucket.

**Key Components:**
1. `createSnapshot` (`src/lib/backup/snapshot.ts`) — WAL checkpoint, `VACUUM INTO` a unique temp
   file, atomic rename; the canonical snapshot is never missing mid-run.
2. `runBackup` (`src/lib/backup/run.ts`) — single-flighted: snapshot → latest proof packet →
   media files whose keys are absent in the bucket; writes a sanitized `status.json`; never
   throws.
3. `plan.ts` / `s3.ts` — fixed keys, media key = stored relative path, upload-if-absent,
   path-style S3 with optional explicit credentials.
4. `GET /api/export` — ZIP of a fresh snapshot plus the whole media tree, throttled by a
   single-flight gate with a minimum interval.
5. `scripts/restore.ts` — app-stopped runbook: snapshot to `domiciledb.db`, every `media/` object
   back to its relative path, with zip-slip containment.
6. `/resilience` page — status without operator details, "Back up now", export link.

## Spec Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| Backup | RESILIENCE-BACKUP-001 to 013 | 13 | 0 | 0 |
| Export | RESILIENCE-EXPORT-001 to 004 | 4 | 0 | 0 |
| Restore | RESILIENCE-RESTORE-001 to 007 | 6 | 1 | 0 |
| Resilience page | RESILIENCE-UI-001 to 004 | 4 | 0 | 0 |

**Summary:** 27 of 27 active specs implemented; 0 gaps; 1 deferred (restoring the PDF).

**Traceability (audit 2026-10-24):** every active spec is cited by `@spec` in code (RESTORE-006,
the round-trip property, is cited in its integration test). Specs with a citing test: 21 of 27
(unit `backup-plan`, `backup-run.security`, `snapshot.security`, `export-route.security`,
`restore-path.security`, `config`; integration `backup.test.ts`, which needs S3 and runs in CI
against RustFS; e2e `resilience.spec.ts`). Pinned by code review only: BACKUP-007, -012, -013,
RESTORE-003, UI-004. No reverse orphans.

## Key Findings

1. **Snapshot atomicity is tested.** The previous snapshot still exists and is non-empty at the
   moment `VACUUM INTO` runs for the next one (`src/lib/backup/snapshot.ts:25-41`;
   `tests/unit/snapshot.security.test.ts:39-55`, VULN-001).
2. **Backup contents match the spec's triad** (db, media, current PDF) but **restore brings back
   two of three** — the PDF is not fetched; it is derivable (`scripts/restore.ts`; README.md:91).
3. **An invalid `BACKUP_CRON` fails startup.** `config.ts` validates the expression with
   `node-cron`, so a typo cannot silently skip every backup (`config.test.ts`).
4. **The bucket is append-only and restore is reference-filtered.** A backup never deletes
   remote media; restore reads the restored database and downloads only objects a photo,
   room-photo, or document row references, reporting how many it skipped
   (`scripts/restore.ts`, `restore-path.ts`; `backup.test.ts` in CI).
5. **Status and UI never leak operator details.** Reasons are app constants; legacy `error`
   fields are stripped on read; the page shows neither bucket nor endpoint nor schedule
   (`run.ts:64-105, 159-165`; `resilience/page.tsx:37-39`; VULN-006).
6. **Cron and manual runs join.** `singleFlight` returns the in-flight promise to later callers,
   so "Back up now" during a cron run receives the cron's result and timestamp (`run.ts:168-177`;
   `single-flight.ts:75-91`; VULN-011).
7. **Export is throttled process-wide** with `EXPORT_MIN_INTERVAL_SECONDS` and the gate held for
   the full stream (`src/app/api/export/route.ts`; VULN-002). A throttled request receives an
   HTML page naming the seconds to wait and linking back, since the export is a plain link.
8. **Restore is zip-slip safe** (`scripts/restore-path.ts`, VULN-005) and **validates the
   snapshot header** before replacing the live database; it still buffers whole objects in memory.
9. **A new S3 client is built per call** (`src/lib/backup/s3.ts:37, 50, 70`); `getObject` has no
   in-app caller (restore has its own client). HEIC originals upload as `application/octet-stream`
   (`run.ts:49-56`).
10. **The PDF is rendered for the first household row only** (`run.ts:127-136`); fine under the
    singleton invariant.
11. **`status.json` timestamps are formatted in the server's locale** (`resilience/page.tsx:12-15`).
12. **Scripts read `process.env` directly** by design (no `@/` alias under tsx), an exception to
    the config-only rule (`scripts/restore.ts:21-39`).

## Work Required

### Must Fix
1. None at the data-safety level: snapshot, round trip, and containment are tested.

### Should Fix
2. None outstanding.

### Nice to Have
3. Reuse one S3 client; set HEIC content type; stream restore downloads.
4. Restore the PDF too, or document why not (RESILIENCE-RESTORE-004).
