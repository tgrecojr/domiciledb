import {
  ClipboardList,
  DatabaseBackup,
  FileText,
  MapPin,
  Package,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CoverageWidget } from "@/components/coverage-widget";
import { getCoverageSummary } from "@/lib/queries/coverage";
import { getHousehold } from "@/lib/queries/household";
import { listItems } from "@/lib/queries/items";
import { listLocations } from "@/lib/queries/locations";
import { OnboardingForm } from "./onboarding-form";

// The dashboard reads live inventory state from SQLite — never prerender it at
// build time (the db/tables only exist after migrations run on boot).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const household = await getHousehold();

  if (!household) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-6 px-5 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Welcome to DomicileDB</h1>
          <p className="text-neutral-600">
            Let&apos;s set up your household. Then you&apos;ll snap photos of
            what you own — a few items at a time — and fill in details later.
          </p>
        </header>
        <OnboardingForm />
      </main>
    );
  }

  const items = listItems(household.id);
  const drafts = items.filter((i) => i.status === "draft").length;
  const locations = listLocations(household.id);
  const coverage = getCoverageSummary(household.id);

  return (
    <AppShell title={household.name}>
      <div className="flex flex-col gap-6">
        {/* Ambient coverage status — glanceable, never demanding. */}
        <CoverageWidget summary={coverage} />

        {items.length === 0 ? (
          <section className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-center">
            <p className="font-medium">Start your inventory</p>
            <p className="text-sm text-neutral-600">
              The loop is simple: snap a photo, save it as a draft, and fill in
              details whenever you like.
            </p>
            <Link
              href="/capture"
              className="mt-1 self-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white"
            >
              Capture your first item
            </Link>
          </section>
        ) : (
          <section className="grid grid-cols-2 gap-3">
            <Stat label="Items" value={items.length} href="/items" />
            <Stat label="To finish" value={drafts} href="/worklist" />
          </section>
        )}

        <nav className="flex flex-col gap-2">
          <Tile href="/items" icon={Package} label="All items" />
          <Tile
            href="/worklist"
            icon={ClipboardList}
            label="To finish"
            badge={drafts > 0 ? drafts : undefined}
          />
          <Tile
            href="/locations"
            icon={MapPin}
            label="Locations"
            badge={locations.length}
          />
          <Tile href="/policy" icon={ShieldCheck} label="Insurance coverage" />
          <Tile href="/report" icon={FileText} label="Proof packet (PDF)" />
          <Tile
            href="/resilience"
            icon={DatabaseBackup}
            label="Backup & export"
          />
        </nav>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-sm text-neutral-500">{label}</span>
    </Link>
  );
}

function Tile({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: typeof Package;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
    >
      <Icon className="h-5 w-5 text-neutral-500" />
      <span className="flex-1 font-medium">{label}</span>
      {badge !== undefined ? (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
