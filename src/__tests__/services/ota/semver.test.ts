import { compareSemver, isVersionInRange } from "../../../services/ota/semver";

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("detects major difference", () => {
    expect(compareSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
  });

  it("detects minor difference", () => {
    expect(compareSemver("1.3.0", "1.2.9")).toBeGreaterThan(0);
    expect(compareSemver("1.2.0", "1.3.0")).toBeLessThan(0);
  });

  it("detects patch difference", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("handles v-prefix", () => {
    expect(compareSemver("v1.2.3", "1.2.3")).toBe(0);
  });

  it("handles missing patch segment", () => {
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
    expect(compareSemver("1.3", "1.2.9")).toBeGreaterThan(0);
  });
});

describe("isVersionInRange", () => {
  it("returns true when both bounds are null", () => {
    expect(isVersionInRange("1.0.0", null, null)).toBe(true);
  });

  it("respects min bound (inclusive)", () => {
    expect(isVersionInRange("1.0.0", "1.0.0", null)).toBe(true);
    expect(isVersionInRange("0.9.9", "1.0.0", null)).toBe(false);
    expect(isVersionInRange("1.0.1", "1.0.0", null)).toBe(true);
  });

  it("respects max bound (inclusive)", () => {
    expect(isVersionInRange("2.0.0", null, "2.0.0")).toBe(true);
    expect(isVersionInRange("2.0.1", null, "2.0.0")).toBe(false);
    expect(isVersionInRange("1.9.9", null, "2.0.0")).toBe(true);
  });

  it("respects both bounds", () => {
    expect(isVersionInRange("1.5.0", "1.0.0", "2.0.0")).toBe(true);
    expect(isVersionInRange("0.9.0", "1.0.0", "2.0.0")).toBe(false);
    expect(isVersionInRange("2.1.0", "1.0.0", "2.0.0")).toBe(false);
  });

  it("handles exact match on both bounds", () => {
    expect(isVersionInRange("1.0.0", "1.0.0", "1.0.0")).toBe(true);
    expect(isVersionInRange("1.0.1", "1.0.0", "1.0.0")).toBe(false);
  });
});
