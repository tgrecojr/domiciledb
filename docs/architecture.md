# Architecture

High-level map of DomicileDB. See `CLAUDE.md` for conventions and `feature-spec.md` for the
product spec.

## Request / data flow

```
Browser (mobile-first PWA)
   │  server actions / route handlers
   ▼
Next.js App Router (src/app)
   │  query + logic modules (src/lib, src/lib/queries)
   ▼
Drizzle ORM  ──►  better-sqlite3 (WAL)  ──►  $DATA_DIR/domiciledb.db
```

## Key modules

| Path                     | Responsibility                                             |
| ------------------------ | ---------------------------------------------------------- |
| `src/lib/config.ts`      | The only reader of `process.env`; typed operator config    |
| `src/db/schema.ts`       | Single source of truth for the data model (money in cents) |
| `src/db/index.ts`        | Shared WAL connection opened from `DATA_DIR`               |
| `src/db/migrate.ts`      | `runMigrations()` used on boot                             |
| `src/instrumentation.ts` | Migrate-on-boot + start the in-process scheduler           |
| `src/lib/scheduler.ts`   | node-cron jobs (backup, staleness, warranty)               |
| `src/lib/coverage.ts`    | Insurance spine: replacement-cost total vs. Coverage B     |

## Storage layout (`$DATA_DIR`)

```
domiciledb.db (+ -wal, -shm)   live SQLite
backup/domicile-snapshot.db    VACUUM INTO snapshot  -> S3 (Phase 4)
backup/proof-packet-latest.pdf last PDF export       -> S3 (Phase 4)
media/items/<itemId>/...        photos               -> S3 (Phase 4)
media/documents/<docId>/...     attachments          -> S3 (Phase 4)
```

Media paths are stored **relative** to `DATA_DIR` so restore is mount-independent.

## Build phases

0. Walking skeleton — stack, schema, migrate-on-boot, household end-to-end _(current)_
1. Capture loop — locations, quick capture → draft items, worklist
2. Enrichment + valuation + coverage dashboard
3. Proof-packet PDF
4. Resilience — S3 backup/restore + export
5. AI Assist — OpenRouter, preview→confirm→execute
