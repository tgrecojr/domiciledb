import { TASKS, type AiTaskKey } from "./tasks";

/**
 * Cap on how many of an item's photos are sent in one AI call. Sending all of
 * them lets the model find the legible plate/serial close-up among wider shots;
 * the cap bounds token cost and latency for items with many photos. Lives here
 * (client-safe) so both the server action and the consent UI share one value.
 */
export const AI_MAX_PHOTOS = 6;

/**
 * The transparency manifest: exactly what will be transmitted to the remote AI,
 * shown to the user BEFORE anything is sent (feature-spec §6 trust model). Pure
 * + client-safe so the consent UI and tests share one source of truth.
 */
export interface AiManifest {
  taskKey: AiTaskKey;
  label: string;
  blurb: string;
  model: string;
  prompt: string;
  sendsImage: boolean;
  imageNote: string | null;
}

export function buildManifest(
  taskKey: AiTaskKey,
  opts: { model: string; hasImage: boolean; imageNote?: string | null },
): AiManifest {
  const task = TASKS[taskKey];
  return {
    taskKey,
    label: task.label,
    blurb: task.blurb,
    model: opts.model,
    prompt: task.prompt,
    sendsImage: task.needsPhoto && opts.hasImage,
    imageNote:
      task.needsPhoto && opts.hasImage ? (opts.imageNote ?? "1 photo") : null,
  };
}
