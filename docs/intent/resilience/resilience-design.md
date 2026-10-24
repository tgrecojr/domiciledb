---
parent: high-level-design
prefix: RESILIENCE
---

# Resilience

## Context and Design Philosophy

The event the inventory exists for — fire, flood, theft — is also the event most likely to
destroy a self-hosted server in the same house. So resilience is not a feature to turn on later:
the product principle is that the data survives the event, and the spec makes off-site backup
mandatory and export first-class. Three commitments follow:

- **Three things leave the premises**: a restorable database snapshot, every photo and document,
  and the current proof packet, so the owner has a usable claim document even before a restore.
- **Backup is operator-configured and otherwise invisible.** The operator sets an S3-compatible
  target and a cron; the owner sees a status line and a "Back up now" button and never sees the
  bucket, endpoint, or schedule.
- **Nothing here is allowed to break the app.** Backup never throws, runs are single-flight,
  export is throttled, and a missing configuration is a clean no-op.

Resilience owns the backup job, the snapshot, the S3 adapter, the export route, the restore
script, the resilience page, and the single-flight utilities. It consumes the proof packet
(rendered for upload) and the platform's `DATA_DIR` layout and scheduler.

## Backup job

`runBackup(now)` (`src/lib/backup/run.ts:99-177`) is `singleFlight(runBackupOnce)`: concurrent
callers (the cron job and "Back up now") share one execution and receive the same status.

Sequence when `config.backup.enabled` (`S3_BUCKET` non-empty):

1. **Snapshot** — `createSnapshot()` (`snapshot.ts:20-43`): `PRAGMA wal_checkpoint(TRUNCATE)`,
   `VACUUM INTO '<target>.tmp-<pid>-<random>'`, then `rename` onto
   `DATA_DIR/backup/domiciledb-snapshot.db`. The canonical file is never absent or partial, which
   matters because `/api/export` reads it concurrently. On failure the temp file is removed and
   the error rethrown. Synchronous; blocks the event loop for the VACUUM.
2. **Upload the snapshot** to `backup/domiciledb-snapshot.db`, content type
   `application/x-sqlite3` (`run.ts:118-123`; keys in `plan.ts:10-11`).
3. **Render and upload the proof packet** for the household (first row) with no filter, writing
   it to `DATA_DIR/backup/proof-packet-latest.pdf` and uploading as
   `backup/proof-packet-latest.pdf` (`run.ts:127-136`). If no packet can be built, the previous
   remote PDF is left as is.
4. **Sync media** — list bucket keys under `media/`, walk `DATA_DIR/media`, map each file to its
   relative path as the key (`plan.ts:21-27`), upload only keys the bucket lacks
   (`plan.ts:14-19`; `run.ts:139-149`). Filenames are content-addressed, so an existing key means
   identical bytes. Nothing is ever deleted remotely.
5. **Write status** — `DATA_DIR/backup/status.json` with `at`, `status` (`ok` | `error` |
   `skipped`), optional `reason`, `snapshotBytes`, `pdfBytes`, `mediaUploaded`, `mediaSkipped`
   (`run.ts:21-33`).

When not configured, the run writes `status: "skipped", reason: "S3 not configured"` and does
nothing else (`run.ts:108-114`). On any throw, the raw error goes to the server log and the
status is `error` with the constant reason "Backup failed — see the server log for details"
(`run.ts:159-165`); SDK text never reaches the file. `runBackup` never rejects.

**Scheduling** (`src/lib/scheduler.ts:26-30`, file owned by platform): registered on
`BACKUP_CRON` (default `0 3 * * *`) when backup is enabled. `src/lib/config.ts` refuses to load
an expression `node-cron` cannot parse, so a typo stops startup like any other bad operator
config instead of silently skipping every backup. The job passes the fire-time ISO timestamp as
`now`.

**S3 adapter** (`s3.ts`): a fresh `S3Client` per call; `forcePathStyle` whenever a custom
`S3_ENDPOINT` is set (RustFS, B2, R2, MinIO); explicit credentials only when `S3_ACCESS_KEY_ID`
is non-empty, otherwise the SDK default chain (IAM roles work); `listKeys` follows continuation
tokens. `getObject` exists but the app does not call it.

**Reading status** (`readBackupStatus`, `run.ts:64-105`): returns null when the file is missing
or unparseable; coerces unknown statuses to `error`; always replaces `reason` with an app
constant; drops non-finite numbers. Older status files that carried an `error` field cannot leak
it.

