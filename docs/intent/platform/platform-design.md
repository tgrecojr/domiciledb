---

parent: high-level-design
prefix: PLATFORM
---

# Platform

## Context and Design Philosophy

DomicileDB is one process, one SQLite file, and one directory of photos, run by its owner on a
box they control behind a VPN or reverse proxy. The platform segment is everything that makes
that true and keeps it safe without ever becoming a feature the owner sees:

- **One place for operator configuration.** Environment is read and validated once; invalid
  values stop the server before it serves. There are no end-user settings.
- **Boring persistence.** A single WAL-mode SQLite connection, migrations applied on boot, a
  schema file that is the sole source of truth, integer cents, ISO text timestamps, and media
  paths relative to `DATA_DIR` so a restore works on any mount.
- **Treat bytes as hostile.** Uploads are admitted by magic bytes, never by declared type;
  photos are re-encoded; the serving route is the only user-input → file-read path in the app and
  is layered against traversal, symlinks, size, and caching.
- **A PWA that caches the app, never the inventory.** The shell installs and works offline; API
  and media responses are never written to Cache Storage.
- **Ship small and signed.** Distroless, non-root, digest-pinned, SBOM and provenance attested,
  dependencies auto-updated under a supply-chain gate.

Platform owns these mechanisms. Other segments declare what they need (a config key, a table, a
cron slot, a media directory) and platform provides it.

## Configuration

`src/lib/config.ts` parses `process.env` with a Zod schema at module load (`:11-65`) and exports
a frozen `config` with resolved paths and feature gates. A malformed value throws on import, so
the server fails before it serves. `DATA_DIR` defaults to `<cwd>/data` (`:67-69`); the layout
under it is fixed: `domiciledb.db`, `media/`, `backup/domiciledb-snapshot.db`,
`backup/proof-packet-latest.pdf`, `backup/status.json` (`:76-84`).

Gates: `ai.enabled` ⇔ `OPENROUTER_API_KEY` non-empty; `backup.enabled` ⇔ `S3_BUCKET` non-empty
(`:96-98, 108-110`). The app is fully usable with neither.

