"use client";

import { ImagePlus } from "lucide-react";
import { useRef } from "react";

import { addPhotosAction } from "@/lib/actions/items";

export function AddPhotos({ itemId }: { itemId: number }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={addPhotosAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400">
        <ImagePlus className="h-5 w-5" />
        <span className="text-[10px]">Add</span>
        <input
          type="file"
          name="photos"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
    </form>
  );
}