## Export

`GET /api/export` (`src/app/api/export/route.ts`) streams a ZIP named
`domiciledb-export-YYYY-MM-DD.zip` containing a fresh `createSnapshot()` as
`domiciledb-snapshot.db` and the entire `media/` directory, compression level 6 (`:52-58,
77-86`). It needs no S3 configuration. It returns 404 without a household.

A module-level single-flight gate (`single-flight.ts:createSingleFlightGate`) with
`EXPORT_MIN_INTERVAL_SECONDS` (default 60) is claimed synchronously before the first `await`;
a concurrent request, or one within the interval of the last completed export, gets 429 with
`Retry-After` (`route.ts:20-36`). Because the export is reached by a plain link, the 429 body is
a small HTML page that says how many seconds to wait and links back to `/resilience`. The gate is
released on archive end, close, or error, so it covers the whole stream (`:65-75`). Each export
is a full VACUUM, hence the throttle.

## Restore

`npm run restore` → `scripts/restore.ts`, run with the app stopped and `DATA_DIR` plus `S3_*` in
the environment (scripts read `process.env` directly because they run under tsx without the `@/`
alias). It exits 1 without `S3_BUCKET` (`:25-29`), downloads the snapshot to
`DATA_DIR/domiciledb.db` and deletes any `-wal`/`-shm` sidecars (`:74-78`), then pages through
`media/`, keeps only the keys that a `photo`, `location_photo`, or `document` row in the restored
database references (the bucket is append-only, so it also holds media for things the owner has
since deleted), reports how many it skipped, and writes each kept object to its relative path.
Every key passes
`resolveWithinDataDir` (`scripts/restore-path.ts`), which rejects non-strings, NUL bytes, and any
resolution outside `DATA_DIR` including sibling-prefix directories; offending keys are logged and
skipped. Objects are buffered whole in memory. The PDF is not restored; it is derivable. The
downloaded snapshot must begin with the SQLite 3 file header (`isSqliteDatabase` in
`restore-path.ts`) or the script exits 1 before touching the live database, so an error page or a
truncated object stored under the snapshot key can never replace `domiciledb.db`.

The integration suite proves the round trip against RustFS: `runBackup` → bucket → `restore.ts`
into an empty directory yields the same household row and byte-identical media
(`tests/integration/backup.test.ts:75-126`).

## Resilience page

`/resilience` (`src/app/resilience/page.tsx`) shows, under "Off-site backup", either "Not
configured" with a hint naming `S3_BUCKET`, or the last run's time, status, "N new files, db X KB"
on success, or the sanitized reason on error (`:37-70`). "Back up now" posts `backupNowAction`
(`src/lib/actions/backup.ts`), which runs the job and redirects back; the button is disabled when
backup is not configured (`:79`). The page deliberately never reveals the bucket, endpoint, or
cron (`:38-39`). A second card links to `/api/export`; a throttled request lands on the route's
retry page.

## Concurrency guards

`src/lib/single-flight.ts` provides two primitives used only by this segment:

- `createSingleFlightGate(minIntervalMs)` — `tryEnter()` must be called synchronously before any
  `await`; returns `{ ok, retryAfterSec, reason: "in-flight" | "too-soon" }` with
  `retryAfterSec ≥ 1`; `release(completed)` starts the minimum-interval clock only when
  `completed` is true.
- `singleFlight(fn)` — later callers during a run receive the first call's promise (and result);
  their own arguments are ignored.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Backup transport | S3-compatible object storage | rsync/SFTP; cloud-vendor SDK; local USB | Spec §9 and §11: S3 is universal (AWS, B2, R2, MinIO) and matches a single-file SQLite plus flat media. |
