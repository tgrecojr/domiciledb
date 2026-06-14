import { describe, expect, it } from "vitest";

import {
  computeCoverage,
  crossedThreshold,
  type CoverageItemInput,
} from "@/lib/coverage";

const active = (
  replacementCostCents: number | null,
  quantity = 1,
): CoverageItemInput => ({
  replacementCostCents,
  quantity,
  lifecycleStatus: "active",
});

describe("computeCoverage", () => {
  it("sums replacement cost × quantity for active, valued items", () => {
    const r = computeCoverage({
      items: [active(100_00, 8), active(50_00)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    // 8 * $100 + $50 = $850
    expect(r.totalCents).toBe(850_00);
    expect(r.countedCount).toBe(2);
    expect(r.excludedCount).toBe(0);
  });

  it("excludes active items missing a replacement cost (counts them separately)", () => {
    const r = computeCoverage({
      items: [active(200_00), active(null), active(null)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    expect(r.totalCents).toBe(200_00);
    expect(r.countedCount).toBe(1);
    expect(r.excludedCount).toBe(2);
  });

  it("ignores non-active items entirely", () => {
    const r = computeCoverage({
      items: [
        active(100_00),
        { replacementCostCents: 999_00, quantity: 1, lifecycleStatus: "sold" },
        {
          replacementCostCents: 999_00,
          quantity: 1,
          lifecycleStatus: "disposed",
        },
      ],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    expect(r.totalCents).toBe(100_00);
    expect(r.countedCount).toBe(1);
    expect(r.excludedCount).toBe(0);
  });

  it("is 'within' below the warn threshold", () => {
    const r = computeCoverage({
      items: [active(799_99)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    expect(r.status).toBe("within");
  });

  it("is 'approaching' exactly at the 80% threshold (inclusive)", () => {
    const r = computeCoverage({
      items: [active(800_00)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    expect(r.pctUsed).toBeCloseTo(0.8, 10);
    expect(r.status).toBe("approaching");
  });

  it("is 'approaching' exactly at 100% (inclusive), not 'over'", () => {
    const r = computeCoverage({
      items: [active(1_000_00)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    expect(r.pctUsed).toBe(1);
    expect(r.status).toBe("approaching");
  });

  it("is 'over' above 100%", () => {
    const r = computeCoverage({
      items: [active(1_000_01)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    expect(r.status).toBe("over");
  });

  it("honors a non-default warn threshold", () => {
    const r = computeCoverage({
      items: [active(500_00)],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.5,
    });
    expect(r.status).toBe("approaching");
  });

  it("returns null status/pct when no policy limit is set", () => {
    const r = computeCoverage({
      items: [active(100_00)],
      coverageBLimitCents: null,
      warnPct: 0.8,
    });
    expect(r.status).toBeNull();
    expect(r.pctUsed).toBeNull();
    expect(r.totalCents).toBe(100_00);
  });

  it("treats a zero/negative limit as 'no limit' (null status)", () => {
    const r = computeCoverage({
      items: [active(100_00)],
      coverageBLimitCents: 0,
      warnPct: 0.8,
    });
    expect(r.status).toBeNull();
    expect(r.pctUsed).toBeNull();
  });

  it("treats a non-finite quantity as zero (defensive)", () => {
    const r = computeCoverage({
      items: [
        {
          replacementCostCents: 100_00,
          quantity: NaN,
          lifecycleStatus: "active",
        },
        { replacementCostCents: 50_00, quantity: 2, lifecycleStatus: "active" },
      ],
      coverageBLimitCents: 1_000_00,
      warnPct: 0.8,
    });
    // NaN-qty item contributes 0; only the 2 × $50 counts.
    expect(r.totalCents).toBe(100_00);
    expect(r.countedCount).toBe(2);
  });

  it("uses integer cents with no float drift on the real dec-page limit", () => {
    // Coverage B from declarations.md = $456,750.00
    const r = computeCoverage({
      items: [active(310_000_00)],
      coverageBLimitCents: 456_750_00,
      warnPct: 0.8,
    });
    expect(r.totalCents).toBe(310_000_00);
    expect(r.status).toBe("within");
  });
});

describe("crossedThreshold", () => {
  it("fires when escalating up to a new level", () => {
    expect(crossedThreshold("within", "approaching")).toBe("approaching");
    expect(crossedThreshold("within", "over")).toBe("over");
    expect(crossedThreshold("approaching", "over")).toBe("over");
  });

  it("fires from a fresh policy/no-prior-status into a risky level", () => {
    expect(crossedThreshold(null, "approaching")).toBe("approaching");
    expect(crossedThreshold(null, "over")).toBe("over");
  });

  it("does not fire when staying at the same level", () => {
    expect(crossedThreshold("approaching", "approaching")).toBeNull();
    expect(crossedThreshold("over", "over")).toBeNull();
  });

  it("does not fire on de-escalation or back to within", () => {
    expect(crossedThreshold("over", "approaching")).toBeNull();
    expect(crossedThreshold("approaching", "within")).toBeNull();
  });

  it("never fires without a policy limit (after is null)", () => {
    expect(crossedThreshold(null, null)).toBeNull();
    expect(crossedThreshold("within", null)).toBeNull();
  });
});