| Variable                                                                                                                                                           | Default | Segment that consumes it |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------ |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (`openai/gpt-4o`), `OPENROUTER_BASE_URL`, `OPENROUTER_REFERER`, `AI_MAX_CALLS_PER_HOUR` (60), `AI_FAKE` (0)               |         | enrich, coverage         |
| `S3_ENDPOINT`, `S3_REGION` (`us-east-1`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BACKUP_CRON` (`0 3 * * *`), `EXPORT_MIN_INTERVAL_SECONDS` (60) |         | resilience               |
| `UPLOAD_MAX_FILE_MB` (25), `UPLOAD_MAX_FILES_PER_REQUEST` (20), `MEDIA_MAX_TOTAL_MB` (20480), `MEDIA_MAX_SERVE_MB` (100)                                           |         | capture, platform        |
| `PROOF_PACKET_MAX_ITEMS` (2000)                                                                                                                                    |         | proof-packet             |
| `MAX_CATEGORIES` (500)                                                                                                                                             |         | enrich                   |
| `COVERAGE_WARN_PCT` (0.80, in (0, 1])                                                                                                                              |         | coverage                 |
| `REVALUATION_CADENCE_DAYS` (90, positive integer)                                                                                                                  |         | keep-current             |

Reads of `process.env` outside `config.ts` are limited to Next framework variables
(`NEXT_RUNTIME`, `NEXT_PHASE` in `instrumentation.ts` and `db/index.ts`; `NODE_ENV` in
`next.config.ts`) and to the standalone scripts and `drizzle.config.ts`, which run under tsx or
drizzle-kit without the `@/` alias and re-read `DATA_DIR`/`S3_*` directly. No operator knob
bypasses validation. `env.example` is the committed template; nine of its variables are absent
from `docs/configuration.md`.

## Boot and persistence

`src/instrumentation.ts` runs only on the Node runtime and not during `next build` (`:10, 16`),
then in order: `runMigrations()` (Drizzle migrator over `./drizzle`), `seedCategories()` (enrich's
15 defaults when the table is empty), `startScheduler()` (`:18-25`). The scheduler guards against
double registration with a `globalThis` flag and registers the backup cron when resilience's gate
and expression allow; the keep-current daily scan is a reserved comment
(`src/lib/scheduler.ts:18-35`).

`src/db/index.ts` opens one better-sqlite3 handle cached on `globalThis.__domicileSqlite`
(`:42-48`) with `journal_mode=WAL`, `foreign_keys=ON` (required for every cascade in the schema),
`busy_timeout=5000` (`:35-38`), creating `DATA_DIR`, `backup/`, and `media/` first (`:15-23`).
During the production build phase it returns an empty in-memory database so parallel build
workers never touch the file (`:31-33`). `scripts/migrate.ts` applies the same migrations with the
same pragmas for CLI and CI use. The container copies `drizzle/` into the runtime image because
boot needs it (`Dockerfile:48`).

`GET /api/health` returns `{ "status": "ok" }` without touching the database; the container
`HEALTHCHECK` and the e2e readiness probe use it.

## Schema conventions

`src/db/schema.ts` defines 13 tables (`household`, `location`, `location_photo`, `category`,
`tag`, `item`, `item_tag`, `valuation`, `photo`, `document`, `policy`, `ai_interaction`,
`reminder`); `npm run db:generate` emits migrations and snapshots under `drizzle/`, which Biome
ignores as generated. Four migrations exist; 0002 and 0003 are data-fixing (dedupe policies,
collapse to one household).

Conventions, all enforced by the schema file:

- Money columns are `INTEGER` cents (`valuation.amount`, `item.current_replacement_cost`,
  `policy.coverage_*`, `policy.deductible`).
- Timestamps are ISO-8601 UTC text; the default is `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
  application updates write `new Date().toISOString()`.
- Media paths are stored relative to `DATA_DIR` (`media/items/<id>/<sha>-web.webp`).
- Enum columns (`kind`, `status`, `lifecycle_status`, `source`, `outcome`) are plain TEXT; the
  allowed values live in TypeScript (`lifecycle.ts`, `location-kinds.ts`, `document-kinds.ts`,
  and `schema.ts` constants) and are enforced by Zod at write sites. There are no CHECK
  constraints.
- Referential policy: household → location, item, policy cascade; location → location_photo
  cascade and item.location_id set null; item → item_tag, valuation, photo, document, reminder
  cascade; category → item.category_id set null; item → ai_interaction.item_id set null.
- Ids from forms and queries are parsed fail-closed by `parseId` (string only, trimmed, `^\d+$`,
  positive safe integer; VULN-014), the guard against `Number("") === 0` writing under item `0`.
  Several enrich actions still use `Number()` + `isInteger`.

## Media store

`src/lib/media.ts` and `src/lib/image-format.ts` own bytes on disk.

**Admission by sniffing.** `detectFileType` reads magic bytes; `sniffImageMime` admits JPEG, PNG,
WebP, and HEIC (brands heic/heix/heif/hevc/hevx/mif1/msf1) and recognizes GIF, TIFF, BMP, SVG
(first 256 bytes, lowercased, `<svg` or `<?xml … <svg`) only to reject them; AVIF is excluded;
`sniffDocumentMime` adds `%PDF` (`image-format.ts:21-104`; VULN-012). The client's `File.type` is
never trusted.

**Variants.** `processAndStoreImage(dir, buffer, mime)` refuses to decode unless the bytes sniff
as an allowed image, hashes the original with sha256, writes `<sha256>-original.<ext>` untouched,
`<sha256>-web.webp` (≤1024 px long edge, quality 80), and `<sha256>-thumb.webp` (320×320 cover,
quality 70), produced sequentially with fresh pipelines; `sharp.cache(false)` and
`sharp.concurrency(1)` are set process-wide (`media.ts:15-16, 29-30, 217-253`). The original's
extension is derived from the caller-supplied MIME (png/webp/heic else jpg). Item photos live
under `media/items/<itemId>/`, room photos under `media/locations/<locationId>/`, documents under
`media/documents/items/<itemId>/` (enrich's `documents-store.ts`, same hashing).

**Quota and integrity.** `remainingMediaQuotaBytes()` walks `media/` and subtracts from
`MEDIA_MAX_TOTAL_MB`, floored at 0 (`:75-107`). `verifyStoredContent(relPath, sha)` re-hashes a
file and compares (`:122-139`; VULN-018).

**Deletion.** `deleteItemMedia` removes `media/items/<id>` and `media/documents/items/<id>`;
`deleteLocationMedia` removes `media/locations/<id>`; `deleteStoredImageFiles` and
`deleteStoredFile` unlink individual paths and require the caller to reference-count first
(`:145-195`).

**Path safety.** Two resolution bases exist by design: `resolveMediaPath` resolves a requested
path against the media root for the serving route; the verify/delete helpers resolve stored paths
against `DATA_DIR`. Both reject NUL bytes and anything that does not resolve to the root or
strictly inside it (sibling-prefix safe) (`:60-69, 110-113, 127, 175, 187`). `ai/image.ts` and
`pdf/images.ts` carry near-verbatim copies of the guard without the NUL check.

## Media serving

`GET /api/media/[...path]` (`src/app/api/media/[...path]/route.ts`) is the only route that turns
user input into a file read:

1. Lexical resolve via `resolveMediaPath`; null → 404.
2. `realpath` the target and the media root and require containment, so a symlink cannot escape
   (`:43-56`).
3. `stat` must be a regular file; size above `MEDIA_MAX_SERVE_MB` → 413 (`:58-73`; VULN-009).
4. Stream with `createReadStream`, never buffer (`:79-81`).
5. Every response, including 404, carries `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: default-src 'none'; sandbox`, and
   `Cache-Control: private, no-store, max-age=0, must-revalidate` (`:24-27, 90-93`; VULN-023).
   Traversal and not-found are indistinguishable.

Content types are mapped for webp, jpg/jpeg, png, heic, and pdf; anything else is
`application/octet-stream`. The public URL for a stored relative path is `/api/<relPath>`
(`media.ts:42-44`). `next/image` is deliberately not used; Biome's `noImgElement` is off for
that reason.

## App shell and PWA

`layout.tsx` sets metadata, Apple web-app capability, `maximumScale: 1`, theme color `#16a34a`,
and a centered `max-w-2xl` column, so the app is phone-width on every screen. `AppShell` gives
each page a sticky header (optional "← Back" link, title, action slot) and `BottomNav` with four
tabs: Home, Items, Capture (always drawn as the accent circle), To finish; active state by
pathname prefix. Locations, Policy, Report, and Resilience are reached from dashboard tiles and
carry a "← Home" back link.

The dashboard (`page.tsx`) renders household-locations' onboarding form when no household
exists; otherwise the coverage widget, then either a "Start your inventory" card (no items) or
Items / To-finish stats, then seven tiles: All items, To finish (draft badge only when > 0),
Locations (count), Household, Insurance coverage, Proof packet (PDF), Backup & export. The draft count is
computed by filtering the full item list in memory.

Every page and route handler is `force-dynamic`: tables exist only after boot migrations and
SQLite is read live. `manifest.ts` serves a standalone-display manifest with a single SVG icon.
`sw.ts` (Serwist, webpack-only, disabled in development) precaches build assets with
`skipWaiting`, `clientsClaim`, and `navigationPreload`, and wraps the default runtime strategies
with `hardenRuntimeCaching`: a NetworkOnly route for same-origin `/api/*` is prepended, and a
`cacheWillUpdate` plugin drops any response carrying `Cache-Control: no-store` so pages, RSC
payloads, media, exports, and packets are never written to Cache Storage; `/_next/static` stays
cacheable for offline (`sw-cache-policy.ts`; VULN-007). `globals.css` defines the three coverage
tokens and declares `color-scheme: light`, matching the light-only palette. HTTPS is required for install and offline; plain HTTP keeps
capture through the native picker, which is the only camera path.

## Container and CI

`Dockerfile`: `node:26-trixie-slim` builder (`npm ci`, `next build --webpack`, standalone output)
and `gcr.io/distroless/nodejs26-debian13` runtime on the same Debian release so native addons
(better-sqlite3, sharp/libvips) link; both digest-pinned. The runtime copies `.next/standalone`,
`.next/static`, `public`, the full `sharp` and `@img` trees (the standalone tracer misses libvips
`.so` files), and `drizzle/`; pre-creates `/data` for uid 65532; `USER 65532:65532`; `VOLUME
/data`; `HEALTHCHECK` on `/api/health`. `.dockerignore` keeps `.git`, data, env files, tests,
docs, and the spec files out of the context.

CI (`ci.yml`): lint (`biome check`), typecheck, unit with the coverage gate (100% statements,
lines, functions and 90% branches on `coverage.ts`, `money.ts`, `report.ts`), build, e2e on a
Pixel 7 profile with `AI_FAKE=1`; a second job runs the integration suite against a RustFS
container; a reusable `supply-chain.yml` runs `npm ci --ignore-scripts`, `npm audit signatures`,
Socket when its secret exists, and OSV-Scanner in PR-diff mode (fail only on introduced
vulnerabilities) or absolute mode on main and weekly. `docker-publish.yml` builds on PRs and on
main or `v*` tags pushes to GHCR gated on the scan, signs with cosign keyless, and attaches SPDX
SBOM and build-provenance attestations. `ghcr-retention.yml` keeps `latest` plus five tagged
versions. `renovate.json` groups and automerges non-majors after three days, labels majors, pins
digests, and keeps the builder and distroless Node majors in lockstep through a custom manager.
`package.json` `overrides` are range floors with GHSA reasons, never exact pins.

Security posture: no application authentication by design; the network boundary (VPN or reverse
proxy) is the security boundary. Secrets are env-only and never reach the client or logs.

## Decisions & Alternatives

| Decision                      | Chosen                                                                                    | Alternatives Considered                                                              | Rationale                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database                      | SQLite via better-sqlite3 + Drizzle, WAL                                                  | Postgres; LiteFS; Prisma                                                             | architecture.md: a single file is trivial to snapshot to S3 and needs no engine binary in a distroless image; Drizzle generates migrations from one schema file.                                                                                                                     |
| Framework                     | Next.js App Router, Server Actions for mutations, server components for reads             | Separate API + SPA; Remix                                                            | architecture.md: one language end-to-end; Server Actions give the AI proxy and uploads a server boundary without a hand-written API.                                                                                                                                                 |
| Env access                    | One validated reader (`config.ts`), parse at import, fail fast                            | Read `process.env` where needed; runtime config UI                                   | Principle 7 and configuration.md: operator config is env-only and invalid config must not serve; one reader makes the "exactly what is read" list auditable.                                                                                                                         |
| Rendering mode                | `force-dynamic` everywhere                                                                | Static pages with revalidation                                                       | `page.tsx:19-20`: tables exist only after boot migrations; the inventory is live data.                                                                                                                                                                                               |
| Money and time                | Integer cents; ISO text timestamps                                                        | Floats; `REAL`; Unix integers                                                        | CLAUDE.md convention; cents avoid float drift in totals that reach a claim; ISO text sorts and reads in SQLite.                                                                                                                                                                      |
| Media on disk, paths relative | Filesystem under `DATA_DIR`, DB stores relative paths + sha256                            | Blobs in SQLite; absolute paths                                                      | architecture.md: keeps the DB tiny and snapshots fast; relative paths make restore mount-independent; the hash doubles as S3 dedupe key.                                                                                                                                             |
| Upload trust                  | Magic-byte sniffing; photos re-encoded; AVIF excluded                                     | Trust `File.type`; extension allowlist                                               | VULN-012: a renamed SVG or HTML must never be stored as an image; sharp decode of allowed formats only.                                                                                                                                                                              |
| Serving route hardening       | Lexical + realpath + regular-file + size cap + stream + identical 404                     | Serve from `public/`; signed URLs                                                    | architecture.md security model: this is the only user-input → file-read surface; identical 404 denies probing.                                                                                                                                                                       |
| Media caching                 | `private, no-store` on every media response; SW never caches `/api/*` or `no-store`       | Long-lived immutable cache by hash                                                   | VULN-023 and VULN-007: receipts and serial plates must not outlive deletion in a browser or SW cache on a shared device.                                                                                                                                                             |
| `next/image`                  | Not used; plain `<img>`, Biome rule off                                                   | `next/image`                                                                         | `biome.jsonc:29-32`: media is self-served from `/api/media`; the optimizer adds nothing and its wrapper breaks the capture and gallery flows.                                                                                                                                        |
| Bundler                       | webpack for dev and build                                                                 | Turbopack                                                                            | `next.config.ts:4-6`: `@serwist/next` is webpack-only.                                                                                                                                                                                                                               |
| Native packages               | `serverExternalPackages` for better-sqlite3, sharp, react-pdf                             | Bundle                                                                               | `next.config.ts:18-22`: native addons and large pure-JS renderers must not be traced into the server bundle.                                                                                                                                                                         |
| Lint/format                   | Biome defaults, no style overrides                                                        | ESLint + Prettier                                                                    | `biome.jsonc:3-5`: one tool, defaults on purpose; the ESLint-era OSV suppression went with it.                                                                                                                                                                                       |
| Container                     | Two-stage, distroless, non-root, healthcheck, digest-pinned, same Debian release          | Alpine; full Debian; root                                                            | README and Dockerfile comments: glibc parity for native addons, minimal attack surface, global Docker rules.                                                                                                                                                                         |
| Dependency updates            | Renovate with grouped non-major automerge, labelled majors, digest pinning, Node lockstep | Dependabot; manual                                                                   | `renovate.json` descriptions: the custom manager exists because a digest-only bump would desync builder and runtime Node majors and break ABI.                                                                                                                                       |
| Authentication                | None in-app; VPN or reverse proxy                                                         | Built-in login                                                                       | README, CLAUDE.md, configuration.md: single user on a private network; the no-store and no-leak rules exist because of this choice.                                                                                                                                                  |
| Dashboard composition         | Coverage widget first, then stats or the start card, then six tiles                       | Tabs; list-first                                                                     | Spec §7 wants coverage ambient and glanceable on the home screen; the tiles expose the surfaces that are not in the bottom nav.                                                                                                                                                      |
| Enum enforcement              | TypeScript constants + Zod at write sites; plain TEXT columns, no CHECK                   | SQLite CHECK constraints; lookup tables                                              | Every write already passes a Zod schema or a typed constant, and the enum lists live in client-safe modules the UI shares; a CHECK would duplicate them in migrations that must be regenerated on every change. The DB stays the backstop for referential integrity, not value sets. |
| Color scheme                  | Light only (`color-scheme: light`)                                                        | Full dark palette                                                                    | The capture-first UI is used in the field in daylight; a dark palette across every component is cost without a stated need. Declaring light only keeps native controls consistent with the page.                                                                                     |
| Server Action body limit      | Fixed 50 MB in `next.config.ts`, documented                                               | Derive from `UPLOAD_MAX_FILE_MB × UPLOAD_MAX_FILES_PER_REQUEST`; make it an env knob | The framework cap bounds memory per request regardless of operator settings; the upload knobs bound what is kept. Capture reports dropped photos (CAPTURE-FLOW-012) so the owner sees the effect without another knob.                                                               |
| Camera access                 | Native file/camera picker everywhere; no `getUserMedia` viewfinder                        | HTTPS-only live viewfinder                                                           | The picker works over plain HTTP, needs no permission prompt, and hands off to the phone's own camera app; nothing in the claim workflow needs a custom viewfinder.                                                                                                                  |

## Open Questions & Future Decisions

### Resolved

1. ✅ No application-level authentication; deploy behind a VPN or reverse proxy.
2. ✅ Webpack, not Turbopack, while Serwist is webpack-only.
3. ✅ `docs/configuration.md` is the complete operator reference and names the environment reads
   that happen outside `config.ts`; CLAUDE.md and `docs/architecture.md` say the same.
4. ✅ Enum values are enforced in TypeScript and Zod, not by CHECK constraints (see Decisions).
5. ✅ The UI is light-only and the root declares `color-scheme: light` (PLATFORM-PWA-007).
6. ✅ The 50 MB Server Action body limit stays fixed and documented; capture reports dropped
   photos rather than exposing another knob.
7. ✅ The native picker is the camera design; no live viewfinder is planned.

### Deferred

1. **Original extension from caller MIME** rather than the sniffed type; the backup's content
   type keys off it.
2. **Three copies of the media-root guard**; only one rejects NUL bytes.
3. **Fail-closed id parsing everywhere** — `parseId` exists but enrich's update, status, delete,
   and delete-document actions use `Number()` (files owned by enrich).
4. **Safe-area** top padding missing on the sticky header; no Apple touch icon PNG.
5. **Unpinned CI inputs**: `rustfs/rustfs:latest`, `@socketsecurity/cli@latest`.
6. **`.dockerignore`** negates a dotted `.env.example` that does not exist; `engines.node >=22`
   vs. Node 26 everywhere; `next.config.ts` comment says "Next 15".
7. **`declarations.md`** carries a real policy number in git (excluded from the image).
8. **Dormant `tag`/`item_tag`** tables and never-written enum values (`acv`, `condition`,
   `serial_plate`, `edited`, `rejected`) are each tracked by their owning segment; platform
   keeps the columns until those decisions land.
9. **Draft count** on the dashboard filters the full item list in memory rather than counting.

## References

- `docs/architecture.md`, `docs/configuration.md`, `README.md`, `env.example`, `CLAUDE.md`.
- Child segments: every other node under `docs/intent/` consumes platform's config keys,
  tables, media store, scheduler slots, or shell.
- Tests: `tests/unit/media-route.security.test.ts` (VULN-009, VULN-023),
  `tests/unit/sw-cache-policy.security.test.ts` (VULN-007),
  `tests/unit/image-format.security.test.ts` (VULN-012),
  `tests/unit/content-integrity.security.test.ts` (VULN-018),
  `tests/unit/parse-id.security.test.ts` (VULN-014), `tests/e2e/security.spec.ts`,
  `tests/integration/media-process.test.ts`.
