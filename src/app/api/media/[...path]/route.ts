import fs from "node:fs/promises";
import path from "node:path";

import { resolveMediaPath } from "@/lib/media";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const rel = parts.join("/");

  const abs = resolveMediaPath(rel);
  if (!abs) {
    return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const contentType =
    CONTENT_TYPES[path.extname(abs).toLowerCase()] ??
    "application/octet-stream";

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      // Content-addressed filenames are immutable -> cache aggressively.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
