"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { captureItemAction } from "@/lib/actions/items";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

export function CaptureForm({
  locations,
  justSaved,
  emptyError,
}: {
  locations: { id: number; name: string }[];
  justSaved: boolean;
  emptyError: boolean;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  return (
    <form action={captureItemAction} className="flex flex-col gap-4">
      {justSaved ? (
        <p className="rounded-lg bg-coverage-within/10 px-3 py-2 text-sm text-coverage-within">
          Saved ✓ — capture the next item, or finish details later.
        </p>
      ) : null}
      {emptyError ? (
        <p className="rounded-lg bg-coverage-over/10 px-3 py-2 text-sm text-coverage-over">
          Add at least one photo or a title.
        </p>
      ) : null}

      {/* Native camera/file picker — works without HTTPS (no getUserMedia). */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-white py-10 text-neutral-500">
        <Camera className="h-8 w-8" />
        <span className="text-sm font-medium">Take or choose photos</span>
        <input
          ref={fileRef}
          type="file"
          name="photos"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onFiles}
          className="sr-only"
        />
      </label>

      {previews.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className="h-20 w-20 rounded-lg object-cover"
            />
          ))}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Title (optional)</span>
        <input
          name="title"
          placeholder="e.g. Living room TV"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Location (optional)</span>
        <select name="locationId" defaultValue="" className={inputClass}>
          <option value="">— Unassigned —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2 flex flex-col gap-2">
        <SubmitButton
          intent="another"
          className="bg-neutral-900 text-white"
          label="Save & add another"
        />
        <SubmitButton
          intent="details"
          className="border border-neutral-300 text-neutral-800"
          label="Save & finish details"
        />
      </div>
    </form>
  );
}

function SubmitButton({
  intent,
  label,
  className,
}: {
  intent: string;
  label: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      disabled={pending}
      className={`rounded-lg px-4 py-2.5 text-base font-medium disabled:opacity-60 ${className}`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
