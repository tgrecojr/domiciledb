# Arrow: platform

Run DomicileDB as a self-hosted, single-user, mobile-first PWA: operator configuration, boot and
persistence, the schema and its conventions, the media store and the hardened serving route, the
app shell and service-worker policy, and the container and CI that ship it.

## Status

**AUDITED** — mapped and audited 2026-10-24 (git SHA `59605b6`, uncommitted working tree). Every
spec was checked against the code it describes; `@spec` annotations sit at every code entry point
with an anchor. Not `OK`: four gaps remain and most specs are pinned by code review, not by a
test.

## References

### HLD
- docs/high-level-design.md (System Design; Key Design Decisions: stack; Security posture)

### LLD
- docs/intent/platform/platform-design.md

### EARS
- docs/intent/platform/platform-specs.md (49 specs: 7 CONFIG, 6 BOOT, 7 DATA, 13 MEDIA, 9 PWA, 7 OPS)

### Tests
- tests/unit/parse-id.security.test.ts (VULN-014)
- tests/unit/media.test.ts
- tests/unit/media-route.security.test.ts (VULN-009, VULN-023)
- tests/unit/content-integrity.security.test.ts (VULN-018)
- tests/unit/image-format.security.test.ts (VULN-012, sniffing cases)
- tests/unit/sw-cache-policy.security.test.ts (VULN-007)
- tests/integration/media-process.test.ts
- tests/e2e/smoke.spec.ts, tests/e2e/security.spec.ts
- vitest.config.ts, vitest.integration.config.ts, playwright.config.ts, tests/stubs/empty.ts

