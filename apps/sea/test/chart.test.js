import { describe, expect, test } from "vitest";
import { CHART, cellAt, compassLabel } from "../src/game/chart.js";

describe("chart", () => {
  test("names the north-west corner A1 and the south-east corner H8", () => {
    expect(cellAt(-CHART.half + 1, -CHART.half + 1).label).toBe("A1");
    expect(cellAt(CHART.half - 1, CHART.half - 1).label).toBe("H8");
  });

  test("returns nothing outside the chart", () => {
    expect(cellAt(CHART.half + 5, 0)).toBeNull();
    expect(cellAt(0, -CHART.half - 5)).toBeNull();
  });

  test("formats headings as a compass point and three digits", () => {
    expect(compassLabel(0)).toBe("N 000");
    expect(compassLabel(92)).toBe("E 092");
    expect(compassLabel(-45)).toBe("NW 315");
    expect(compassLabel(359.7)).toBe("N 000");
  });
});
