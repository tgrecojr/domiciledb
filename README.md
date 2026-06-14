# DomicileDB

> A self-hosted home inventory built for the moment that actually matters: proving what you
> owned, and getting paid for it, after a fire, flood, or theft.

DomicileDB makes it easy to build a complete, current, photo-and-receipt-backed inventory of your
household — so that when an adjuster asks you to _list everything you owned and prove it_, you can
hand them a credible, claim-ready proof packet and get fully reimbursed. See
[`feature-spec.md`](./feature-spec.md) for the product spec and
[`docs/architecture.md`](./docs/architecture.md) for how it's built.

## What it does

- **📸 Quick capture (mobile-first):** snap a photo, save a draft item in seconds, fill in details
  later. A "needs detail" worklist keeps drafts from languishing.
- **💵 Valuation & coverage:** record replacement cost / price paid per item; the dashboard shows an
  ambient green/amber/red status comparing your total against your **Coverage B – Personal Property**
  limit, with a contextual nudge the moment you cross 80% / 100%.
- **📄 Claim-ready PDF proof packet:** a print-ready document organized by room with photos,
  receipts, specs, values, and totals by room/category — the headline output.
- **🧾 Receipts & warranties:** attach proof-of-purchase documents to items.
- **🤖 AI assist (opt-in):** optionally use a remote AI to identify items, OCR serial plates, draft
  descriptions, suggest replacement cost, and parse your declarations page to pre-fill Coverage B —
  always with an explicit confirm step, never auto-saved.
- **☁️ Resilience:** off-site S3 backup of the database, media, and a current PDF; a trivial restore
  runbook; and a full ZIP export. _Your data survives destruction of the home._

## ⚠️ Security: there is no built-in authentication

DomicileDB is a single-user, self-hosted app with **no login** (per spec §1/§3). Its database is a
map of everything valuable you own and where it is. **You must deploy it behind a trusted network
boundary** — a VPN and/or a reverse proxy that terminates HTTPS and (optionally) handles auth.

**HTTPS is required** for PWA install ("Add to Home Screen"), offline support, and live camera
capture. Plain `http://<lan-ip>` still works for basic capture (it uses the native file/camera
picker) but loses install + offline. Terminate TLS at your reverse proxy (Caddy, Traefik, nginx) or
use Tailscale / split-DNS with a real cert.

## Tech stack

| Concern   | Choice                                                              |
| --------- | ------------------------------------------------------------------- |
| Language  | TypeScript (strict)                                                 |
| Framework | Next.js 15 (App Router) + React 19                                  |
| Database  | SQLite via Drizzle ORM + better-sqlite3 (single file, WAL)          |
| UI        | Tailwind CSS, mobile-first PWA (Serwist)                            |
| Media     | sharp (original + web + thumbnail variants on the filesystem)       |
| PDF       | @react-pdf/renderer                                                 |
| AI        | OpenRouter (OpenAI-compatible vision) — opt-in, confirm-before-save |
| Backup    | S3 / S3-compatible (AWS S3, Backblaze B2, Cloudflare R2)            |
| Container | Multi-stage build → distroless, non-root                            |

## Quick start (development)

```bash
git clone git@github.com:tgrecojr/domiciledb.git && cd domiciledb
cp env.example .env            # adjust as needed (all keys are optional)
npm install
npm run dev                    # http://localhost:3000
```

The database, media, and backups live under `DATA_DIR` (default `./data` in dev, `/data` in the
container). Migrations run automatically on boot.

## Run with Docker

```bash
docker build -t domiciledb .
docker run -d -p 3000:3000 -v domiciledb-data:/data --name domiciledb domiciledb
# Behind your reverse proxy / VPN. Mount a volume at /data to persist everything.
```

A published image is available at `ghcr.io/tgrecojr/domiciledb` (built and pushed by CI). The
container runs as a non-root user (uid 65532); the mounted volume must be writable by that uid.

