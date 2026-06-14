import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { aiInteraction, AI_OUTCOMES } from "@/db/schema";

export type AiOutcome = (typeof AI_OUTCOMES)[number];

/** Record an AI call for the transparency audit trail (feature-spec §6). */
export function logInteraction(input: {
  itemId: number | null;
  action: string;
  model: string;
  promptText: string;
  imageRefs?: string[];
  requestSummary?: unknown;
  response?: unknown;
}): number {
  const rows = db
    .insert(aiInteraction)
    .values({
      itemId: input.itemId,
      action: input.action,
      model: input.model,
      promptText: input.promptText,
      imageRefs: input.imageRefs ?? null,
      requestSummary: input.requestSummary ?? null,
      response: input.response ?? null,
    })
    .returning()
    .all();
  return rows[0]!.id;
}

/** Mark whether the user accepted, edited, or rejected the suggestion. */
export function setOutcome(id: number, outcome: AiOutcome) {
  db.update(aiInteraction)
    .set({ outcome })
    .where(eq(aiInteraction.id, id))
    .run();
}
