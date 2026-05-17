import { evaluateTargeting, parseTargeting } from '../../services/targeting.js';
import type { DeviceContext, TargetingRule } from '../../services/targeting.js';

const baseCtx: DeviceContext = {
  platform: 'ios',
  nativeVersion: '1.5.0',
  installId: 'device-abc',
  entityKey: 'test_flag',
};

describe('evaluateTargeting', () => {
  it('returns true when rule is null', () => {
    expect(evaluateTargeting(null, baseCtx)).toBe(true);
  });

  it('returns true when rule is empty object', () => {
    expect(evaluateTargeting({}, baseCtx)).toBe(true);
  });

  describe('platforms', () => {
    it('matches when platform is in list', () => {
      const rule: TargetingRule = { platforms: ['ios', 'android'] };
      expect(evaluateTargeting(rule, baseCtx)).toBe(true);
    });

    it('rejects when platform not in list', () => {
      const rule: TargetingRule = { platforms: ['android'] };
      expect(evaluateTargeting(rule, baseCtx)).toBe(false);
    });

    it('matches web platform', () => {
      const rule: TargetingRule = { platforms: ['web'] };
      expect(evaluateTargeting(rule, { ...baseCtx, platform: 'web' })).toBe(true);
    });
  });

  describe('version range', () => {
    it('matches when version is above min', () => {
      const rule: TargetingRule = { min_version: '1.0.0' };
      expect(evaluateTargeting(rule, baseCtx)).toBe(true);
    });

    it('rejects when version is below min', () => {
      const rule: TargetingRule = { min_version: '2.0.0' };
      expect(evaluateTargeting(rule, baseCtx)).toBe(false);
    });

    it('matches when version is below max', () => {
      const rule: TargetingRule = { max_version: '2.0.0' };
      expect(evaluateTargeting(rule, baseCtx)).toBe(true);
    });

    it('rejects when version is above max', () => {
      const rule: TargetingRule = { max_version: '1.0.0' };
      expect(evaluateTargeting(rule, baseCtx)).toBe(false);
    });

    it('matches exact version on both bounds', () => {
      const rule: TargetingRule = { min_version: '1.5.0', max_version: '1.5.0' };
      expect(evaluateTargeting(rule, baseCtx)).toBe(true);
    });

    it('rejects version outside both bounds', () => {
      const rule: TargetingRule = { min_version: '1.0.0', max_version: '1.4.9' };
      expect(evaluateTargeting(rule, baseCtx)).toBe(false);
    });
  });

  describe('percentage', () => {
    it('returns false when percentage is 0', () => {
      const rule: TargetingRule = { percentage: 0 };
      expect(evaluateTargeting(rule, baseCtx)).toBe(false);
    });

    it('returns true when percentage is 100', () => {
      const rule: TargetingRule = { percentage: 100 };
      expect(evaluateTargeting(rule, baseCtx)).toBe(true);
    });

    it('is stable — same device+key always gets same result', () => {
      const rule: TargetingRule = { percentage: 50 };
      const ctx = { ...baseCtx };
      const r1 = evaluateTargeting(rule, ctx);
      const r2 = evaluateTargeting(rule, ctx);
      expect(r1).toBe(r2);
    });

    it('produces consistent inclusion across 100% rollout', () => {
      const rule: TargetingRule = { percentage: 100 };
      for (let i = 0; i < 20; i++) {
        expect(evaluateTargeting(rule, { ...baseCtx, installId: `device-${i}` })).toBe(true);
      }
    });

    it('excludes ~half of devices at 50%', () => {
      const rule: TargetingRule = { percentage: 50 };
      let included = 0;
      for (let i = 0; i < 200; i++) {
        if (evaluateTargeting(rule, { ...baseCtx, installId: `device-${i}`, entityKey: 'stable_key' })) {
          included++;
        }
      }
      // Expect roughly 100 ± 30 devices included
      expect(included).toBeGreaterThan(70);
      expect(included).toBeLessThan(130);
    });
  });

  describe('combined rules (AND semantics)', () => {
    it('passes all criteria', () => {
      const rule: TargetingRule = {
        platforms: ['ios'],
        min_version: '1.0.0',
        max_version: '2.0.0',
        percentage: 100,
      };
      expect(evaluateTargeting(rule, baseCtx)).toBe(true);
    });

    it('fails if one criterion fails', () => {
      const rule: TargetingRule = {
        platforms: ['ios'],
        min_version: '2.0.0',  // version too high
      };
      expect(evaluateTargeting(rule, baseCtx)).toBe(false);
    });
  });
});

describe('parseTargeting', () => {
  it('returns null for null input', () => {
    expect(parseTargeting(null)).toBeNull();
  });

  it('parses valid JSON', () => {
    const rule: TargetingRule = { platforms: ['ios'], percentage: 50 };
    expect(parseTargeting(JSON.stringify(rule))).toEqual(rule);
  });

  it('returns null for invalid JSON', () => {
    expect(parseTargeting('not-json')).toBeNull();
  });
});
