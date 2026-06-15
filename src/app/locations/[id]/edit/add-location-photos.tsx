"use client";

import { ImagePlus } from "lucide-react";
import { useRef } from "react";

import { addLocationPhotosAction } from "@/lib/actions/locations";

export function AddLocationPhotos({ locationId }: { locationId: number }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={addLocationPhotosAction}>
      <input type="hidden" name="locationId" value={locationId} />
      <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400">
        <ImagePlus className="h-5 w-5" />
        <span className="text-[10px]">Add</span>
        <input
          type="file"
          name="photos"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
    </form>
  );
}
