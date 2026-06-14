import Link from "next/link";

import { BottomNav } from "./bottom-nav";

/**
 * Mobile-first shell: a sticky title bar, a scrollable content area, and the
 * bottom navigation. Used by every main app page (capture/items/worklist/etc.).
 */
export function AppShell({
  title,
  back,
  action,
  children,
}: {
  title: string;
  back?: { href: string; label?: string };
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {back ? (
            <Link
              href={back.href}
              className="text-sm text-neutral-500 hover:text-neutral-900"
            >
              ← {back.label ?? "Back"}
            </Link>
          ) : null}
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        {action}
      </header>

      <main className="flex flex-1 flex-col px-4 py-4 pb-28">{children}</main>

      <BottomNav />
    </>
  );
}
