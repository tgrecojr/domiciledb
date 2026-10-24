# Resilience — EARS specs

Prefix `RESILIENCE`. Facets: `BACKUP` (the scheduled and manual S3 backup job), `EXPORT` (the ZIP
export endpoint), `RESTORE` (the restore script), `UI` (the resilience page).

Markers: `[x]` observed working in current code · `[ ]` specified, not yet implemented or partial
· `[D]` deferred.

## Backup

- [x] **RESILIENCE-BACKUP-001**: Backup shall be enabled if and only if `S3_BUCKET` is non-empty; while disabled, a backup run shall write a status of `skipped` with reason "S3 not configured" and do nothing else.
- [x] **RESILIENCE-BACKUP-002**: While backup is enabled and `BACKUP_CRON` (default `0 3 * * *`) is a valid cron expression, the system shall schedule a backup run on that expression at boot.
- [x] **RESILIENCE-BACKUP-003**: If `BACKUP_CRON` is not a valid cron expression, then operator configuration shall fail to load and the server shall not serve, rather than silently skipping scheduled backups.
- [x] **RESILIENCE-BACKUP-004**: When a snapshot is created, the system shall checkpoint the WAL, `VACUUM INTO` a uniquely named temporary file, and atomically rename it onto `backup/domiciledb-snapshot.db`, so the canonical snapshot is never missing or partial; on failure the temporary file shall be removed.
- [x] **RESILIENCE-BACKUP-005**: A backup run shall upload, in order, the snapshot as `backup/domiciledb-snapshot.db`, the current unfiltered proof packet as `backup/proof-packet-latest.pdf` (also written to `DATA_DIR/backup/`), and then each media file whose key is absent from the bucket.
- [x] **RESILIENCE-BACKUP-006**: The S3 key of every media object shall equal the `DATA_DIR`-relative path stored in the database, and a media file shall be uploaded only when that key is absent from the bucket.
- [x] **RESILIENCE-BACKUP-007**: A backup run shall never delete or overwrite media objects already in the bucket; the bucket is append-only so that off-site evidence survives a local deletion.
- [x] **RESILIENCE-BACKUP-008**: When a backup run is requested while another is in progress (for example "Back up now" during the cron run), the requests shall share the single in-progress run and receive its status.
- [x] **RESILIENCE-BACKUP-009**: Every backup run shall end by writing `DATA_DIR/backup/status.json` with the run time, a status of `ok`, `error`, or `skipped`, and, when applicable, a reason, snapshot bytes, PDF bytes, media uploaded, and media skipped.
- [x] **RESILIENCE-BACKUP-010**: If a backup run fails, then the system shall log the underlying error on the server, write status `error` with the constant reason "Backup failed — see the server log for details", and shall never place the bucket name, endpoint, schedule, or any SDK text in the status file or the UI.
- [x] **RESILIENCE-BACKUP-011**: When backup status is read, the system shall return null for a missing or unparseable file, coerce an unknown status to `error`, replace any stored reason with an app-authored constant, and drop non-finite numeric fields.
- [x] **RESILIENCE-BACKUP-012**: The S3 adapter shall use path-style addressing whenever a custom `S3_ENDPOINT` is set, shall pass explicit credentials only when `S3_ACCESS_KEY_ID` is non-empty (otherwise using the SDK default credential chain), and shall follow continuation tokens when listing.
- [x] **RESILIENCE-BACKUP-013**: The backup run shall never reject; every outcome shall be reported through the returned status.

## Export

- [x] **RESILIENCE-EXPORT-001**: The export endpoint shall stream a ZIP named `domiciledb-export-YYYY-MM-DD.zip` containing a freshly created consistent snapshot as `domiciledb-snapshot.db` and the entire `media/` tree, and shall respond 404 when no household exists.
- [x] **RESILIENCE-EXPORT-002**: The export endpoint shall allow one export at a time per process and at most one every `EXPORT_MIN_INTERVAL_SECONDS` (default 60); a concurrent or too-soon request shall receive 429 with a `Retry-After` header, and the gate shall be held until the stream ends.
- [x] **RESILIENCE-EXPORT-003**: The export endpoint shall work without any S3 configuration.
- [x] **RESILIENCE-EXPORT-004**: If the export endpoint throttles a request, then its 429 response shall be a readable HTML page that says how many seconds to wait and links back to the resilience page, in addition to the `Retry-After` header.

## Restore

- [x] **RESILIENCE-RESTORE-001**: When the restore script runs with `DATA_DIR` and `S3_*` set and the app stopped, it shall download the snapshot to `DATA_DIR/domiciledb.db`, remove any `-wal` and `-shm` sidecars, and download every object under `media/` to its `DATA_DIR`-relative path.
- [x] **RESILIENCE-RESTORE-002**: If an object key would resolve outside `DATA_DIR` (parent traversal, an absolute path, a NUL byte, or a sibling-prefix directory), then the restore script shall log and skip that object.
- [x] **RESILIENCE-RESTORE-003**: If `S3_BUCKET` is missing or any download fails, then the restore script shall exit with status 1.
- [D] **RESILIENCE-RESTORE-004**: Where the bucket holds `backup/proof-packet-latest.pdf`, the restore script shall also restore it to `DATA_DIR/backup/`.
- [x] **RESILIENCE-RESTORE-005**: Before overwriting `DATA_DIR/domiciledb.db`, the restore script shall verify the downloaded snapshot begins with the SQLite 3 file header, and shall exit with status 1 leaving the live database untouched otherwise.
- [x] **RESILIENCE-RESTORE-006**: A backup followed by a restore into an empty `DATA_DIR` shall reproduce the database rows and byte-identical media files.
- [x] **RESILIENCE-RESTORE-007**: When restoring media, the restore script shall download only objects whose key is referenced by a photo, room-photo, or document row in the restored database, and shall report how many unreferenced objects it left in the bucket.

## Resilience page

- [x] **RESILIENCE-UI-001**: While backup is not configured, the resilience page shall show "Not configured" with a hint naming `S3_BUCKET`; otherwise it shall show the last run's time and status with "N new files, db X KB" on success or the sanitized reason on error.
- [x] **RESILIENCE-UI-002**: The resilience page shall offer a "Back up now" button that runs a backup and returns to the page, and shall disable it while backup is not configured.
- [x] **RESILIENCE-UI-003**: The resilience page shall never display the bucket name, endpoint, or backup schedule.
- [x] **RESILIENCE-UI-004**: The resilience page shall offer a link to the full ZIP export.
