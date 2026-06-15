"use client";

import { useRouter } from "next/navigation";

const ALL = "all";
const UNASSIGNED = "unassigned";

/**
 * Title-bar dropdown that filters the Items list by location. Drives the
 * `?location=` search param so the filter is server-rendered and shareable.
 * `value` is the currently active selection ("all", "unassigned", or an id).
 */
export function LocationFilter({
  locations,
  value,
}: {
  locations: { id: number; name: string }[];
  value: string;
}) {
  const router = useRouter();

  return (
    <select
      aria-label="Filter by location"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === ALL ? "/items" : `/items?location=${v}`);
      }}
      className="max-w-[10rem] truncate rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm"
    >
      <option value={ALL}>All locations</option>
      <option value={UNASSIGNED}>Unassigned</option>
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
