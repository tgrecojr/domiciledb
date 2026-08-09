import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { config } from "@/lib/config";
import { resolveMediaPath } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

// Served bytes are user-uploaded content from our own origin: stop the browser
// from MIME-sniffing them into something executable, and neuter any active
// content if a renderable type ever slips through.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

function notFound() {
  return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;

  // 1. Lexical guard: normalize + confirm the path stays under the media root.
  const abs = resolveMediaPath(parts.join("/"));
  if (!abs) return notFound();

  // 2. Defense in depth: resolve symlinks on BOTH the target and the media root
  //    (the root's own parents may be symlinks, e.g. /var -> /private/var on
  //    macOS), then require the real target to live under the real root.
  let real: string;
  let realRoot: string;
  try {
    realRoot = await fs.realpath(path.resolve(config.paths.mediaDir));
    real = await fs.realpath(abs);
  } catch {
    return notFound();
  }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    return notFound();
  }

  // 3. Only serve regular files (never directories / devices / fifos), and
  //    refuse anything over the serve cap outright.
  let size: number;
  try {
    const stat = await fs.stat(real);
    if (!stat.isFile()) return notFound();
    size = stat.size;
  } catch {
    return notFound();
  }
  if (size > config.uploads.maxServeBytes) {
    return new Response("Media file too large to serve", {
      status: 413,
      headers: SECURITY_HEADERS,
    });
  }

  const contentType =
    CONTENT_TYPES[path.extname(real).toLowerCase()] ??
    "application/octet-stream";

  // Stream it: reading into a Buffer and copying that into a Uint8Array put two
  // full copies of every served file in memory, so concurrent requests for big
  // originals could exhaust the process.
  const body = Readable.toWeb(
    createReadStream(real),
  ) as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      // These bytes are the household's receipts, serials and room photos.
      // Never leave a durable copy in a device/proxy cache: a long-lived
      // `immutable` entry outlives deleting the item in the app.
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      ...SECURITY_HEADERS,
    },
  });
}
