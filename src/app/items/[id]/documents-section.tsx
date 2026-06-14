"use client";

import { Paperclip } from "lucide-react";
import { useFormStatus } from "react-dom";

import { addDocumentAction } from "@/lib/actions/documents";
import { DOCUMENT_KIND_LABELS } from "@/lib/document-kinds";

const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Attach"}
    </button>
  );
}

export function AddDocument({ itemId }: { itemId: number }) {
  return (
    <form
      action={addDocumentAction}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Paperclip className="h-4 w-4 text-neutral-500" />
        Attach a receipt, warranty, or manual
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select name="kind" defaultValue="receipt" className={inputClass}>
          {Object.entries(DOCUMENT_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="file"
          name="document"
          accept="application/pdf,image/*"
          required
          className="text-sm"
        />
      </div>

      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Warranty expiry (warranties only)
        <input type="date" name="warrantyExpiresAt" className={inputClass} />
      </label>

      <SubmitButton />
    </form>
  );
}
