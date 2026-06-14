import { AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";

import type { CoverageSummary } from "@/lib/queries/coverage";
import { formatCentsWhole } from "@/lib/money";

const STATUS_STYLES = {
  within: {
    bar: "bg-coverage-within",
    text: "text-coverage-within",
    ring: "border-coverage-within/30 bg-coverage-within/5",
    icon: ShieldCheck,
    label: "Within coverage",
  },
  approaching: {
    bar: "bg-coverage-approaching",
    text: "text-coverage-approaching",
    ring: "border-coverage-approaching/30 bg-coverage-approaching/5",
    icon: TrendingUp,
    label: "Approaching your limit",
  },
  over: {
    bar: "bg-coverage-over",
    text: "text-coverage-over",
    ring: "border-coverage-over/30 bg-coverage-over/5",
    icon: AlertTriangle,
    label: "Over your limit",
  },
} as const;

export function CoverageWidget({ summary }: { summary: CoverageSummary }) {
  // No policy / limit yet — invite setup rather than showing a meaningless bar.
  if (
    !summary.hasPolicy ||
    summary.limitCents === null ||
    summary.status === null
  ) {
    return (
      <Link
        href="/policy"
        className="flex flex-col gap-1 rounded-xl border border-dashed border-neutral-300 bg-white p-4"
      >
        <span className="font-medium">Set up your coverage</span>
        <span className="text-sm text-neutral-500">
          Add your Coverage B limit to see whether your belongings are within
          your policy.
        </span>
      </Link>
    );
  }

  const s = STATUS_STYLES[summary.status];
  const Icon = s.icon;
  const pct = Math.round(summary.pctUsed! * 100);

  return (
    <Link
      href="/policy"
      className={`flex flex-col gap-3 rounded-xl border p-4 ${s.ring}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${s.text}`} />
          <span className={`font-medium ${s.text}`}>{s.label}</span>
        </div>
        <span className={`text-sm font-semibold ${s.text}`}>{pct}%</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full ${s.bar}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <p className="text-sm text-neutral-600">
        {formatCentsWhole(summary.totalCents)} inventoried of{" "}
        {formatCentsWhole(summary.limitCents)} Coverage B.
      </p>

      {summary.excludedCount > 0 ? (
        <p className="text-xs text-neutral-500">
          {summary.excludedCount} item
          {summary.excludedCount === 1 ? "" : "s"} without a replacement value —
          not yet counted, so the real total is higher.
        </p>
      ) : null}

      <p className="text-xs text-neutral-400">
        Informational only — verify coverage with your insurer.
      </p>
    </Link>
  );
}
