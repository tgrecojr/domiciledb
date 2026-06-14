# DomicileDB

## Overview

Self-hosted, single-user home-inventory app. Its purpose is to let a homeowner prove what they
owned and get fully reimbursed after a fire, flood, or theft. Every feature is judged against one
question: **does this help the user win the claim conversation and get paid?** See
`feature-spec.md` for the product spec and `declarations.md` for the real HO-3 dec page that
grounds the insurance model (Coverage B – Personal Property = $456,750).

## Tech Stack

- Language: TypeScript (strict)
- Framework: Next.js 16 (App Router) + React 19
- Database: SQLite via Drizzle ORM + better-sqlite3
- UI: Tailwind CSS, mobile-first PWA (Serwist)
- AI: OpenRouter (remote, opt-in per action, confirm-before-save)
- PDF: @react-pdf/renderer
- Backup: S3 / S3-compatible

## Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production (standalone output)
- `npm test` — Run unit tests (Vitest)
- `npm run test:e2e` — End-to-end tests (Playwright)
- `npm run lint` — Lint
- `npm run typecheck` — Type-check (no emit)
- `npm run db:generate` — Generate a migration after editing `src/db/schema.ts`

## Architecture

- `src/db/schema.ts` — Drizzle schema: the single source of truth (money stored as integer cents).
- `src/db/index.ts` — better-sqlite3 connection (WAL mode), opened from `DATA_DIR`.
- `src/lib/config.ts` — typed, validated operator env config (the only place env is read).
- `src/lib/coverage.ts` — the insurance spine: active replacement-cost total vs. Coverage B limit,
  within/approaching/over status, items-missing-cost excluded from the total. Most-tested module.
- `src/lib/staleness.ts` — re-valuation + warranty-expiry reminder generation.
- `src/lib/ai/openrouter.ts` — preview→confirm→execute AI flow with a transparency manifest + audit
  log; AI output is always a suggestion the user confirms/edits before save.
- `src/instrumentation.ts` — runs migrations on boot, then starts the node-cron scheduler (Node
  runtime only; guarded against double-registration). Must live in `src/` when a `src/` dir exists.
- `src/app/**` — App Router UI; mobile-first capture is the primary surface.

## Non-negotiable product principles (from the spec)

1. **Mobile-first capture.** Snap → save draft in seconds; enrich later.
2. **The data survives the event.** Off-site S3 backup + export are first-class, not optional.
3. **AI assists, the human confirms.** Never auto-commit AI output, especially serials/values.
4. **Privacy by consent.** Remote AI is opt-in per action; the user sees exactly what is sent.
5. **Trustworthy means current.** Lifecycle status + re-valuation reminders fight silent staleness.
6. **Low-friction first.** Half-finished (draft) items are always acceptable; completeness is
   user-determined (no fixed required fields).
7. **Operator config vs. user settings are separate.** Backup target/cadence, AI credentials,
   thresholds are env-only — never end-user settings.

## Conventions

- Money is integer **cents** everywhere; never floats. Format only at the display edge.
- Read env **only** through `src/lib/config.ts`.
- Store **relative** media paths in the DB (mount-independent restore).
- Files < 300 lines, functions < 50 lines. TS strict; lint + format clean before commit.
- No secrets in git. `.env` is ignored; `env.example` is the committed template.
- **After changing dependencies**, regenerate the lockfile cleanly:
  `rm -rf node_modules package-lock.json && npm install`. An incremental
  `npm install` on macOS leaves the lock linux-incomplete for sharp's optional
  `@emnapi/*` peer deps, which then breaks `npm ci` in Docker/CI. (CI's `npm ci`
  is the safety net — a bad lock fails the build before it can reach prod.)

## Environment Variables

See `env.example`. Required for full function: `DATA_DIR`, and (optional, feature-gating)
`OPENROUTER_API_KEY` / `OPENROUTER_MODEL`, `S3_*` / `BACKUP_CRON`, `COVERAGE_WARN_PCT`,
`REVALUATION_CADENCE_DAYS`.

## Security

No app-level auth by design — deploy behind a VPN / reverse proxy. HTTPS required for PWA install,
offline, and live camera capture.
