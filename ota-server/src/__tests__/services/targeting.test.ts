import { evaluateTargeting, evaluateAttributeRule, parseTargeting } from '../../services/targeting.js';
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
        min_version: '2.0.0', // version too high
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

// ---------------------------------------------------------------------------
// New tests: user identity targeting
// ---------------------------------------------------------------------------

const baseDevice: DeviceContext = {
  platform: 'ios',
  nativeVersion: '1.0.0',
  installId: 'dev1',
  entityKey: 'flag1',
};

describe('user_ids targeting', () => {
  it('matches when userId is in user_ids list', () => {
    expect(evaluateTargeting({ user_ids: ['user_abc'] }, baseDevice, { userId: 'user_abc' })).toBe(true);
  });

  it('rejects when userId not in list', () => {
    expect(evaluateTargeting({ user_ids: ['user_abc'] }, baseDevice, { userId: 'user_xyz' })).toBe(false);
  });

  it('rejects when no userCtx provided', () => {
    expect(evaluateTargeting({ user_ids: ['user_abc'] }, baseDevice)).toBe(false);
  });

  it('rejects when userCtx has no userId', () => {
    expect(evaluateTargeting({ user_ids: ['user_abc'] }, baseDevice, {})).toBe(false);
  });

  it('matches one of multiple user_ids', () => {
    expect(
      evaluateTargeting({ user_ids: ['user_a', 'user_b', 'user_c'] }, baseDevice, { userId: 'user_b' }),
    ).toBe(true);
  });
});

describe('evaluateAttributeRule', () => {
  it('eq: matches plan === premium', () => {
    expect(
      evaluateAttributeRule({ attribute: 'plan', operator: 'eq', value: 'premium' }, { plan: 'premium' }),
    ).toBe(true);
  });

  it('eq: rejects plan !== premium', () => {
    expect(
      evaluateAttributeRule({ attribute: 'plan', operator: 'eq', value: 'premium' }, { plan: 'free' }),
    ).toBe(false);
  });

  it('neq: matches plan !== premium', () => {
    expect(
      evaluateAttributeRule({ attribute: 'plan', operator: 'neq', value: 'premium' }, { plan: 'free' }),
    ).toBe(true);
  });

  it('neq: rejects when plan equals value', () => {
    expect(
      evaluateAttributeRule({ attribute: 'plan', operator: 'neq', value: 'premium' }, { plan: 'premium' }),
    ).toBe(false);
  });

  it('gt: account_age_days > 30 passes when age is 45', () => {
    expect(
      evaluateAttributeRule({ attribute: 'account_age_days', operator: 'gt', value: 30 }, { account_age_days: 45 }),
    ).toBe(true);
  });

  it('gt: account_age_days > 30 fails when age is 5', () => {
    expect(
      evaluateAttributeRule({ attribute: 'account_age_days', operator: 'gt', value: 30 }, { account_age_days: 5 }),
    ).toBe(false);
  });

  it('lt: account_age_days < 7 passes when age is 3', () => {
    expect(
      evaluateAttributeRule({ attribute: 'account_age_days', operator: 'lt', value: 7 }, { account_age_days: 3 }),
    ).toBe(true);
  });

  it('lt: account_age_days < 7 fails when age is 10', () => {
    expect(
      evaluateAttributeRule({ attribute: 'account_age_days', operator: 'lt', value: 7 }, { account_age_days: 10 }),
    ).toBe(false);
  });

  it('contains: email_domain contains rumik', () => {
    expect(
      evaluateAttributeRule(
        { attribute: 'email_domain', operator: 'contains', value: 'rumik' },
        { email_domain: 'rumik.dev' },
      ),
    ).toBe(true);
  });

  it('contains: rejects when string not contained', () => {
    expect(
      evaluateAttributeRule(
        { attribute: 'email_domain', operator: 'contains', value: 'rumik' },
        { email_domain: 'gmail.com' },
      ),
    ).toBe(false);
  });

  it('in: plan in [free, trial] passes for trial', () => {
    expect(
      evaluateAttributeRule(
        { attribute: 'plan', operator: 'in', value: ['free', 'trial'] },
        { plan: 'trial' },
      ),
    ).toBe(true);
  });

  it('in: plan in [free, trial] fails for premium', () => {
    expect(
      evaluateAttributeRule(
        { attribute: 'plan', operator: 'in', value: ['free', 'trial'] },
        { plan: 'premium' },
      ),
    ).toBe(false);
  });

  it('returns false when attribute is undefined on user', () => {
    expect(
      evaluateAttributeRule({ attribute: 'plan', operator: 'eq', value: 'premium' }, {}),
    ).toBe(false);
  });
});

describe('user_attribute_rules in evaluateTargeting', () => {
  it('passes when all rules match', () => {
    const rule: TargetingRule = {
      user_attribute_rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
    };
    expect(evaluateTargeting(rule, baseDevice, { plan: 'premium' })).toBe(true);
  });

  it('fails when any rule fails', () => {
    const rule: TargetingRule = {
      user_attribute_rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
    };
    expect(evaluateTargeting(rule, baseDevice, { plan: 'free' })).toBe(false);
  });

  it('fails when no userCtx provided', () => {
    const rule: TargetingRule = {
      user_attribute_rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
    };
    expect(evaluateTargeting(rule, baseDevice)).toBe(false);
  });

  it('AND semantics: all rules must pass', () => {
    const rule: TargetingRule = {
      user_attribute_rules: [
        { attribute: 'plan', operator: 'eq', value: 'premium' },
        { attribute: 'account_age_days', operator: 'gt', value: 30 },
      ],
    };
    expect(evaluateTargeting(rule, baseDevice, { plan: 'premium', account_age_days: 60 })).toBe(true);
    expect(evaluateTargeting(rule, baseDevice, { plan: 'premium', account_age_days: 10 })).toBe(false);
  });

  it('combines platform + user_attribute_rules with AND semantics', () => {
    const rule: TargetingRule = {
      platforms: ['ios'],
      user_attribute_rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
    };
    expect(evaluateTargeting(rule, baseDevice, { plan: 'premium' })).toBe(true);
    expect(
      evaluateTargeting(rule, { ...baseDevice, platform: 'android' }, { plan: 'premium' }),
    ).toBe(false);
  });
});