| What is backed up | Snapshot + media + current PDF | Snapshot + media only | Spec §9's triad: the PDF is the artifact the owner needs first, before any restore. |
| Snapshot method | `VACUUM INTO` temp file, atomic rename | Copy the live file; `.backup` API; stop-the-world | VULN-001: a consistent, compact file that is never partially visible to the concurrent export. |
| Media sync | Upload only keys absent in the bucket; never delete | Full sync with pruning; rsync-style mtime | architecture.md: content-addressed names make "absent" equal "new"; no pruning avoids a bug deleting evidence. |
| Bucket growth | Append-only bucket; restore brings back only objects the restored database references | Prune on backup; bucket lifecycle rules; restore everything | Off-site evidence must survive a mistaken local delete, and a restore must not resurrect orphan files. Reference-filtering at restore time gives both; the bucket's growth is bounded by what the owner ever captured, which is acceptable for one household. |
| Key scheme | S3 key = DB-stored `DATA_DIR`-relative path | Hash-only keys; per-date prefixes | README/CLAUDE.md: mount-independent restore — a restore writes each object back to its stored path. |
| Concurrency | `singleFlight` for backup, min-interval gate for export | Queue; lock file; allow overlap | VULN-011 and VULN-002: overlapping VACUUMs and uploads on a single-user box are a self-inflicted denial of service. |
| Failure surface | Constant reason in status and UI; detail only in server log | Show SDK error text | VULN-006: the app has no auth, so the resilience page must not leak bucket, endpoint, or network detail. |
| Not configured | Clean no-op with `skipped` status | Refuse to start; nag | README and configuration.md: fully usable with no S3; principle 7 keeps it operator-side. |
| Manual trigger | "Back up now" joins any in-flight run | Separate run; disabled during cron | The owner wants "is my data off-site now"; joining gives a truthful answer without a second VACUUM. |
| Restore shape | Standalone script, app stopped, env-driven | In-app restore UI | README runbook: restore happens on a fresh machine where the app may not run yet; a UI restore into a live DB is risky. |
| Restore containment | Resolve every key within `DATA_DIR`; skip escapers | Trust bucket contents | VULN-005: a tampered bucket must not write outside the data directory. |
| Export format | ZIP of snapshot + media, streamed | PDF only; JSON | Spec §9: complete inventory out (data + photos + documents) for anti-lock-in; ZIP needs no reader software. |
| Invalid `BACKUP_CRON` | Config refuses to load; startup fails | Warn and skip scheduling; fall back to the default | Every other malformed operator value already fails fast; a backup that silently never runs is the worst outcome for principle 2. |
| Throttled export | HTML retry page with the seconds to wait and a link back | Plain-text 429; a client-side fetch with a blob download | The export is a plain link so the browser renders whatever the route returns; buffering a multi-GB ZIP in a client fetch is not acceptable. |
| Restore snapshot validation | SQLite header check before the live db is replaced; exit 1 otherwise | Trust the bucket; open with SQLite and run `PRAGMA integrity_check` | The header check is dependency-free in a standalone script and catches the realistic failures (error page, empty or truncated object). A full integrity check is a possible follow-up. |

## Open Questions & Future Decisions

### Resolved
1. ✅ Backup target and frequency are operator configuration (spec §11).
2. ✅ The app is fully usable with no S3 configured.
3. ✅ An invalid `BACKUP_CRON` fails startup (RESILIENCE-BACKUP-003).
4. ✅ Restore validates the snapshot header before overwriting the live database
   (RESILIENCE-RESTORE-005).
5. ✅ A throttled export returns a readable retry page (RESILIENCE-EXPORT-004).
6. ✅ The bucket is append-only; restore downloads only referenced media
   (RESILIENCE-BACKUP-007, RESILIENCE-RESTORE-007).

### Deferred
1. **Restore the PDF?** Derivable from db + media, but the spec's triad suggests parity.
2. **S3 client per call**, HEIC originals as `application/octet-stream`, restore buffering whole
   objects, synchronous VACUUM on the event loop — performance hygiene, not correctness.
3. **Status timestamp locale** is the server's, not the viewer's.
4. **`getObject` in the app's S3 adapter has no caller**; restore has its own client.

## References

- Product spec: `feature-spec.md` §3 P2, §9 (resilience), §11.
- Runbook: `README.md` (data layout, backup, restore, export), `docs/configuration.md`.
- Upstream: `docs/intent/proof-packet/proof-packet-design.md` (packet rendered for upload),
  `docs/intent/platform/platform-design.md` (`DATA_DIR` layout, scheduler, media store).
- Operator configuration: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `BACKUP_CRON`, `EXPORT_MIN_INTERVAL_SECONDS`.
- Tests: `tests/unit/snapshot.security.test.ts` (VULN-001),
  `tests/unit/export-route.security.test.ts` (VULN-002),
  `tests/unit/restore-path.security.test.ts` (VULN-005),
  `tests/unit/backup-run.security.test.ts` (VULN-006, VULN-011),
  `tests/integration/backup.test.ts`, `tests/e2e/resilience.spec.ts`.
