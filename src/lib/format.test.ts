import { describe, expect, it } from "vitest";
import { formatCost, formatMinutes, formatRelativeDate, plural } from "./format";

describe("format", () => {
  it("formats minutes", () => {
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
  });

  it("formats relative dates", () => {
    const now = new Date(2026, 8, 3);
    expect(formatRelativeDate("2026-09-03", now)).toBe("today");
    expect(formatRelativeDate("2026-09-02", now)).toBe("yesterday");
    expect(formatRelativeDate("2026-08-30", now)).toBe("4 days ago");
    expect(formatRelativeDate("2026-08-10", now)).toBe("3 weeks ago");
    expect(formatRelativeDate("2026-05-01", now)).toBe("4 months ago");
    expect(formatRelativeDate("2024-05-01", now)).toBe("2 years ago");
  });

  it("formats cost and plurals", () => {
    expect(formatCost(null)).toBeNull();
    expect(formatCost(3)).toBe("$$$");
    expect(plural(1, "ingredient")).toBe("1 ingredient");
    expect(plural(4, "ingredient")).toBe("4 ingredients");
  });
});
