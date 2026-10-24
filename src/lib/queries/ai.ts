import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { type AI_OUTCOMES, aiInteraction } from "@/db/schema";

export type AiOutcome = (typeof AI_OUTCOMES)[number];

/** Record an AI call for the transparency audit trail (feature-spec §6). */
// @spec ENRICH-AI-009
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

/**
 * The interaction's identity, so apply/discard can verify a suggestion was
 * logged for the item (or, for a dec-page parse, for no item) before recording
 * an outcome against it.
 */
// @spec ENRICH-AI-018
export function getInteraction(
	id: number,
): { id: number; itemId: number | null } | null {
	return (
		db
			.select({ id: aiInteraction.id, itemId: aiInteraction.itemId })
			.from(aiInteraction)
			.where(eq(aiInteraction.id, id))
			.get() ?? null
	);
}

/** Mark whether the user accepted, edited, or rejected the suggestion. */
// @spec ENRICH-AI-012, ENRICH-AI-013
export function setOutcome(id: number, outcome: AiOutcome) {
	db.update(aiInteraction)
		.set({ outcome })
		.where(eq(aiInteraction.id, id))
		.run();
}
