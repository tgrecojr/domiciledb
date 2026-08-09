import "server-only";

import fs from "node:fs";
import path from "node:path";

import { db } from "@/db";
import { household } from "@/db/schema";
import { config } from "@/lib/config";
import { renderProofPacket } from "@/lib/pdf/render";
import { getReportPacket } from "@/lib/queries/report";
import {
  keyForPath,
  LATEST_PDF_KEY,
  mediaToUpload,
  SNAPSHOT_KEY,
} from "./plan";
import { createSnapshot } from "./snapshot";
import { listKeys, putObject } from "./s3";

export interface BackupStatus {
  at: string;
  status: "ok" | "error" | "skipped";
  /**
   * App-authored, operator-safe explanation. NEVER third-party (SDK) error
   * text: this status is rendered on /resilience, which has no auth.
   */
  reason?: string;
  snapshotBytes?: number;
  pdfBytes?: number;
  mediaUploaded?: number;
  mediaSkipped?: number;
}

const FAILURE_REASON = "Backup failed — see the server log for details";
const NOT_CONFIGURED_REASON = "S3 not configured";

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function writeStatus(status: BackupStatus): BackupStatus {
  fs.mkdirSync(config.paths.backupDir, { recursive: true });
  fs.writeFileSync(config.paths.backupStatus, JSON.stringify(status, null, 2));
  return status;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Project an on-disk status onto the safe fields only. A status file written by
 * an older build can still hold verbatim SDK error text (bucket, endpoint,
 * host:port); that must never reach the page, so unknown fields are dropped and
 * the failure reason is always our own constant.
 */
function sanitize(raw: unknown): BackupStatus | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const status =
    r.status === "ok" || r.status === "skipped" ? r.status : "error";
  return {
    at: typeof r.at === "string" ? r.at : "",
    status,
    reason:
      status === "error"
        ? FAILURE_REASON
        : status === "skipped"
          ? NOT_CONFIGURED_REASON
          : undefined,
    snapshotBytes: count(r.snapshotBytes),
    pdfBytes: count(r.pdfBytes),
    mediaUploaded: count(r.mediaUploaded),
    mediaSkipped: count(r.mediaSkipped),
  };
}

export function readBackupStatus(): BackupStatus | null {
  try {
    return sanitize(
      JSON.parse(fs.readFileSync(config.paths.backupStatus, "utf8")),
    );
  } catch {
    return null;
  }
}

/**
 * Back up the db snapshot, item media, and a current PDF export to S3. A no-op
 * (never throws) when S3 isn't configured — backups are optional plumbing.
 */
export async function runBackup(now: string): Promise<BackupStatus> {
  if (!config.backup.enabled) {
    return writeStatus({
      at: now,
      status: "skipped",
      reason: NOT_CONFIGURED_REASON,
    });
  }

  try {
    // 1. Consistent db snapshot.
    const snap = createSnapshot();
    await putObject(
      SNAPSHOT_KEY,
      fs.readFileSync(snap.path),
      "application/x-sqlite3",
    );

    // 2. Current PDF proof packet (so the inventory is readable with no app).
    let pdfBytes: number | undefined;
    const hh = db.select({ id: household.id }).from(household).limit(1).get();
    if (hh) {
      const packet = getReportPacket(hh.id);
      if (packet) {
        const pdf = await renderProofPacket(packet);
        fs.writeFileSync(config.paths.latestPdf, pdf);
        await putObject(LATEST_PDF_KEY, pdf, "application/pdf");
        pdfBytes = pdf.length;
      }
    }

    // 3. Media — content-addressed, so upload only keys not already present.
    const localFiles = walkFiles(config.paths.mediaDir);
    const localKeys = localFiles.map((f) =>
      keyForPath(f, config.paths.dataDir),
    );
    const existing = await listKeys("media/");
    const toUpload = mediaToUpload(localKeys, existing);
    const keyToPath = new Map(localKeys.map((k, i) => [k, localFiles[i]!]));
    for (const key of toUpload) {
      const p = keyToPath.get(key)!;
      await putObject(key, fs.readFileSync(p), contentTypeFor(p));
    }

    return writeStatus({
      at: now,
      status: "ok",
      snapshotBytes: snap.bytes,
      pdfBytes,
      mediaUploaded: toUpload.length,
      mediaSkipped: localKeys.length - toUpload.length,
    });
  } catch (err) {
    // The SDK message carries operator infrastructure detail (bucket, endpoint,
    // host:port). It belongs in the server log the operator owns — not in the
    // status file the unauthenticated /resilience page renders.
    console.error("[backup] run failed:", err);
    return writeStatus({ at: now, status: "error", reason: FAILURE_REASON });
  }
}
