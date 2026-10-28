# Platform — EARS specs

Prefix `PLATFORM`. Facets: `CONFIG` (operator configuration), `BOOT` (startup, connection,
scheduler, health), `DATA` (schema conventions), `MEDIA` (the media store and the serving route),
`PWA` (shell, navigation, manifest, service worker), `OPS` (container, CI, dependency policy).

Markers: `[x]` observed working in current code · `[ ]` specified, not yet implemented or partial
· `[D]` deferred.

## Configuration

- [x] **PLATFORM-CONFIG-001**: All operator configuration shall be read from the environment through the single config module, validated with a schema when the module loads, and an invalid value shall stop the server before it serves; the only other environment reads shall be Next.js framework variables, the build configuration, and the standalone migration and restore scripts.
- [x] **PLATFORM-CONFIG-002**: `DATA_DIR` shall default to `<cwd>/data` and shall hold `domiciledb.db`, `media/`, and `backup/` (with `domiciledb-snapshot.db`, `proof-packet-latest.pdf`, and `status.json`) at fixed relative paths.
- [x] **PLATFORM-CONFIG-003**: AI features shall be enabled if and only if `OPENROUTER_API_KEY` is non-empty, backup shall be enabled if and only if `S3_BUCKET` is non-empty, and the application shall be fully usable with neither.
- [x] **PLATFORM-CONFIG-004**: The config module shall supply these defaults when unset: `OPENROUTER_MODEL` `openai/gpt-4o`, `OPENROUTER_BASE_URL` `https://openrouter.ai/api/v1`, `AI_MAX_CALLS_PER_HOUR` 60, `S3_REGION` `us-east-1`, `BACKUP_CRON` `0 3 * * *`, `UPLOAD_MAX_FILE_MB` 25, `UPLOAD_MAX_FILES_PER_REQUEST` 20, `MEDIA_MAX_TOTAL_MB` 20480, `MEDIA_MAX_SERVE_MB` 100, `EXPORT_MIN_INTERVAL_SECONDS` 60, `PROOF_PACKET_MAX_ITEMS` 2000, `MAX_CATEGORIES` 500, `COVERAGE_WARN_PCT` 0.80, `REVALUATION_CADENCE_DAYS` 90.
- [x] **PLATFORM-CONFIG-005**: The AI API key and S3 secret shall never be logged, sent to the client, or included in an error message.
- [x] **PLATFORM-CONFIG-006**: The operator configuration reference (`docs/configuration.md`) shall document every variable the config module reads, with its default and what it gates, and shall name the environment reads that happen outside the config module.
- [x] **PLATFORM-CONFIG-007**: The application shall expose no end-user settings; every tunable (backup target and cadence, AI credentials and model, thresholds, limits) shall be operator configuration.

## Boot and persistence

- [x] **PLATFORM-BOOT-001**: When the server starts on the Node runtime, and not during a production build, the system shall apply pending Drizzle migrations from `./drizzle`, then seed default categories, then start the scheduler, in that order.
- [x] **PLATFORM-BOOT-002**: The system shall open one better-sqlite3 connection per process, cached globally, with `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000`, creating `DATA_DIR`, `backup/`, and `media/` first if missing.
- [x] **PLATFORM-BOOT-003**: While the production build phase is running, the database module shall provide an empty in-memory database and shall not touch the data file.
- [x] **PLATFORM-BOOT-004**: The scheduler shall register its jobs at most once per process.
- [x] **PLATFORM-BOOT-005**: `GET /api/health` shall respond 200 with `{"status":"ok"}` without touching the database.
- [x] **PLATFORM-BOOT-006**: A standalone migration script (`npm run db:migrate`) shall apply the same migrations with the same pragmas for command-line and CI use.

## Schema conventions

