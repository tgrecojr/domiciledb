"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  aiSuggestForItem,
  applyItemSuggestion,
  type AiSuggestResult,
} from "@/lib/actions/ai";
import { AI_MAX_PHOTOS, buildManifest } from "@/lib/ai/manifest";
import { TASKS, type AiTaskKey } from "@/lib/ai/tasks";

const ITEM_TASKS: AiTaskKey[] = [
  "identify",
  "ocr_plate",
  "describe",
  "suggest_cost",
];

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

type ReviewField = { name: string; label: string; value: string };

function reviewFields(
  taskKey: AiTaskKey,
  s: Record<string, unknown>,
): ReviewField[] {
  const str = (v: unknown) => (v == null ? "" : String(v));
  switch (taskKey) {
    case "identify":
      return [
        {
          name: "manufacturer",
          label: "Manufacturer",
          value: str(s.manufacturer),
        },
        { name: "modelNumber", label: "Model", value: str(s.model) },
        { name: "categoryName", label: "Category", value: str(s.category) },
      ];
    case "ocr_plate":
      return [
        {
          name: "serialNumber",
          label: "Serial number",
          value: str(s.serialNumber),
        },
        {
          name: "modelNumber",
          label: "Model number",
          value: str(s.modelNumber),
        },
      ];
    case "describe":
      return [
        {
          name: "description",
          label: "Description",
          value: str(s.description),
        },
      ];
    case "suggest_cost":
      return [
        {
          name: "replacementCost",
          label: "Replacement cost ($)",
          value: str(s.replacementCostUsd),
        },
      ];
    default:
      return [];
  }
}

type Phase =
  | { step: "idle" }
  | { step: "consent"; task: AiTaskKey }
  | { step: "loading"; task: AiTaskKey }
  | { step: "review"; task: AiTaskKey; result: AiSuggestResult }
  | { step: "error"; message: string };

export function AiAssist({
  itemId,
  photoCount,
  model,
}: {
  itemId: number;
  photoCount: number;
  model: string;
}) {
  const hasPhoto = photoCount > 0;
  const photosSent = Math.min(photoCount, AI_MAX_PHOTOS);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function send(task: AiTaskKey) {
    setPhase({ step: "loading", task });
    const result = await aiSuggestForItem(itemId, task, null);
    if (!result.ok || !result.suggestion) {
      setPhase({
        step: "error",
        message: result.error ?? "AI request failed.",
      });
      return;
    }
    const fields = reviewFields(task, result.suggestion);
    setValues(Object.fromEntries(fields.map((f) => [f.name, f.value])));
    setPhase({ step: "review", task, result });
  }

  function apply(interactionId: number | null) {
    startTransition(async () => {
      const res = await applyItemSuggestion(itemId, interactionId, values);
      if (res.ok) {
        setPhase({ step: "idle" });
        router.refresh();
      } else {
        setPhase({ step: "error", message: res.error ?? "Could not apply." });
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-violet-600" />
        AI assist
      </div>
      <p className="text-xs text-neutral-500">
        Optional. Each action sends data to a remote AI ({model}); you confirm
        before anything is sent and review every result before it&apos;s saved.
      </p>

      {phase.step === "idle" || phase.step === "error" ? (
        <>
          {phase.step === "error" ? (
            <p className="text-coverage-over text-sm">{phase.message}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {ITEM_TASKS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPhase({ step: "consent", task: key })}
                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm text-violet-700"
              >
                {TASKS[key].label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {phase.step === "consent"
        ? (() => {
            const m = buildManifest(phase.task, { model, hasImage: hasPhoto });
            return (
              <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-white p-3">
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-neutral-600">{m.blurb}</p>
                <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-600">
                  <p className="font-medium">Will be sent to {m.model}:</p>
                  <p className="mt-1">
                    {m.sendsImage
                      ? `• ${photosSent === 1 ? "This item's photo" : `All ${photosSent} of this item's photos`} (each resized to ≤1024px)`
                      : "• No image"}
                  </p>
                  <p className="mt-1">• Prompt: “{m.prompt}”</p>
                </div>
                {m.sendsImage && !hasPhoto ? (
                  <p className="text-coverage-over text-xs">
                    This item has no photo to send.
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={m.sendsImage && !hasPhoto}
                    onClick={() => send(phase.task)}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Send to AI
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase({ step: "idle" })}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()
        : null}

      {phase.step === "loading" ? (
        <p className="text-sm text-neutral-500">Asking the AI…</p>
      ) : null}

      {phase.step === "review" && phase.result.suggestion ? (
        <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-white p-3">
          <p className="text-sm font-medium">Review the AI suggestion</p>
          <p className="text-xs text-neutral-500">
            Edit anything before applying. Nothing is saved until you click
            Apply.
          </p>
          {reviewFields(phase.task, phase.result.suggestion).map((f) => (
            <label key={f.name} className="flex flex-col gap-1">
              <span className="text-xs font-medium">{f.label}</span>
              <input
                name={f.name}
                value={values[f.name] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.name]: e.target.value }))
                }
                className={inputClass}
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => apply(phase.result.interactionId ?? null)}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Applying…" : "Apply to item"}
            </button>
            <button
              type="button"
              onClick={() => setPhase({ step: "idle" })}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
