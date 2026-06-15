import { z } from "zod";

/**
 * AI task registry: the literal prompt sent, the response schema, and metadata.
 * Client-safe (no server-only) so the consent UI can show exactly what will be
 * sent. Every field is optional/nullable so partial answers still parse — AI
 * output is only ever a suggestion the user confirms.
 */

export type AiTaskKey =
  | "identify"
  | "ocr_plate"
  | "describe"
  | "suggest_cost"
  | "parse_decpage";

const nullableStr = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

const nullableNum = z
  .number()
  .nonnegative()
  .nullish()
  .transform((v) => v ?? null);

export const TASK_SCHEMAS = {
  identify: z.object({
    manufacturer: nullableStr,
    model: nullableStr,
    category: nullableStr,
  }),
  ocr_plate: z.object({
    serialNumber: nullableStr,
    modelNumber: nullableStr,
  }),
  describe: z.object({
    description: nullableStr,
  }),
  suggest_cost: z.object({
    replacementCostUsd: nullableNum,
    rationale: nullableStr,
  }),
  parse_decpage: z.object({
    coverageBUsd: nullableNum,
    coverageAUsd: nullableNum,
    coverageCUsd: nullableNum,
    deductibleUsd: nullableNum,
    insurer: nullableStr,
    policyNumber: nullableStr,
  }),
} as const;

export interface AiTaskDef {
  key: AiTaskKey;
  label: string;
  /** One line shown in the consent dialog describing the action. */
  blurb: string;
  prompt: string;
  needsPhoto: boolean;
}

export const TASKS: Record<AiTaskKey, AiTaskDef> = {
  identify: {
    key: "identify",
    label: "Identify item",
    blurb: "Guess the manufacturer, model, and category from the photos.",
    needsPhoto: true,
    prompt:
      "You are identifying a household item from one or more photos of it for an insurance inventory. " +
      'Respond ONLY with JSON: {"manufacturer": string|null, "model": string|null, "category": string|null}. ' +
      "Use null for anything you cannot determine. Do not guess serial numbers.",
  },
  ocr_plate: {
    key: "ocr_plate",
    label: "Read serial / model plate",
    blurb: "Read the serial and model numbers from the item's photos.",
    needsPhoto: true,
    prompt:
      "These are one or more photos of the same item; one of them may be a close-up of its " +
      "product label/plate. Read the serial number and model number from whichever photo shows " +
      "them most clearly. " +
      'Respond ONLY with JSON: {"serialNumber": string|null, "modelNumber": string|null}. ' +
      "Transcribe characters exactly. Use null if a value is not clearly legible — never guess.",
  },
  describe: {
    key: "describe",
    label: "Draft description",
    blurb: "Write a short factual description of the item from the photo.",
    needsPhoto: true,
    prompt:
      "Write a concise, factual one-to-two sentence description of this household item for an " +
      'insurance inventory. Respond ONLY with JSON: {"description": string}.',
  },
  suggest_cost: {
    key: "suggest_cost",
    label: "Suggest replacement cost",
    blurb: "Estimate today's replacement cost (new) in USD from the photo.",
    needsPhoto: true,
    prompt:
      "Estimate the current cost to buy this item new today, in US dollars, for an insurance " +
      'inventory. Respond ONLY with JSON: {"replacementCostUsd": number|null, "rationale": string|null}. ' +
      "Use null if you cannot reasonably estimate. This is an estimate the user will verify.",
  },
  parse_decpage: {
    key: "parse_decpage",
    label: "Parse declarations page",
    blurb:
      "Extract the headline coverage limits (especially Coverage B) from a dec-page image.",
    needsPhoto: true,
    prompt:
      "This is a homeowners insurance declarations page. Extract the headline coverage limits in US dollars. " +
      'Respond ONLY with JSON: {"coverageBUsd": number|null, "coverageAUsd": number|null, ' +
      '"coverageCUsd": number|null, "deductibleUsd": number|null, "insurer": string|null, "policyNumber": string|null}. ' +
      "Coverage B is Personal Property. Use null for anything not present. " +
      "Do NOT infer per-category special sub-limits (jewelry, firearms, etc.) — they are not on the dec page.",
  },
};

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Extract the first JSON object from model text and validate it against the task schema. */
export function parseTaskResponse(
  taskKey: AiTaskKey,
  rawText: string,
): ParseResult<unknown> {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, error: "No JSON object found in the AI response." };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawText.slice(start, end + 1));
  } catch {
    return { ok: false, error: "The AI response was not valid JSON." };
  }
  const result = TASK_SCHEMAS[taskKey].safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      error: "The AI response did not match the expected shape.",
    };
  }
  return { ok: true, data: result.data };
}
