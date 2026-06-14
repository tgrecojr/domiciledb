import { getHousehold } from "@/lib/queries/household";
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

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{household.name}</h1>
        {household.address ? (
          <p className="text-neutral-600">{household.address}</p>
        ) : null}
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <p className="text-neutral-600">
          Your household is set up. Item capture, the &ldquo;needs detail&rdquo;
          worklist, coverage tracking, and the proof packet arrive in the next
          build phases.
        </p>
      </section>
    </main>
  );
}
