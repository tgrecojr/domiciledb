"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { aiParseDecPageAction, type AiSuggestResult } from "@/lib/actions/ai";
import { applyDecPagePolicy, type DecPageFields } from "@/lib/actions/policy";
import { TASKS } from "@/lib/ai/tasks";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base " +
  "outline-hidden focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

type Phase =
  | { step: "idle" }
  | { step: "consent" }
  | { step: "loading" }
  | { step: "review"; result: AiSuggestResult }
  | { step: "error"; message: string };

const FIELDS: { name: keyof DecPageFields; label: string; from: string }[] = [
  {
    name: "coverageB",
    label: "Coverage B — Personal Property",
    from: "coverageBUsd",
  },
  { name: "coverageA", label: "Coverage A — Dwelling", from: "coverageAUsd" },
  {
    name: "coverageC",
    label: "Coverage C — Loss of Use",
    from: "coverageCUsd",
  },
  { name: "deductible", label: "Deductible", from: "deductibleUsd" },
  { name: "insurer", label: "Insurer", from: "insurer" },
  { name: "policyNumber", label: "Policy number", from: "policyNumber" },
];

export function DecPageParse({ model }: { model: string }) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<DecPageFields>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function send() {
    if (!file) {
      setPhase({ step: "error", message: "Choose a declarations-page image." });
      return;
    }
    setPhase({ step: "loading" });
    const fd = new FormData();
    fd.append("decpage", file);
    const result = await aiParseDecPageAction(fd);
    if (!result.ok || !result.suggestion) {
      setPhase({
        step: "error",
        message: result.error ?? "AI request failed.",
      });
      return;
    }
    const s = result.suggestion;
    const init: DecPageFields = {};
    for (const f of FIELDS) {
      const v = s[f.from];
      init[f.name] = v == null ? "" : String(v);
    }
    setValues(init);
    setPhase({ step: "review", result });
  }

  function apply() {
    startTransition(async () => {
      const res = await applyDecPagePolicy(values);
      if (res.ok) {
        setPhase({ step: "idle" });
        setFile(null);
        router.refresh();
      } else {
        setPhase({ step: "error", message: "Could not save coverage." });
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-violet-600" />
        Pre-fill from your declarations page (AI)
      </div>
      <p className="text-xs text-neutral-500">
        Optional. Upload a photo or screenshot of your dec page; you confirm
        before it&apos;s sent to {model} and review the result before saving.
      </p>

      {phase.step === "idle" || phase.step === "error" ? (
        <>
          {phase.step === "error" ? (
            <p className="text-coverage-over text-sm">{phase.message}</p>
          ) : null}
          <input
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) setPhase({ step: "consent" });
            }}
          />
        </>
      ) : null}

      {phase.step === "consent" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-white p-3">
          <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-600">
            <p className="font-medium">Will be sent to {model}:</p>
            <p className="mt-1">• Your declarations-page image (resized)</p>
            <p className="mt-1">• Prompt: “{TASKS.parse_decpage.prompt}”</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
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
      ) : null}

      {phase.step === "loading" ? (
        <p className="text-sm text-neutral-500">Reading your dec page…</p>
      ) : null}

      {phase.step === "review" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-white p-3">
          <p className="text-sm font-medium">Review extracted coverages</p>
          <p className="text-xs text-neutral-500">
            Verify against your policy. Nothing is saved until you click Apply.
            Per-category sub-limits aren&apos;t on the dec page and aren&apos;t
            extracted.
          </p>
          {FIELDS.map((f) => (
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
              onClick={apply}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Apply to coverage"}
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
