# DomicileDB — Architecture

This document explains how DomicileDB is built. See [`../feature-spec.md`](../feature-spec.md) for
_what_ it does and why, and [`./configuration.md`](./configuration.md) for operator configuration.

## Guiding principle

Every feature is judged against one question: **does this help the user win the claim conversation
and get paid?** The architecture serves that: a mobile-first capture loop, an insurance-grade
valuation/coverage model, a claim-ready PDF, and data that survives destruction of the home.

## Stack & rationale

| Layer     | Choice                              | Why                                                                             |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| Framework | Next.js 15 App Router + React 19    | One language end-to-end; server actions for the AI proxy; PWA                   |
| DB        | SQLite via Drizzle + better-sqlite3 | Single file = trivial S3 backup/restore; no engine binary (distroless-friendly) |
| UI        | Tailwind + Serwist PWA              | Mobile-first capture is the primary surface                                     |
| Media     | sharp on the filesystem             | Keeps the DB tiny + snapshots fast; content-addressed S3 sync                   |
| PDF       | @react-pdf/renderer                 | Pure-JS, no headless Chromium → slim distroless image                           |
| Backup    | @aws-sdk/client-s3                  | S3-compatible (AWS S3 / Backblaze B2 / Cloudflare R2)                           |
| AI        | OpenRouter via `fetch`              | OpenAI-compatible vision; full control over the "exactly what's sent" payload   |

## Request / data flow

```
Browser (mobile-first PWA)
   │  server actions (mutations) · route handlers (media / pdf / export)
   ▼
Next.js App Router (src/app)
   │  query + logic modules (src/lib, src/lib/queries)
   ▼
Drizzle ORM  ──►  better-sqlite3 (WAL)  ──►  $DATA_DIR/domiciledb.db
                  sharp / fs            ──►  $DATA_DIR/media/…
```

- **Mutations** are React Server Actions in `src/lib/actions/*` — validated with Zod, then they call
  query modules. **Reads** are server components calling `src/lib/queries/*`.
- **Pure logic** (no DB/IO) lives in `src/lib/*.ts` so it's exhaustively unit-testable and gated.

## Module map

