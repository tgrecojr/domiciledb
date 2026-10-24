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
- `npm test` — Run unit tests (Vitest); `npm run test:coverage` applies the coverage gate
- `npm run test:integration` — Integration tests on real SQLite (S3 round trip needs `S3_*` env)
- `npm run test:e2e` — End-to-end tests (Playwright)
- `npm run lint` / `npm run format` — Biome check / check with write
- `npm run typecheck` — Type-check (no emit)
- `npm run db:generate` — Generate a migration after editing `src/db/schema.ts`
- `npm run db:migrate` — Apply migrations from the CLI (boot does this automatically)
- `npm run restore` — Rebuild `DATA_DIR` from the S3 backup (app stopped)

## Architecture

- `src/db/schema.ts` — Drizzle schema: the single source of truth (money stored as integer cents).
- `src/db/index.ts` — better-sqlite3 connection (WAL mode), opened from `DATA_DIR`.
- `src/lib/config.ts` — typed, validated operator env config; the only reader of operator env
  (framework vars, `next.config.ts`, and the standalone `scripts/*.ts` read `process.env` directly).
- `src/lib/coverage.ts` — the insurance spine: active replacement-cost total vs. Coverage B limit,
  within/approaching/over status, items-missing-cost excluded from the total. Most-tested module.
- Re-valuation and warranty-expiry reminders are **specified but not built**: the `reminder` table,
  `REVALUATION_CADENCE_DAYS`, and a commented-out scheduler slot exist; no scan, surface, or
  dismissal does. See `docs/intent/keep-current/`.
- `src/lib/ai/*` + `src/lib/actions/ai.ts` — preview→confirm→execute AI flow with a transparency
  manifest; every call is logged to `ai_interaction` (write-only today). AI output is always a
  suggestion the user confirms/edits before save.
- `src/lib/media.ts` + `src/lib/image-format.ts` — the media store: magic-byte admission,
  original/web/thumb variants, content hashing, quota, path guards.
- `src/instrumentation.ts` — runs migrations on boot, then starts the node-cron scheduler (Node
  runtime only; guarded against double-registration). Must live in `src/` when a `src/` dir exists.
- `src/app/**` — App Router UI; mobile-first capture is the primary surface.
- Design intent lives in `docs/high-level-design.md` and `docs/intent/<segment>/` (see the LID
  section below); `docs/architecture.md` is the implementation-level companion.

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
- Read operator env **only** through `src/lib/config.ts` (the exceptions are Next's own
  `NEXT_RUNTIME`/`NEXT_PHASE`/`NODE_ENV`, and `scripts/*.ts` + `drizzle.config.ts`, which run
  outside the `@/` alias and re-read `DATA_DIR`/`S3_*`).
- Store **relative** media paths in the DB (mount-independent restore).
- Files < 300 lines, functions < 50 lines. TS strict; lint + format clean before commit.
- No secrets in git. `.env` is ignored; `env.example` is the committed template.
- **After changing dependencies**, regenerate the lockfile cleanly:
  `rm -rf node_modules package-lock.json && npm install`. An incremental
  `npm install` on macOS leaves the lock linux-incomplete for sharp's optional
  `@emnapi/*` peer deps, which then breaks `npm ci` in Docker/CI. (CI's `npm ci`
  is the safety net — a bad lock fails the build before it can reach prod.)
  **Then run `npm install --package-lock-only` and commit that lock.** A full
  install on macOS/Linux-x64 skips the optional `@tailwindcss/oxide-wasm32-wasi`
  package, so it never records that package's `bundledDependencies` (the
  `inBundle` entries). Renovate regenerates the lock in lock-only mode, which
  must download that tarball to fill them in, and Mend's hosted npm runs with
  `allow-remote` disabled, so the `renovate/artifacts` step fails with
  `EALLOWREMOTE` on every npm PR until the committed lock carries the entries.
- **Then always run `npm ci` locally before pushing.** A clean regen is necessary
  but not sufficient: npm's lockfile writer and its `npm ci` validator can
  disagree about **optional peer dependencies**, so `npm install` will happily
  write a lock that `npm ci` then rejects. Renovate hits this too — its
  `renovate/artifacts` step fails and it opens the PR with a stale lock anyway,
  which surfaces as `EUSAGE ... does not satisfy` in CI rather than as anything
  that looks lock-related. When it happens, find the package contributing the
  unused optional peer and drop it; prefer that over adding another pin.
- Run npm through the real binary (`$(nvm which current)`/`~/.nvm/.../bin/npm`),
  not the `socket npm` shell alias. The alias 429s under load, and it puts Node's
  permission model in front of spawned workers, which makes `npm run build` die
  with a bogus `ERR_MISSING_OPTION: --permission is required` from the Next.js
  build worker.

## Environment Variables

