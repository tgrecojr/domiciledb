import { afterEach, describe, expect, it, vi } from "vitest";

import { buildManifest } from "@/lib/ai/manifest";
import { parseTaskResponse, TASKS } from "@/lib/ai/tasks";

describe("buildManifest", () => {
  it("reflects the literal prompt + model and that an image will be sent", () => {
    const m = buildManifest("identify", {
      model: "openai/gpt-4o",
      hasImage: true,
    });
    expect(m.model).toBe("openai/gpt-4o");
    expect(m.prompt).toBe(TASKS.identify.prompt);
    expect(m.sendsImage).toBe(true);
    expect(m.imageNote).toBeTruthy();
  });

  it("does not claim to send an image when there is none", () => {
    const m = buildManifest("identify", { model: "x", hasImage: false });
    expect(m.sendsImage).toBe(false);
    expect(m.imageNote).toBeNull();
  });
});

describe("parseTaskResponse", () => {
  it("parses a clean JSON object", () => {
    const r = parseTaskResponse(
      "identify",
      '{"manufacturer":"Sony","model":null,"category":"Electronics"}',
    );
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      manufacturer: "Sony",
      model: null,
      category: "Electronics",
    });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const r = parseTaskResponse(
      "describe",
      'Sure! {"description":"A blue mug."} Hope that helps.',
    );
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ description: "A blue mug." });
  });

  it("accepts a partial/empty object (all fields nullable)", () => {
    const r = parseTaskResponse("identify", "{}");
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      manufacturer: null,
      model: null,
      category: null,
    });
  });

  it("rejects non-JSON and malformed JSON", () => {
    expect(parseTaskResponse("identify", "no json here").ok).toBe(false);
    expect(parseTaskResponse("identify", "{not valid}").ok).toBe(false);
  });

  it("rejects a value of the wrong type", () => {
    // manufacturer must be a string|null, not a number.
    expect(parseTaskResponse("identify", '{"manufacturer":123}').ok).toBe(
      false,
    );
  });

  it("dec-page parse keeps Coverage B and strips any fabricated sub-limits", () => {
    // The model must not invent per-category sub-limits; the schema drops them.
    const r = parseTaskResponse(
      "parse_decpage",
      '{"coverageBUsd":456750,"jewelryLimitUsd":1500,"firearmsLimitUsd":2500}',
    );
    expect(r.ok).toBe(true);
    const data = r.data as Record<string, unknown>;
    expect(data.coverageBUsd).toBe(456750);
    expect("jewelryLimitUsd" in data).toBe(false);
    expect("firearmsLimitUsd" in data).toBe(false);
  });
});

describe("config.ai gating (opt-in)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is disabled when no API key is set, enabled when present", async () => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { config: disabled } = await import("@/lib/config");
    expect(disabled.ai.enabled).toBe(false);

    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "sk-test-123");
    const { config: enabled } = await import("@/lib/config");
    expect(enabled.ai.enabled).toBe(true);
  });
});
