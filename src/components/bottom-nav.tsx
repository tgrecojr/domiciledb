"use client";

import { Camera, ClipboardList, Home, Package } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", icon: Home, exact: true, accent: false },
  {
    href: "/items",
    label: "Items",
    icon: Package,
    exact: false,
    accent: false,
  },
  {
    href: "/capture",
    label: "Capture",
    icon: Camera,
    exact: false,
    accent: true,
  },
  {
    href: "/worklist",
    label: "To finish",
    icon: ClipboardList,
    exact: false,
    accent: false,
  },
];

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom sticky bottom-0 z-10 border-t border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-2xl grid-cols-4 items-center">
        {tabs.map(({ href, label, icon: Icon, exact, accent }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${
                accent
                  ? "font-medium text-neutral-900"
                  : active
                    ? "text-neutral-900"
                    : "text-neutral-400"
              }`}
            >
              <span
                className={
                  accent
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white"
                    : ""
                }
              >
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
