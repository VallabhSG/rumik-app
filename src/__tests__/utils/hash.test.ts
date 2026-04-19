import { djb2 } from "../../utils/hash";

describe("djb2", () => {
  it("returns a non-negative integer", () => {
    expect(djb2("hello")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(djb2("hello"))).toBe(true);
  });

  it("is deterministic — same input always same output", () => {
    expect(djb2("abc123")).toBe(djb2("abc123"));
  });

  it("produces different values for different inputs", () => {
    expect(djb2("install-a:release-1")).not.toBe(djb2("install-b:release-1"));
    expect(djb2("install-a:release-1")).not.toBe(djb2("install-a:release-2"));
  });

  it("handles empty string", () => {
    expect(djb2("")).toBe(5381);
  });

  it("distributes bucket values across 0-99 reasonably", () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 200; i++) {
      buckets.add(djb2(`device-${i}:flag-x`) % 100);
    }
    // With 200 devices we should hit at least 70 distinct buckets
    expect(buckets.size).toBeGreaterThan(70);
  });

  it("percentage gate is stable: same device+key always same bucket", () => {
    const installId = "stable-device-id-xyz";
    const entityKey = "my_feature_flag";
    const b1 = djb2(installId + entityKey) % 100;
    const b2 = djb2(installId + entityKey) % 100;
    expect(b1).toBe(b2);
  });
});
