import fs from "node:fs/promises";
import path from "node:path";

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

  // 3. Only serve regular files (never directories / devices / fifos).
  let data: Buffer;
  try {
    const stat = await fs.stat(real);
    if (!stat.isFile()) return notFound();
    data = await fs.readFile(real);
  } catch {
    return notFound();
  }

  const contentType =
    CONTENT_TYPES[path.extname(real).toLowerCase()] ??
    "application/octet-stream";

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ...SECURITY_HEADERS,
    },
  });
}