- [x] **PLATFORM-DATA-001**: `src/db/schema.ts` shall be the single source of truth for the data model, and migrations shall be generated from it rather than hand-written.
- [x] **PLATFORM-DATA-002**: Every money column shall be `INTEGER` cents and every timestamp column shall be ISO-8601 UTC text defaulting to the database's current time.
- [x] **PLATFORM-DATA-003**: Every media path stored in the database shall be relative to `DATA_DIR`.
- [x] **PLATFORM-DATA-004**: Enum-valued columns shall be plain text whose allowed values are defined in TypeScript and enforced by validation at write sites.
- [x] **PLATFORM-DATA-005**: Deleting a household shall cascade to its locations, items, and policy; deleting a location shall cascade to its room photos and clear the location of its items; deleting an item shall cascade to its tags, valuations, photos, documents, and reminders and clear the item reference on its AI interactions; deleting a category shall clear the category of its items.
- [x] **PLATFORM-DATA-006**: The id parser shall return null for any non-string, empty, zero, negative, non-integer, exponent-notation, or unsafe-integer value, and the parsed positive integer otherwise.
- [x] **PLATFORM-DATA-007**: Every server action and route handler shall parse ids from forms and query strings with the fail-closed id parser rather than numeric coercion.

## Media store and serving

- [x] **PLATFORM-MEDIA-001**: When a photo is stored, the media store shall write three files under the owning directory: `<sha256>-original.<ext>` with the bytes unchanged, `<sha256>-web.webp` with the long edge at most 1024 px at quality 80, and `<sha256>-thumb.webp` as a 320×320 cover crop at quality 70, where `<sha256>` is the full digest of the original.
- [x] **PLATFORM-MEDIA-002**: The media store shall refuse to decode any upload whose bytes do not sniff as JPEG, PNG, WebP, or HEIC, rejecting GIF, TIFF, BMP, SVG, AVIF, and unrecognized content regardless of declared type.
- [x] **PLATFORM-MEDIA-003**: The media store shall produce variants one at a time with sharp's cache disabled and concurrency set to 1.
- [x] **PLATFORM-MEDIA-004**: The remaining media quota shall be `MEDIA_MAX_TOTAL_MB` minus the bytes currently under `media/`, floored at zero.
- [x] **PLATFORM-MEDIA-005**: The media store shall be able to verify a stored file by re-hashing it and comparing to the recorded sha256.
- [x] **PLATFORM-MEDIA-006**: Deleting an item's media shall remove `media/items/<id>/` and `media/documents/items/<id>/`; deleting a location's media shall remove `media/locations/<id>/`; deleting individual stored files shall require the caller to confirm no other row references them.
- [x] **PLATFORM-MEDIA-007**: Any resolution of a requested or stored media path shall reject NUL bytes and any path that does not resolve to the expected root or strictly inside it, including sibling directories sharing the root's name as a prefix.
- [x] **PLATFORM-MEDIA-008**: The media serving route shall serve only regular files whose real path lies within the real media root, shall stream rather than buffer, shall respond 413 above `MEDIA_MAX_SERVE_MB`, and shall respond with an identical 404 for traversal attempts and missing files.
- [x] **PLATFORM-MEDIA-009**: Every media serving response, including 404, shall carry `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `Cache-Control: private, no-store, max-age=0, must-revalidate`.
- [x] **PLATFORM-MEDIA-010**: The media serving route shall set content types for webp, jpg/jpeg, png, heic, and pdf and `application/octet-stream` otherwise.
- [x] **PLATFORM-MEDIA-011**: The public URL of a stored media path shall be `/api/` followed by its `DATA_DIR`-relative path.
- [ ] **PLATFORM-MEDIA-012**: The original file's extension shall be derived from the sniffed type, not from the caller-supplied MIME type.
- [ ] **PLATFORM-MEDIA-013**: The media-root containment guard shall exist in one module and be used by every reader of stored media, including the AI image encoder and the PDF image loader.

## Shell and PWA

- [x] **PLATFORM-PWA-001**: The application shall render as a centered phone-width column with a sticky header (optional back link, title, action slot) and a four-tab bottom navigation of Home, Items, Capture (visually accented), and To finish, with pinch-zoom disabled.
- [x] **PLATFORM-PWA-002**: Locations, Insurance coverage, Proof packet, and Backup & export shall be reached from dashboard tiles with a "← Home" back link, not from the bottom navigation.
- [x] **PLATFORM-PWA-003**: The dashboard shall show the coverage widget, then a "Start your inventory" card when there are no items or Items and To-finish stats otherwise, then tiles for All items, To finish (with a draft-count badge only when greater than zero), Locations (with count), Household, Insurance coverage, Proof packet, and Backup & export.
- [x] **PLATFORM-PWA-004**: The application shall serve a web app manifest named DomicileDB with standalone display, start URL `/`, theme color `#16a34a`, and an SVG icon.
- [x] **PLATFORM-PWA-005**: In production the service worker shall precache build assets and claim clients immediately, shall route same-origin `/api/*` requests network-only, shall never write any response carrying `Cache-Control: no-store` to Cache Storage, and shall keep `/_next/static` assets cacheable for offline use.
- [x] **PLATFORM-PWA-006**: Every page and route handler shall render dynamically on each request with no prerendering.
- [x] **PLATFORM-PWA-007**: The application shall declare `color-scheme: light` only, so form controls and scrollbars match its light-only palette.
- [ ] **PLATFORM-PWA-008**: The sticky header shall pad for the device's top safe-area inset in standalone mode.
- [x] **PLATFORM-PWA-010**: Installation and offline use shall require HTTPS; over plain HTTP the application shall still support capture through the native picker.

