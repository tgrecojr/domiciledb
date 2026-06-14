# DomicileDB — Configuration reference

All configuration is **operator config** set via environment variables at deploy/runtime — none of
it is an end-user setting (feature-spec §3). Read by exactly one module, `src/lib/config.ts`, which
validates it with Zod. Copy [`../env.example`](../env.example) to `.env` for local development.

> Features whose credentials are blank are cleanly **disabled** (no-ops). DomicileDB is fully usable
> with no AI and no S3.

## Storage

| Variable   | Default                          | Notes                                                                                                                                                   |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATA_DIR` | `./data` (dev), `/data` (Docker) | Holds the SQLite db, `media/`, and `backup/`. Mount a volume here in the container; it must be writable by uid **65532** (the non-root container user). |

## AI Assist (OpenRouter)

Remote AI is **opt-in per action** and **off unless a key is set**.

| Variable              | Default                        | Notes                                                             |
| --------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `OPENROUTER_API_KEY`  | _(blank)_                      | Blank ⇒ all AI features hidden. Set to enable.                    |
| `OPENROUTER_MODEL`    | `openai/gpt-4o`                | Any vision-capable model id available to your OpenRouter account. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Override only to point at another OpenAI-compatible gateway.      |

Privacy: AI requests leave your infrastructure. The user sees exactly what will be sent (model,
literal prompt, the resized photo) and confirms before each call; results are reviewed and
explicitly applied — never auto-saved. Every call is recorded in the `ai_interaction` audit table.

## Off-site backup (S3 / S3-compatible)

Works with AWS S3, MinIO, Backblaze B2, and Cloudflare R2. **Off unless `S3_BUCKET` is set.**

| Variable               | Default     | Notes                                                                                                    |
| ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET`            | _(blank)_   | Blank ⇒ backups are a no-op. Set to enable.                                                              |
| `S3_REGION`            | `us-east-1` | AWS region (or any value for MinIO).                                                                     |
| `S3_ENDPOINT`          | _(blank)_   | Set **only** for S3-compatible stores (MinIO/B2/R2); enables path-style addressing. Leave blank for AWS. |
| `S3_ACCESS_KEY_ID`     | _(blank)_   | Credentials (or rely on the AWS default credential chain).                                               |
| `S3_SECRET_ACCESS_KEY` | _(blank)_   |                                                                                                          |
| `BACKUP_CRON`          | `0 3 * * *` | Cron schedule for automatic backups (nightly at 03:00 by default).                                       |

What's synced: a consistent `VACUUM INTO` db snapshot, all `media/`, and a current PDF proof packet.
Restore with `npm run restore` (same `S3_*` env, app stopped) — see the README.

## Coverage & valuation tuning

| Variable                   | Default | Notes                                                                                         |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `COVERAGE_WARN_PCT`        | `0.80`  | Fraction of the Coverage B limit at which the "approaching" nudge fires. Must be `0 < x ≤ 1`. |
| `REVALUATION_CADENCE_DAYS` | `90`    | Days after which a replacement-cost value is considered stale (quarterly). Positive integer.  |

## Test-only

| Variable  | Default | Notes                                                                                                                         |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AI_FAKE` | `0`     | When `1`, AI calls return deterministic canned data with no network call. Used by the e2e suite; **never set in production.** |

## Operator deployment notes

- **No authentication.** Deploy behind a VPN and/or a reverse proxy. The database is a map of
  everything valuable you own — treat the network boundary as the security boundary.
- **HTTPS is required** for PWA install, offline support, and live camera capture. Terminate TLS at
  the reverse proxy (Caddy/Traefik/nginx) or use Tailscale/split-DNS with a valid cert. Plain
  `http://<lan-ip>` still allows capture via the native picker but loses install/offline.
- **Volume permissions.** The container runs as uid 65532; ensure the volume mounted at `DATA_DIR`
  is writable by that uid.
- **Invalid config fails fast.** Out-of-range values (e.g. `COVERAGE_WARN_PCT=1.5`) are rejected at
  startup by the Zod schema.
