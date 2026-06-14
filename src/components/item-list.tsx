import { ImageOff } from "lucide-react";
import Link from "next/link";

import type { ItemListRow } from "@/lib/queries/items";
import { mediaUrl } from "@/lib/media";

export function ItemList({
  items,
  locationNames,
}: {
  items: ItemListRow[];
  locationNames: Map<number, string>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.id}>
          <Link
            href={`/items/${it.id}`}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 active:bg-neutral-50"
          >
            <Thumb path={it.thumbPath} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{it.title}</span>
              <span className="text-xs text-neutral-500">
                {it.locationId
                  ? (locationNames.get(it.locationId) ?? "Unknown location")
                  : "Unassigned"}
              </span>
            </div>
            {it.status === "draft" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Draft
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thumb({ path }: { path: string | null }) {
  if (!path) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
        <ImageOff className="h-5 w-5" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(path)}
      alt=""
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
    />
  );
}