`env.example` is the committed template and `docs/configuration.md` the full reference; both list
every variable `src/lib/config.ts` reads. Groups: `DATA_DIR`; AI (`OPENROUTER_*`,
`AI_MAX_CALLS_PER_HOUR`, test-only `AI_FAKE`); backup (`S3_*`, `BACKUP_CRON`); upload and media
limits (`UPLOAD_MAX_FILE_MB`, `UPLOAD_MAX_FILES_PER_REQUEST`, `MEDIA_MAX_TOTAL_MB`,
`MEDIA_MAX_SERVE_MB`); export and packet (`EXPORT_MIN_INTERVAL_SECONDS`, `PROOF_PACKET_MAX_ITEMS`);
`MAX_CATEGORIES`; coverage (`COVERAGE_WARN_PCT`, `REVALUATION_CADENCE_DAYS`). Blank
`OPENROUTER_API_KEY` / `S3_BUCKET` cleanly disable AI / backup.

## Security

No app-level auth by design — deploy behind a VPN / reverse proxy. HTTPS required for PWA install
and offline; capture uses the native file/camera picker and works over plain HTTP.

## LID
- Mode: Full
- Version: 1.3.0

## Linked-Intent Development (MANDATORY)

**Consult the `linked-intent-dev` skill for ALL code changes.** All changes flow through the arrow of intent in one direction:

```
HLD → LLDs → EARS → Tests → Code
```

- **New features and refactors**: full six-phase workflow (HLD check → LLD check/draft → EARS → intent-narrowing edge audit → tests-first → code).
- **Bug fixes**: walk the arrow like any other change — find where behavior diverged from intent and cascade from there. No short-circuit.
- **If unsure**: use the full workflow.

Stop after each phase for user review. **Docs carry current intent, written to be read cold** — write each doc as if authored fresh today, from current intent alone: no narration of how it changed, no meaning that needs the conversation that produced it, no rebuttals to questions only a past discussion raised. Rationale, considered alternatives, and constraints a fresh author would independently write stay; record rejected alternatives and why in the LLD's Decisions & Alternatives table, not as asides in body prose.

**Memory vs. intent.** Before saving durable project knowledge to agent or tool memory, test whether it is project *intent* — would a fresh agent, in any tool, next session, need it to build this system correctly? If yes, record it in the arrow (HLD / LLD / EARS / decision doc), which travels and cascades — not in private, per-tool memory, where intent escapes the arrow. Knowledge about the user or how they like to work stays in memory.

### Navigation

| What you need | Where to look |
|---|---|
| High-level design | `docs/high-level-design.md` |
| Design tree (sub-HLDs, LLDs, their specs) | `docs/intent/` — one folder per node |
| EARS specs | beside each design doc as `{node}-specs.md` in the node's folder under `docs/intent/` |
| Decision docs | `docs/decisions/` (project-level) and `docs/intent/<segment>/decisions/` |
| Arrow of intent overlay | `docs/arrows/index.yaml` and per-segment docs in `docs/arrows/` |

### Terminology

- **HLD**: High-Level Design — single project-level doc at `docs/high-level-design.md`.
- **LLD**: Low-Level Design — detailed component design doc in `docs/intent/`. The design layer is a recursive tree: the root is the HLD, leaf LLDs own EARS, and a component deep enough to outgrow one doc becomes a sub-HLD (HLD-shaped, owns no EARS) with children beneath it. "HLD" and "LLD" are roles by position; depth-2 (one HLD over flat leaf LLDs) is the default.
- **EARS**: Easy Approach to Requirements Syntax — structured one-line requirements beside each design doc as `{node}-specs.md` in the node's folder under `docs/intent/`. IDs are path-concatenated — the root-to-leaf path of the owning segment plus a number — so a prefix grep gathers a subtree. Markers: `[x]` implemented, `[ ]` active gap, `[D]` deferred.
- **Arrow**: the unidirectional chain from vision to code (HLD → LLDs → EARS → Tests → Code). Strictly a DAG of intent.
- **Arrow segment**: the territory owned by one leaf LLD — the LLD itself plus the specs, tests, and code that cite its EARS IDs. The boundary is the leaf prefix. Within-segment cascade is free; across-segment cascade pauses.
- **Cascade**: propagating a change downstream through the arrow so adjacent levels stay coherent.

### Code annotations

Annotate code and tests with `@spec` comments citing EARS IDs:

```
// @spec CAPTURE-FLOW-002, CAPTURE-FLOW-003
```

Place the annotation at the *entry point of the behavior's implementation graph* — the topmost function or module owning the specified behavior, not every helper. When a behavior spans multiple subsystems (UI + API + database, for example), annotate at the entry point in each subsystem. Tests follow the same rule: annotate the test that directly exercises the spec, not every inner assertion.