### Code
- src/lib/config.ts
- src/instrumentation.ts, src/lib/scheduler.ts
- src/db/index.ts, migrate.ts, schema.ts; drizzle/**; drizzle.config.ts; scripts/migrate.ts
- src/lib/parse-id.ts
- src/lib/media.ts, src/lib/image-format.ts
- src/app/api/media/[...path]/route.ts, src/app/api/health/route.ts
- src/lib/sw-cache-policy.ts, src/app/sw.ts, src/app/manifest.ts
- src/app/layout.tsx, globals.css, page.tsx; src/components/app-shell.tsx, bottom-nav.tsx
- src/types/css.d.ts
- Dockerfile, .dockerignore, next.config.ts, tsconfig.json, biome.jsonc, postcss.config.mjs,
  package.json, renovate.json, osv-scanner.toml, env.example,
  .github/workflows/ci.yml, supply-chain.yml, docker-publish.yml, ghcr-retention.yml

## Architecture

**Purpose:** Everything the owner's jobs stand on but never see. One SQLite file and one media
tree under `DATA_DIR`, opened once, migrated on boot, snapshotted by resilience; operator
configuration read in one place and validated before the app serves; a media store that admits
only sniffed image bytes and serves them from a traversal-proof route with no caching; a phone-
width shell with a service worker that caches the app but never the inventory; and a distroless,
non-root, signed container built by a gated pipeline.

**Key Components:**
1. `config.ts` — Zod-validated env, frozen `config` object, feature gates for AI and backup.
2. Boot — `instrumentation.ts` runs migrations, seeds categories, starts the scheduler on the
   Node runtime only; `db/index.ts` holds the single WAL connection.
3. Schema — `schema.ts`, 13 tables, integer cents, ISO text timestamps, relative media paths.
4. Media store — `media.ts` (variants, hashing, quota, path guards, deletion, integrity) and
   `image-format.ts` (magic-byte allowlists).
5. Media serving — `/api/media/[...path]`: lexical + realpath containment, regular files only,
   streamed, size-capped, `nosniff` + sandbox CSP + `no-store`.
6. Shell and PWA — layout, app shell, bottom nav, dashboard, manifest, Serwist worker with the
   `no-store` and `/api/*` NetworkOnly hardening.
7. Container and CI — two-stage Dockerfile, CI gates, supply-chain scan, signed image, Renovate.

## Spec Coverage

| Category | Spec IDs | Implemented | Deferred | Gaps |
|----------|----------|-------------|----------|------|
| Configuration | PLATFORM-CONFIG-001 to 007 | 7 | 0 | 0 |
| Boot and persistence | PLATFORM-BOOT-001 to 006 | 6 | 0 | 0 |
| Schema conventions | PLATFORM-DATA-001 to 007 | 7 | 0 | 0 |
| Media store and serving | PLATFORM-MEDIA-001 to 013 | 11 | 0 | 2 |
| Shell and PWA | PLATFORM-PWA-001 to 010 (009 deleted) | 8 | 0 | 1 |
| Container and CI | PLATFORM-OPS-001 to 007 | 6 | 0 | 1 |

**Summary:** 45 of 49 active specs implemented; 4 gaps (PLATFORM-MEDIA-012 original extension
from sniffed type, PLATFORM-MEDIA-013 one shared media-root guard, PLATFORM-PWA-008 safe-area
header, PLATFORM-OPS-007 pinned CI inputs); 0 deferred. Fail-closed id parsing is now uniform
across every action (PLATFORM-DATA-007, built with enrich's hardening change).

**Traceability (audit 2026-10-24):** 43 specs are cited by `@spec` in code or config; the six
without a code anchor are documentation or policy specs (CONFIG-006, OPS-005 in `renovate.json`
which cannot carry comments, OPS-006, PWA-010) or gaps whose fix lands in another segment's files
(DATA-007, MEDIA-013). Specs with a citing test: BOOT-005, DATA-006, MEDIA-001, -002, -005, -007,
-008, -009, PWA-001, PWA-005, PWA-007 (13 citations across 9 test files). No reverse orphans.

## Key Findings

1. **"config.ts is the only env reader" has stated exceptions.** `instrumentation.ts` and
   `db/index.ts` read Next's `NEXT_RUNTIME`/`NEXT_PHASE`; `next.config.ts` reads `NODE_ENV`;
   `scripts/migrate.ts` and `scripts/restore.ts` read `DATA_DIR`/`S3_*` because tsx has no `@/`
   alias; `drizzle.config.ts` reads `DATA_DIR`. None are operator knobs bypassing validation.
   CLAUDE.md, `docs/configuration.md`, and `docs/architecture.md` now state the exceptions.
2. **`docs/configuration.md` is the full reference again** — it documents every variable
   `config.ts` reads, including the upload/media, export, packet, category, and AI spend knobs
   that previously lived only in `env.example`.
3. **Enum columns have no CHECK constraints**; every `kind`/`status`/`source`/`outcome` is plain
   TEXT enforced only in TypeScript and Zod (`drizzle/0000_*.sql`; snapshots'
   `checkConstraints: {}`).
4. **The original's file extension comes from the caller-supplied MIME** while admission uses
   byte sniffing (`src/lib/media.ts:46-51, 217, 229`); the backup's content-type map then keys
   off that extension.
5. **The media-root guard exists three times**: `media.ts:60-69`, `ai/image.ts:19-24`,
   `pdf/images.ts:21-26`; only the first rejects NUL bytes.
6. **Media serving is the one user-input → file-read surface and is layered**: lexical resolve,
   realpath containment of target and root (macOS `/var` symlink), regular-file check, size cap,
   streaming, identical 404 for traversal and not-found, `nosniff` + sandbox CSP + private
   `no-store` on every response including 404 (`src/app/api/media/[...path]/route.ts:24-95`;
   VULN-009, VULN-023; `tests/e2e/security.spec.ts`).
7. **The service worker never persists inventory**: `/api/*` is NetworkOnly and any `no-store`
   response is dropped by every strategy; `/_next/static` stays cacheable
   (`src/lib/sw-cache-policy.ts`; VULN-007).
8. **Dark mode is half-declared**: `color-scheme: light dark` with a light-only palette
   (`globals.css:11`). The sticky header ignores `safe-area-inset-top` (`app-shell.tsx:22`).
9. **The native picker is the only camera path**; no `getUserMedia` viewfinder exists or is
   planned, and the docs no longer describe one.
10. **Two unpinned supply-chain inputs** in an otherwise digest-pinned pipeline:
    `rustfs/rustfs:latest` (`ci.yml:89`) and `@socketsecurity/cli@latest`
    (`supply-chain.yml:46`).
11. **`.dockerignore` negates a dotted `.env.example`** that does not exist; the real template is
    `env.example` and lands in the build context (placeholders only).
12. **Body limit vs. upload knobs**: `bodySizeLimit: "50mb"` is the binding per-request cap and
    is not derived from `UPLOAD_MAX_FILE_MB × UPLOAD_MAX_FILES_PER_REQUEST`.
13. **Dormant schema**: `tag`/`item_tag` have no code path (enrich's call); `engines.node >=22`
    while every runtime is Node 24; `declarations.md` holds a real policy number in git.
14. **Boot skips during `next build`** and uses an empty in-memory DB so build workers never
    race on the SQLite file (`instrumentation.ts:16`; `db/index.ts:31-33`).

## Work Required

### Must Fix
1. None at the security level; the media route, SW policy, and id parsing are tested.

### Should Fix
2. Derive the original extension from the sniffed type (PLATFORM-MEDIA-012) and collapse the
   three media-root guards into one with the NUL check (PLATFORM-MEDIA-013).
4. Pin `rustfs` and the Socket CLI (PLATFORM-OPS-007).
5. Make `parseId` the only id parser in actions and routes (PLATFORM-DATA-007; files in enrich).

### Nice to Have
6. Pad the header for the notch (PLATFORM-PWA-008).
7. Fix the `.dockerignore` negation; align `engines` with Node 24; add an Apple touch icon.
