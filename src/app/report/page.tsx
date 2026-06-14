import { Download, FileText } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getHouseholdId } from "@/lib/queries/household";
import { listCategories } from "@/lib/queries/categories";
import { listLocations } from "@/lib/queries/locations";

export const dynamic = "force-dynamic";

function DownloadRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
    >
      <span>{label}</span>
      <Download className="h-4 w-4 text-neutral-400" />
    </a>
  );
}

export default async function ReportPage() {
  const householdId = await getHouseholdId();
  if (householdId === null) redirect("/");

  const locations = listLocations(householdId);
  const categories = listCategories();

  return (
    <AppShell title="Proof packet" back={{ href: "/", label: "Home" }}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-neutral-500" />
            <span className="font-medium">Claim-ready inventory PDF</span>
          </div>
          <p className="text-sm text-neutral-600">
            A print-ready document organized by location with photos, specs,
            values, and totals — to hand to an insurer after a loss.
          </p>
          <a
            href="/api/proof-packet"
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Download className="h-4 w-4" />
            Download entire household
          </a>
        </section>

        {locations.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-neutral-700">
              By location
            </h2>
            {locations.map((l) => (
              <DownloadRow
                key={l.id}
                href={`/api/proof-packet?location=${l.id}`}
                label={l.name}
              />
            ))}
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">
            By category
          </h2>
          {categories.map((c) => (
            <DownloadRow
              key={c.id}
              href={`/api/proof-packet?category=${c.id}`}
              label={c.name}
            />
          ))}
        </section>
      </div>
    </AppShell>
  );
}
