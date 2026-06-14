import "server-only";

import { config } from "@/lib/config";
import {
  parseTaskResponse,
  TASKS,
  type AiTaskKey,
  type ParseResult,
} from "./tasks";

/**
 * Calls OpenRouter (OpenAI-compatible chat completions) for a vision task and
 * validates the JSON response against the task schema. In fake mode (AI_FAKE=1,
 * tests only) it returns deterministic canned data without any network call.
 */

const FAKE_RESPONSES: Record<AiTaskKey, unknown> = {
  identify: { manufacturer: "Sony", model: "XR-65", category: "Electronics" },
  ocr_plate: { serialNumber: "SN-FAKE-12345", modelNumber: "XR-65A" },
  describe: {
    description: "A 65-inch flat-screen television in good condition.",
  },
  suggest_cost: {
    replacementCostUsd: 1499.99,
    rationale: "Based on comparable current models.",
  },
  parse_decpage: {
    coverageBUsd: 456750,
    coverageAUsd: 609000,
    coverageCUsd: 182700,
    deductibleUsd: 3045,
    insurer: "Sample Mutual",
    policyNumber: "78-B1-P441-5",
  },
};

export async function runTask(
  taskKey: AiTaskKey,
  input: { imageBase64Jpeg?: string },
): Promise<ParseResult<unknown>> {
  if (config.ai.fake) {
    const data = TASKS[taskKey] ? FAKE_RESPONSES[taskKey] : undefined;
    return { ok: true, data };
  }
  if (!config.ai.enabled) {
    return { ok: false, error: "AI is not configured." };
  }

  const content: unknown[] = [{ type: "text", text: TASKS[taskKey].prompt }];
  if (input.imageBase64Jpeg) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${input.imageBase64Jpeg}` },
    });
  }

  // OpenRouter usage-attribution headers (shown in OpenRouter's rankings /
  // analytics). X-OpenRouter-Title is the current header; it only creates an app
  // page when paired with HTTP-Referer, so the title is sent only when a referer
  // is configured.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.ai.apiKey}`,
    "Content-Type": "application/json",
  };
  if (config.ai.referer) {
    headers["HTTP-Referer"] = config.ai.referer;
    headers["X-OpenRouter-Title"] = config.ai.title;
  }

  let res: Response;
  try {
    res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.ai.model,
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    return { ok: false, error: "Could not reach the AI provider." };
  }

  if (!res.ok) {
    return { ok: false, error: `AI provider returned ${res.status}.` };
  }

  let body: { choices?: { message?: { content?: string } }[] };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "AI provider returned an unreadable response." };
  }

  const text = body.choices?.[0]?.message?.content ?? "";
  return parseTaskResponse(taskKey, text);
}
