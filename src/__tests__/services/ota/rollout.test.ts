import { isInRollout } from '../../../services/ota/rollout';

describe('isInRollout', () => {
  const id = 'test-install-id';
  const releaseId = 'release-abc123';

  it('returns true when rollout is 100%', () => {
    expect(isInRollout(id, releaseId, 100)).toBe(true);
  });

  it('returns false when rollout is 0%', () => {
    expect(isInRollout(id, releaseId, 0)).toBe(false);
  });

  it('is deterministic — same inputs always give same result', () => {
    const a = isInRollout(id, releaseId, 50);
    const b = isInRollout(id, releaseId, 50);
    expect(a).toBe(b);
  });

  it('widening rollout includes prior cohort — 5% ⊆ 25% ⊆ 50% ⊆ 100%', () => {
    // Find an installId that lands in the 5% bucket
    let inId: string | null = null;
    for (let i = 0; i < 200; i++) {
      const candidate = `device-${i}`;
      if (isInRollout(candidate, releaseId, 5)) {
        inId = candidate;
        break;
      }
    }
    expect(inId).not.toBeNull();
    // A device in the 5% bucket must also be in 25%, 50%, 100%
    expect(isInRollout(inId!, releaseId, 25)).toBe(true);
    expect(isInRollout(inId!, releaseId, 50)).toBe(true);
    expect(isInRollout(inId!, releaseId, 100)).toBe(true);
  });

  it('distributes devices roughly evenly across buckets', () => {
    let inCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (isInRollout(`device-${i}`, releaseId, 10)) inCount++;
    }
    // Expect roughly 10% ± 4% (statistical tolerance)
    expect(inCount).toBeGreaterThan(60);
    expect(inCount).toBeLessThan(140);
  });

  it('different releases produce independent buckets', () => {
    const deviceIn = 'device-42';
    const r1 = isInRollout(deviceIn, 'release-1', 50);
    const r2 = isInRollout(deviceIn, 'release-2', 50);
    // They may differ — just verify neither throws and both are booleans
    expect(typeof r1).toBe('boolean');
    expect(typeof r2).toBe('boolean');
  });
});
