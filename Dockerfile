# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

# ─── Stage 1: build (compile native better-sqlite3, build Next standalone) ────
# Debian bookworm = glibc, matching the distroless runtime below.
FROM node:24-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS builder
WORKDIR /app

# Toolchain for node-gyp (better-sqlite3 compiles from source).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps against the lockfile for reproducibility.
COPY package.json package-lock.json ./
RUN npm ci

# Build the app (also compiles the Serwist service worker).
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Pre-create the data dir owned by the distroless nonroot uid (65532).
RUN mkdir -p /data && chown 65532:65532 /data

# ─── Stage 2: runtime (distroless, non-root) ──────────────────────────────────
FROM gcr.io/distroless/nodejs24-debian12@sha256:61f4f4341db81820c24ce771b83d202eb6452076f58628cd536cc7d94a10978b AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

# Next standalone server + traced node_modules (includes native better-sqlite3).
COPY --from=builder --chown=65532:65532 /app/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/.next/static ./.next/static
COPY --from=builder --chown=65532:65532 /app/public ./public
# Next's standalone tracer copies sharp's JS + sharp.node but misses the
# sibling libvips shared object (@img/sharp-libvips-linux-x64/lib/*.so) that the
# addon dlopen()s at runtime — yielding ERR_DLOPEN_FAILED for libvips-cpp.so.
# Copy the full sharp + @img trees so the addon and its libvips lib travel
# together. (Builder is glibc x64, matching the distroless runtime ABI.)
COPY --from=builder --chown=65532:65532 /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=65532:65532 /app/node_modules/@img ./node_modules/@img
# Migrations must be present at runtime cwd (instrumentation.ts applies them).
COPY --from=builder --chown=65532:65532 /app/drizzle ./drizzle
# Writable data volume, owned by the nonroot user.
COPY --from=builder --chown=65532:65532 /data /data

USER 65532:65532
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Distroless entrypoint is `node`; run the standalone server.
CMD ["server.js"]
