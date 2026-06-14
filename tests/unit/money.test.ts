import { describe, expect, it } from "vitest";

import {
  formatCents,
  formatCentsWhole,
  parseDollarsToCents,
} from "@/lib/money";

describe("parseDollarsToCents", () => {
  it("parses plain and decorated dollar strings to cents", () => {
    expect(parseDollarsToCents("1234.56")).toBe(123456);
    expect(parseDollarsToCents("$1,234.56")).toBe(123456);
    expect(parseDollarsToCents("  $ 1,000 ")).toBe(100000);
    expect(parseDollarsToCents("0")).toBe(0);
    expect(parseDollarsToCents("12")).toBe(1200);
  });

  it("rounds to the nearest cent without float drift", () => {
    expect(parseDollarsToCents("1234.567")).toBe(123457);
    expect(parseDollarsToCents("0.1")).toBe(10);
    expect(parseDollarsToCents("19.99")).toBe(1999);
    // 456750.00 is the real dec-page Coverage B limit.
    expect(parseDollarsToCents("456,750")).toBe(45675000);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("   ")).toBeNull();
    expect(parseDollarsToCents(null)).toBeNull();
    expect(parseDollarsToCents(undefined)).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("12.3.4")).toBeNull();
    expect(parseDollarsToCents("1e5")).toBeNull();
  });

  it("rejects negative amounts", () => {
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("-$1,000")).toBeNull();
  });

  it("rejects a digit string so large it overflows to Infinity", () => {
    // Passes the digits-only regex but Number(...) -> Infinity (not finite).
    expect(parseDollarsToCents("9".repeat(400))).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats integer cents as USD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(45675000)).toBe("$456,750.00");
  });
});

describe("formatCentsWhole", () => {
  it("formats with no decimals, rounding", () => {
    expect(formatCentsWhole(123456)).toBe("$1,235");
    expect(formatCentsWhole(45675000)).toBe("$456,750");
  });
});
