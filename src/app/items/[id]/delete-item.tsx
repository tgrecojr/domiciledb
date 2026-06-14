"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { deleteItemAction } from "@/lib/actions/items";

export function DeleteItem({ itemId }: { itemId: number }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="border-coverage-over/40 text-coverage-over flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium"
      >
        <Trash2 className="h-4 w-4" />
        Delete item
      </button>
    );
  }

  return (
    <div className="border-coverage-over/40 bg-coverage-over/5 flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-coverage-over text-sm">
        Permanently delete this item, including its photos and documents? This
        can&apos;t be undone.
      </p>
      <div className="flex gap-2">
        <form action={deleteItemAction}>
          <input type="hidden" name="itemId" value={itemId} />
          <button
            type="submit"
            className="bg-coverage-over rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          >
            Yes, delete
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
