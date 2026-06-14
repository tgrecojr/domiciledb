import { describe, expect, it } from "vitest";

import { computeCoverage, type CoverageItemInput } from "@/lib/coverage";

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
