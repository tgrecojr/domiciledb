# DomicileDB

> A self-hosted home inventory built for the moment that actually matters: proving what you
> owned, and getting paid for it, after a fire, flood, or theft.

DomicileDB makes it easy to build a complete, current, photo-and-receipt-backed inventory of your
household — so that when an adjuster asks you to _list everything you owned and prove it_, you can
hand them a credible proof packet and get fully reimbursed. See [`feature-spec.md`](./feature-spec.md)
for the full product spec.

## ⚠️ Security: there is no built-in authentication

DomicileDB is a single-user, self-hosted app with **no login**. Its database is a map of
everything valuable you own and where it is. **You must deploy it behind a trusted network
boundary** — a VPN and/or a reverse proxy that terminates HTTPS and (optionally) handles auth.

**HTTPS is required** for:

- PWA install ("Add to Home Screen") and offline support
- Live camera capture via the browser

Plain `http://<lan-ip>` will still work for basic capture (it uses the native file/camera picker),
but you lose install + offline. Terminate TLS at your reverse proxy (Caddy, Traefik, nginx) or use
Tailscale/split-DNS with a real cert.

## Tech stack

- **Language/Framework:** TypeScript, Next.js 15 (App Router), React 19
- **Database:** SQLite via Drizzle ORM + better-sqlite3 (single file, trivially backed up/restored)
- **UI:** Tailwind CSS, mobile-first PWA (Serwist)
- **AI Assist:** OpenRouter (opt-in per action, confirm-before-save)
- **PDF:** @react-pdf/renderer (the claim-ready proof packet)
- **Off-site backup:** S3 / S3-compatible (db snapshot + media + latest PDF)

## Commands

- `npm run dev` — Start the development server
- `npm run build` — Build for production (standalone output)
- `npm start` — Run the production build
- `npm test` — Run unit tests (Vitest)
- `npm run test:e2e` — Run end-to-end tests (Playwright)
- `npm run lint` — Lint
- `npm run typecheck` — Type-check with no emit
- `npm run db:generate` — Generate a Drizzle migration from schema changes
- `npm run db:migrate` — Apply migrations (also runs automatically on app boot)

## Configuration

All operational config is set by the **operator** via environment variables — none of it is an
end-user setting. Copy [`env.example`](./env.example) to `.env` and fill it in. Key variables:

| Variable                                  | Purpose                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `DATA_DIR`                                | Where the SQLite db, media, and backups live (mounted volume; default `/data`) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | AI Assist (blank key disables AI)                                              |
| `S3_*` / `BACKUP_CRON`                    | Off-site backup target + schedule (blank bucket disables)                      |
| `COVERAGE_WARN_PCT`                       | "Approaching limit" nudge threshold (default `0.80`)                           |
| `REVALUATION_CADENCE_DAYS`                | When a value goes stale (default `90`, quarterly)                              |

## Data & resilience

The mounted `DATA_DIR` holds everything:

```
$DATA_DIR/
  domiciledb.db                  live SQLite database
  backup/domiciledb-snapshot.db  consistent snapshot (VACUUM INTO) -> S3
  backup/proof-packet-latest.pdf current PDF proof packet -> S3
  media/                         item photos + document attachments -> S3
```

**Backup** (set `S3_BUCKET` + credentials to enable; otherwise it's a no-op) syncs the db snapshot,
media, and a current PDF proof packet off-site — so even with no running app you still have a
human-readable inventory. It runs on `BACKUP_CRON` and can be triggered from the Backup & export
screen. Media is content-addressed, so only new files upload.

**Restore** (run with the app stopped) pulls the snapshot + media back into `DATA_DIR`:

```bash
S3_BUCKET=your-bucket \
S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
S3_ENDPOINT=...            # only for S3-compatible stores (MinIO/B2/R2) \
DATA_DIR=/data \
npm run restore
```

Then start the app. **Export** (Backup & export screen, or `GET /api/export`) downloads a ZIP of a
consistent db snapshot plus all media, for safekeeping and to avoid lock-in.

## Development status

Built in phases (see `feature-spec.md` and the implementation plan). Phase 0 is the walking
skeleton: stack, schema, migrations-on-boot, and the household entity end-to-end.