## Container and CI

- [x] **PLATFORM-OPS-001**: The container shall be built in two stages (a Node Debian builder and a distroless Node runtime on the same Debian release and the same Node major, both digest-pinned), shall run as uid 65532, shall expose `/data` as a volume, and shall declare a health check against `/api/health`.
- [x] **PLATFORM-OPS-002**: The runtime image shall include the `drizzle/` migrations and the complete sharp and libvips trees, and shall never include user data, environment files, tests, or docs.
- [x] **PLATFORM-OPS-003**: Continuous integration shall gate every push and pull request on lint, typecheck, unit tests with 100% statement, line, and function coverage and 90% branch coverage on `coverage.ts`, `money.ts`, and `report.ts`, a production build, end-to-end tests, an integration round trip against an S3-compatible store, and a supply-chain scan (npm audit signatures, Socket when its secret is present, OSV in diff mode on pull requests and absolute mode on main and weekly).
- [x] **PLATFORM-OPS-004**: On push to main or a `v*` tag, the image shall be published to GHCR only after the supply-chain scan and the boot smoke (PLATFORM-OPS-008) have both passed, signed with cosign keyless, and attested with an SPDX SBOM and build provenance; retention shall keep `latest` and the five most recent tagged versions.
- [x] **PLATFORM-OPS-005**: Dependency updates shall be automated: non-major updates grouped and auto-merged after a three-day stability window, majors labelled for review, container digests pinned, and the builder image, runtime image, CI Node pins, and `@types/node` majors proposed together as one grouped update.
- [x] **PLATFORM-OPS-006**: The application shall provide no authentication of its own and shall be deployed behind a VPN or reverse proxy, which is the security boundary.
- [ ] **PLATFORM-OPS-007**: Every image, action, and tool the CI pipeline pulls shall be pinned to a version or digest, including the RustFS image and the Socket CLI.
- [x] **PLATFORM-OPS-008**: Whenever the Docker workflow builds the image, on a pull request or a push, the system shall load the built image into the runner's Docker, start a container from it with an empty `/data` and no environment beyond what the image itself sets, and shall fail the workflow unless `GET /api/health` and then `GET /` (following redirects) both end in a 200 response within 90 seconds, polling every 3 seconds.
- [x] **PLATFORM-OPS-009**: When the boot smoke finishes, whether it passed or failed, the system shall print the container's logs and stop and remove the container.
- [x] **PLATFORM-OPS-010**: The unit test suite shall fail when the builder image major in `Dockerfile`, the distroless runtime image major in `Dockerfile`, and every `node-version` pin in the workflow files do not all name the same Node major, or when the `@types/node` major in `package.json` exceeds that major.
