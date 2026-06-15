"use client";

import { Trash2, X } from "lucide-react";
import { useState } from "react";

import { deleteLocationPhotoAction } from "@/lib/actions/locations";

interface Photo {
  id: number;
  web: string;
  original: string;
}

/* eslint-disable @next/next/no-img-element -- media is served from /api/media,
   not the Next image optimizer. */
export function LocationPhotoGrid({
  locationId,
  photos,
}: {
  locationId: number;
  photos: Photo[];
}) {
  const [open, setOpen] = useState<Photo | null>(null);

  return (
    <>
      {photos.map((p) => (
        <div key={p.id} className="relative h-24 w-24">
          <button
            type="button"
            onClick={() => setOpen(p)}
            aria-label="View larger"
            className="h-24 w-24 overflow-hidden rounded-lg"
          >
            <img
              src={p.web}
              alt=""
              className="h-full w-full object-cover transition hover:opacity-90"
            />
          </button>
          <form
            action={deleteLocationPhotoAction}
            className="absolute top-1 right-1"
          >
            <input type="hidden" name="locationId" value={locationId} />
            <input type="hidden" name="photoId" value={p.id} />
            <button
              type="submit"
              aria-label="Delete photo"
              className="rounded-full bg-black/55 p-1 text-white hover:bg-black/75"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      ))}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={open.web}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
          <a
            href={open.original}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 text-sm text-white/80 underline"
          >
            View original
          </a>
        </div>
      ) : null}
    </>
  );
}
