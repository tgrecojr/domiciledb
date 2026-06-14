import { CloudOff, CloudUpload, Download } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { backupNowAction } from "@/lib/actions/backup";
import { readBackupStatus } from "@/lib/backup/run";
import { config } from "@/lib/config";
import { getHouseholdId } from "@/lib/queries/household";

export const dynamic = "force-dynamic";

function fmt(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString();
}

export default async function ResiliencePage() {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const enabled = config.backup.enabled;
  const status = readBackupStatus();

  return (
    <AppShell title="Backup & export" back={{ href: "/", label: "Home" }}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2">
            {enabled ? (
              <CloudUpload className="text-coverage-within h-5 w-5" />
            ) : (
              <CloudOff className="h-5 w-5 text-neutral-400" />
            )}
            <span className="font-medium">Off-site backup (S3)</span>
          </div>

          {enabled ? (
            <p className="text-sm text-neutral-600">
              Backing up to <strong>{config.backup.bucket}</strong>
              {config.backup.endpoint ? ` (${config.backup.endpoint})` : ""} on
              schedule <code>{config.backup.cron}</code>.
            </p>
          ) : (
            <p className="text-sm text-neutral-600">
              Not configured. Set <code>S3_BUCKET</code> and credentials at
              deploy time to sync your database, photos, and a current PDF
              off-site. Until then, backups are skipped.
            </p>
          )}

          {status ? (
            <p className="text-xs text-neutral-500">
              Last run: {fmt(status.at)} —{" "}
              <span
                className={
                  status.status === "ok"
                    ? "text-coverage-within"
                    : status.status === "error"
                      ? "text-coverage-over"
                      : "text-neutral-500"
                }
              >
                {status.status}
              </span>
              {status.status === "ok"
                ? ` · ${status.mediaUploaded ?? 0} new files, db ${Math.round((status.snapshotBytes ?? 0) / 1024)} KB`
                : status.reason
                  ? ` · ${status.reason}`
                  : status.error
                    ? ` · ${status.error}`
                    : ""}
            </p>
          ) : (
            <p className="text-xs text-neutral-500">No backup has run yet.</p>
          )}

          <form action={backupNowAction}>
            <button
              type="submit"
              disabled={!enabled}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Back up now
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
          <span className="font-medium">Export everything</span>
          <p className="text-sm text-neutral-600">
            Download a ZIP of your database snapshot plus all photos and
            documents — for safekeeping and to avoid lock-in.
          </p>
          <a
            href="/api/export"
            className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium"
          >
            <Download className="h-4 w-4" />
            Download export (.zip)
          </a>
        </section>
      </div>
    </AppShell>
  );
}
