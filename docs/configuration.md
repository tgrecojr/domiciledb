# DomicileDB — Configuration reference

All configuration is **operator config** set via environment variables at deploy/runtime — none of
it is an end-user setting (feature-spec §3). Operator config is read by one module,
`src/lib/config.ts`, which validates it with Zod at startup. (Next's own `NEXT_RUNTIME`,
`NEXT_PHASE`, and `NODE_ENV` are read where the framework needs them, and the standalone
`scripts/migrate.ts` / `scripts/restore.ts` and `drizzle.config.ts` re-read `DATA_DIR` / `S3_*`
because they run outside the app's module alias.) Copy [`../env.example`](../env.example) to
`.env` for local development. Every variable below also appears in `env.example`.

> Features whose credentials are blank are cleanly **disabled** (no-ops). DomicileDB is fully usable
> with no AI and no S3.

## Storage

| Variable   | Default                          | Notes                                                                                                                                                   |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATA_DIR` | `./data` (dev), `/data` (Docker) | Holds the SQLite db, `media/`, and `backup/`. Mount a volume here in the container; it must be writable by uid **65532** (the non-root container user). |

## AI Assist (OpenRouter)

Remote AI is **opt-in per action** and **off unless a key is set**.

| Variable                | Default                        | Notes                                                                                                                                                                |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`    | _(blank)_                      | Blank ⇒ all AI features hidden. Set to enable.                                                                                                                       |
| `OPENROUTER_MODEL`      | `openai/gpt-4o`                | Any vision-capable model id available to your OpenRouter account.                                                                                                    |
| `OPENROUTER_BASE_URL`   | `https://openrouter.ai/api/v1` | Override only to point at another OpenAI-compatible gateway.                                                                                                         |
| `OPENROUTER_REFERER`    | _(blank)_                      | Your site URL, sent as `HTTP-Referer` so OpenRouter attributes usage to this app. Required to pair with `X-OpenRouter-Title: DomicileDB` for an OpenRouter app page. |
| `AI_MAX_CALLS_PER_HOUR` | `60`                           | Spend guard: ceiling on paid provider calls per process over a rolling hour. Calls above it are refused before anything is sent.                                     |

Privacy: AI requests leave your infrastructure. The user sees exactly what will be sent (model,
literal prompt, the resized photo) and confirms before each call; results are reviewed and
explicitly applied — never auto-saved. Every call is recorded in the `ai_interaction` table
(currently write-only; nothing in the UI reads it yet).

## Upload and media limits

| Variable                       | Default         | Notes                                                                                                |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `UPLOAD_MAX_FILE_MB`           | `25`            | Largest single photo accepted; larger files are skipped from their declared size without being read. |
| `UPLOAD_MAX_FILES_PER_REQUEST` | `20`            | Photos honoured per capture or add-photos request; extras are ignored.                               |
| `MEDIA_MAX_TOTAL_MB`           | `20480` (20 GB) | Ceiling on bytes under `DATA_DIR/media`; once reached, further uploads in a request are skipped.     |
| `MEDIA_MAX_SERVE_MB`           | `100`           | Largest file `GET /api/media/*` will serve; bigger ⇒ HTTP 413.                                       |

The Next.js Server Action body limit is a separate, fixed 50 MB cap (`next.config.ts`); a single
multi-photo capture above it fails at the framework layer before these limits apply.

## Export, proof packet, categories

| Variable                      | Default | Notes                                                                                                                                                 |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPORT_MIN_INTERVAL_SECONDS` | `60`    | Minimum seconds between `GET /api/export` runs (each is a full `VACUUM INTO` + zip). Concurrent or too-soon requests get HTTP 429 with `Retry-After`. |
| `PROOF_PACKET_MAX_ITEMS`      | `2000`  | Largest packet the PDF route will render; above it ⇒ HTTP 413 with advice to narrow with `?location=` or `?category=`.                                |
| `MAX_CATEGORIES`              | `500`   | Ceiling on distinct categories (AI suggestions can create categories from free text). At the cap, new names are not created.                          |

## Off-site backup (S3 / S3-compatible)

Works with AWS S3, Backblaze B2, Cloudflare R2, and any S3-compatible store. **Off unless
`S3_BUCKET` is set.**

| Variable               | Default     | Notes                                                                                                                       |
| ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET`            | _(blank)_   | Blank ⇒ backups are a no-op. Set to enable.                                                                                 |
| `S3_REGION`            | `us-east-1` | AWS region (or any value for S3-compatible stores).                                                                         |
| `S3_ENDPOINT`          | _(blank)_   | Set **only** for S3-compatible stores (Backblaze B2, Cloudflare R2, …); enables path-style addressing. Leave blank for AWS. |
| `S3_ACCESS_KEY_ID`     | _(blank)_   | Credentials (or rely on the AWS default credential chain).                                                                  |
| `S3_SECRET_ACCESS_KEY` | _(blank)_   |                                                                                                                             |
| `BACKUP_CRON`          | `0 3 * * *` | Cron schedule for automatic backups (nightly at 03:00 by default).                                                          |

What's synced: a consistent `VACUUM INTO` db snapshot, all `media/`, and a current PDF proof packet.
Restore with `npm run restore` (same `S3_*` env, app stopped) — see the README.

## Coverage & valuation tuning

| Variable                   | Default | Notes                                                                                                                                                                                                          |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COVERAGE_WARN_PCT`        | `0.80`  | Fraction of the Coverage B limit at which the "approaching" nudge fires. Must be `0 < x ≤ 1`.                                                                                                                  |
| `REVALUATION_CADENCE_DAYS` | `90`    | Days after which a replacement-cost value is considered stale (quarterly). Positive integer. Validated at startup; the reminder scan that would consume it is not built yet (see `docs/intent/keep-current/`). |

## Test-only

| Variable  | Default | Notes                                                                                                                         |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AI_FAKE` | `0`     | When `1`, AI calls return deterministic canned data with no network call. Used by the e2e suite; **never set in production.** |

## Operator deployment notes

- **No authentication.** Deploy behind a VPN and/or a reverse proxy. The database is a map of
  everything valuable you own — treat the network boundary as the security boundary.
- **HTTPS is required** for PWA install and offline support. Terminate TLS at the reverse proxy
  (Caddy/Traefik/nginx) or use Tailscale/split-DNS with a valid cert. Capture uses the native
  file/camera picker, so plain `http://<lan-ip>` still captures; it only loses install/offline.
- **Volume permissions.** The container runs as uid 65532; ensure the volume mounted at `DATA_DIR`
  is writable by that uid.
- **Invalid config fails fast.** Out-of-range values (e.g. `COVERAGE_WARN_PCT=1.5`) are rejected at
  startup by the Zod schema.