## Commands

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Start the development server                               |
| `npm run build`            | Production build (standalone output)                       |
| `npm start`                | Run the production build                                   |
| `npm test`                 | Unit tests (Vitest)                                        |
| `npm run test:coverage`    | Unit tests with the enforced coverage gate                 |
| `npm run test:integration` | Integration tests (DB + media; S3 round-trip needs RustFS) |
| `npm run test:e2e`         | End-to-end tests (Playwright)                              |
| `npm run lint`             | Lint                                                       |
| `npm run typecheck`        | Type-check (no emit)                                       |
| `npm run db:generate`      | Generate a Drizzle migration after editing the schema      |
| `npm run db:migrate`       | Apply migrations (also runs automatically on boot)         |
| `npm run restore`          | Restore the database + media from S3 (run app stopped)     |

## Configuration

All operational config is set by the **operator** via environment variables — none of it is an
end-user setting (spec §3). Copy [`env.example`](./env.example) to `.env`. See
[`docs/configuration.md`](./docs/configuration.md) for the full reference. Summary:

| Variable                   | Default                        | Purpose                                      |
| -------------------------- | ------------------------------ | -------------------------------------------- |
| `DATA_DIR`                 | `./data` (dev) / `/data`       | Where the db, media, and backups live        |
| `OPENROUTER_API_KEY`       | _(blank → AI disabled)_        | Enables AI Assist                            |
| `OPENROUTER_MODEL`         | `openai/gpt-4o`                | Vision-capable model id                      |
| `OPENROUTER_BASE_URL`      | `https://openrouter.ai/api/v1` | Override for an OpenAI-compatible gateway    |
| `S3_BUCKET` / `S3_*`       | _(blank → backups disabled)_   | Off-site backup target (S3-compatible)       |
| `BACKUP_CRON`              | `0 3 * * *`                    | Backup schedule                              |
| `COVERAGE_WARN_PCT`        | `0.80`                         | "Approaching limit" nudge threshold          |
| `REVALUATION_CADENCE_DAYS` | `90`                           | When a value is considered stale (quarterly) |

If `OPENROUTER_API_KEY` or `S3_BUCKET` is blank, those features are cleanly disabled (no-ops) —
DomicileDB is fully usable with neither.

## Data, backup & restore

The mounted `DATA_DIR` holds everything:

```
$DATA_DIR/
  domiciledb.db (+ -wal, -shm)   live SQLite database
  backup/domiciledb-snapshot.db  consistent snapshot (VACUUM INTO) -> S3
  backup/proof-packet-latest.pdf current PDF proof packet -> S3
  media/items/<id>/...           item photos (original/web/thumb)
  media/documents/items/<id>/... receipts, warranties, manuals
```

**Backup** (enable by setting `S3_BUCKET` + credentials) syncs the db snapshot, media, and a current
PDF packet off-site, runs on `BACKUP_CRON`, and can be triggered from the **Backup & export** screen.
Media is content-addressed, so only new files upload. **Restore** (run with the app stopped):

```bash
S3_BUCKET=your-bucket S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  S3_ENDPOINT=...   # only for S3-compatible stores (Backblaze B2, Cloudflare R2, …) \
  DATA_DIR=/data npm run restore
```

**Export** (Backup & export screen, or `GET /api/export`) downloads a ZIP of a consistent db
snapshot plus all media — for safekeeping and to avoid lock-in.

## Testing

| Layer       | Tool       | What it covers                                                                                              |
| ----------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest     | Pure logic, **100%-gated** on the insurance spine (`coverage`, `money`, `report`)                           |
| Integration | Vitest     | Real SQLite (valuations, coverage-with-lifecycle, report filter, media variants) + S3 round-trip via RustFS |
| E2E         | Playwright | Mobile user journeys (capture, coverage, packet, receipts, AI, security)                                    |

```bash
npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e
```

CI runs the full gauntlet plus a RustFS backup/restore round-trip, a distroless docker build+boot,
and supply-chain checks (dependency review, CodeQL, Trivy image scan, SBOM). See
[`docs/architecture.md`](./docs/architecture.md) for the CI shape.

## License

Private project. All rights reserved.