| Path                            | Responsibility                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/config.ts`             | The ONLY reader of `process.env`; typed, validated operator config             |
| `src/db/schema.ts`              | Single source of truth for the data model (money in integer **cents**)         |
| `src/db/index.ts`               | Shared WAL connection opened from `DATA_DIR`                                   |
| `src/db/migrate.ts` / `seed.ts` | `runMigrations()` + default-category seed                                      |
| `src/instrumentation.ts`        | Migrate + seed on boot, then start the in-process scheduler                    |
| `src/lib/scheduler.ts`          | node-cron jobs (backup cadence; staleness/warranty scans are stubbed)          |
| `src/lib/coverage.ts`           | **Insurance spine**: replacement-cost total vs. Coverage B; threshold crossing |
| `src/lib/money.ts`              | Integer-cents parse/format — the only dollars↔cents conversion                 |
| `src/lib/report.ts`             | Pure proof-packet assembly: room/category/grand totals                         |
| `src/lib/media.ts`              | Image processing (sharp) + the path-traversal-guarded resolver                 |
| `src/lib/documents-store.ts`    | Receipt/warranty/manual storage (sanitized filenames)                          |
| `src/lib/pdf/*`                 | @react-pdf/renderer document, image prep, paginated render                     |
| `src/lib/backup/*`              | S3 client, `VACUUM INTO` snapshot, content-addressed sync, orchestrator        |
| `src/lib/ai/*`                  | OpenRouter client, task registry + schemas, transparency manifest              |

## Data model (`src/db/schema.ts`)

Money is integer **cents**; timestamps are ISO-8601 text; media paths are **relative** to
`DATA_DIR`. Tables: `household`, `location`, `item`, `valuation` (history), `photo`, `document`,
`category`, `tag`/`item_tag`, `policy`, `ai_interaction` (audit log), `reminder`.

Key modeling decisions:

- **Draft vs. complete** is a `status` enum on `item`, orthogonal to lifecycle. The worklist =
  `status='draft'`; completeness is user-determined (no required fields).
- **Lifecycle** (`active`/`sold`/`disposed`/…) gates coverage — only `active` items count.
- **Valuations are append-only history**; `item.current_replacement_cost` + `…_valued_at` are
  denormalized pointers kept in sync for fast coverage aggregation and staleness.
- **Sets** use a per-item replacement cost × `quantity`; reports aggregate.

## Media storage (filesystem, not the DB)

Image and document **bytes live on the filesystem** under `$DATA_DIR/media/…`; the DB stores only
relative paths + content hash + dimensions. This keeps the DB (and its `VACUUM INTO` snapshots)
tiny and fast, and lets media sync to S3 independently and incrementally (content-addressed
filenames mean only new files upload).

Files are served by `GET /api/media/[...path]` with a hardened guard (see Security below).

## Insurance / coverage model

`coverage.ts` is the pure spine: `SUM(replacement_cost × quantity)` over **active, valued** items,
compared to the Coverage B limit. Items without a replacement cost are surfaced as _excluded_ ("at
least $X"). Status is `within` (<`COVERAGE_WARN_PCT`), `approaching` (≥ warn, ≤ 100%), or `over`
(>100%). A pure `crossedThreshold()` drives the contextual alert shown on the item that crosses a
threshold. Output is framed as informational — "verify with your insurer", never a determination.

## AI Assist (opt-in, confirm-before-save)

Disabled entirely unless `OPENROUTER_API_KEY` is set. The trust model is enforced as a state
machine: **preview** (a transparency manifest shows the model, the literal prompt, and that the
resized photo will be sent) → user **confirms** → **execute** (the call is made and logged to
`ai_interaction`) → editable **review** → explicit **apply**. AI output is never auto-saved;
declarations-page parsing extracts only headline coverages and is schema-bound so it cannot
fabricate per-category sub-limits.

## Resilience

`instrumentation.ts` runs migrations + seed on boot and starts a node-cron scheduler. Backup
(when S3 is configured) takes a consistent `VACUUM INTO` snapshot, uploads it + a current PDF +
changed media, and writes a status file surfaced in the UI; it's a clean no-op when unconfigured.
`scripts/restore.ts` reconstructs `DATA_DIR` from S3; `GET /api/export` streams a ZIP.

## Security model

- **No app auth by design** (single-user, self-hosted). Deploy behind a VPN / reverse proxy;
  HTTPS is required for PWA + camera.
- **Media serving is the only user-input→file-read surface** and is hardened in
  `src/app/api/media/[...path]/route.ts`:
  - lexical guard (`path.resolve` + root-prefix check) defeats `../`, absolute paths, and the
    sibling-prefix bypass;
  - a `realpath` re-check (target and root) defeats symlink escapes;
  - NUL bytes rejected; regular files only; identical 404 for traversal vs. not-found;
  - `X-Content-Type-Options: nosniff` + restrictive CSP prevent MIME-sniffing of uploaded bytes.
- **Uploads** are MIME-restricted; photos are re-encoded by sharp (no SVG/HTML passthrough);
  document filenames are `basename`-stripped + sanitized.
- **Secrets** are env-only; `.env` is git-ignored; AI/S3 credentials never reach the client.

## Testing & CI

- **Unit (Vitest):** pure logic, with an enforced coverage gate (100% lines/fns/stmts, 90% branches)
  on `coverage.ts`, `money.ts`, `report.ts`.
- **Integration (Vitest):** real temp SQLite for valuation/coverage/report wiring + media variants;
  a real backup→S3→restore round-trip against RustFS (an OSS, S3-compatible store).
- **E2E (Playwright):** mobile journeys — capture, coverage alerts, proof packet, receipts, AI
  consent/apply, and a security suite firing encoded traversal payloads at the media route.

CI (`.github/workflows/ci.yml`): `lint → typecheck → coverage-gated unit → build → e2e`, plus a
**RustFS** integration job and a **distroless docker build + boot** job. Supply-chain
(`.github/workflows/security.yml`): dependency review (PR), CodeQL, Trivy image scan, SBOM.
Dependabot keeps npm / GitHub Actions / Docker dependencies current. The image is published to
GHCR by `.github/workflows/publish.yml` on push to `main` and on tags.

## Build phases (history)

0. Walking skeleton — stack, schema, migrate-on-boot, household end-to-end
1. Capture loop — locations, quick capture → draft items, worklist
2. Enrichment + valuation + coverage dashboard
3. Proof-packet PDF (+ receipts/documents)
4. Resilience — S3 backup/restore + export
5. AI Assist — OpenRouter, opt-in, preview→confirm→execute
