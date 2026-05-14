import { describe, expect, it, vi } from 'vitest';

import {
  checkRotationDue,
  createRotationFailureAlert,
  createRotationRecord,
  DB_CREDENTIAL_GRACE_PERIOD_HOURS,
  DB_CREDENTIAL_ROTATION_DAYS,
  DEFAULT_ALERT_CHANNELS,
  evaluateRotationSchedule,
  executeRotation,
  getDefaultSecretRotationConfig,
  isInGracePeriod,
  JWT_KEY_GRACE_PERIOD_HOURS,
  JWT_KEY_ROTATION_DAYS,
  SecretRotationConfigSchema,
  SecretRotationPolicySchema,
  type AlertDispatchFn,
  type RotationLogFn,
  type SecretGeneratorFn,
  type SecretRotationConfig,
  type SecretRotationPolicy,
  type SecretUpdateFn,
} from './secret-rotation';

// --- Helper factories ---

function createDbPolicy(overrides?: Partial<SecretRotationPolicy>): SecretRotationPolicy {
  return {
    id: 'policy-db-credentials',
    secretType: 'database_credentials',
    name: 'Database Credentials Rotation',
    rotationIntervalDays: DB_CREDENTIAL_ROTATION_DAYS,
    gracePeriodHours: DB_CREDENTIAL_GRACE_PERIOD_HOURS,
    enabled: true,
    ...overrides,
  };
}

function createJwtPolicy(overrides?: Partial<SecretRotationPolicy>): SecretRotationPolicy {
  return {
    id: 'policy-jwt-signing-key',
    secretType: 'jwt_signing_key',
    name: 'JWT Signing Key Rotation',
    rotationIntervalDays: JWT_KEY_ROTATION_DAYS,
    gracePeriodHours: JWT_KEY_GRACE_PERIOD_HOURS,
    enabled: true,
    ...overrides,
  };
}

function createMockLog(): RotationLogFn {
  return vi.fn();
}

function createMockGenerateSecret(): SecretGeneratorFn {
  return vi.fn().mockResolvedValue('new-secret-value-abc123');
}

function createMockUpdateSecret(): SecretUpdateFn {
  return vi.fn().mockResolvedValue(undefined);
}

function createMockDispatchAlert(): AlertDispatchFn {
  return vi.fn().mockResolvedValue(undefined);
}

// --- Tests ---

describe('secret-rotation', () => {
  describe('constants', () => {
    it('database credential rotation interval is 90 days', () => {
      expect(DB_CREDENTIAL_ROTATION_DAYS).toBe(90);
    });

    it('JWT key rotation interval is 30 days', () => {
      expect(JWT_KEY_ROTATION_DAYS).toBe(30);
    });

    it('JWT key grace period is 24 hours', () => {
      expect(JWT_KEY_GRACE_PERIOD_HOURS).toBe(24);
    });

    it('database credential grace period is 0 hours (immediate)', () => {
      expect(DB_CREDENTIAL_GRACE_PERIOD_HOURS).toBe(0);
    });

    it('default alert channels include at least 2 channels', () => {
      expect(DEFAULT_ALERT_CHANNELS.length).toBeGreaterThanOrEqual(2);
      expect(DEFAULT_ALERT_CHANNELS).toContain('email');
      expect(DEFAULT_ALERT_CHANNELS).toContain('telegram');
    });
  });

  describe('getDefaultSecretRotationConfig', () => {
    it('returns config with both database and JWT policies', () => {
      const config = getDefaultSecretRotationConfig();
      expect(config.policies).toHaveLength(2);
      expect(config.policies[0].secretType).toBe('database_credentials');
      expect(config.policies[1].secretType).toBe('jwt_signing_key');
    });

    it('database policy has 90-day interval and 0 grace period', () => {
      const config = getDefaultSecretRotationConfig();
      const dbPolicy = config.policies.find((p) => p.secretType === 'database_credentials');
      expect(dbPolicy?.rotationIntervalDays).toBe(90);
      expect(dbPolicy?.gracePeriodHours).toBe(0);
    });

    it('JWT policy has 30-day interval and 24-hour grace period', () => {
      const config = getDefaultSecretRotationConfig();
      const jwtPolicy = config.policies.find((p) => p.secretType === 'jwt_signing_key');
      expect(jwtPolicy?.rotationIntervalDays).toBe(30);
      expect(jwtPolicy?.gracePeriodHours).toBe(24);
    });

    it('applies overrides', () => {
      const config = getDefaultSecretRotationConfig({ enabled: true });
      expect(config.enabled).toBe(true);
    });

    it('has at least 2 alert channels', () => {
      const config = getDefaultSecretRotationConfig();
      expect(config.alertChannels.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('checkRotationDue', () => {
    it('returns isDue=true when never rotated', () => {
      const policy = createDbPolicy();
      const result = checkRotationDue(policy, undefined);
      expect(result.isDue).toBe(true);
      expect(result.daysUntilRotation).toBe(0);
    });

    it('returns isDue=false when rotated recently (within interval)', () => {
      const policy = createDbPolicy();
      const lastRotated = new Date();
      lastRotated.setDate(lastRotated.getDate() - 10); // 10 days ago
      const result = checkRotationDue(policy, lastRotated.toISOString());
      expect(result.isDue).toBe(false);
      expect(result.daysUntilRotation).toBeGreaterThan(0);
    });

    it('returns isDue=true when rotation interval has passed', () => {
      const policy = createDbPolicy();
      const lastRotated = new Date();
      lastRotated.setDate(lastRotated.getDate() - 91); // 91 days ago
      const result = checkRotationDue(policy, lastRotated.toISOString());
      expect(result.isDue).toBe(true);
      expect(result.daysUntilRotation).toBeLessThanOrEqual(0);
    });

    it('returns isDue=true for JWT key after 30 days', () => {
      const policy = createJwtPolicy();
      const lastRotated = new Date();
      lastRotated.setDate(lastRotated.getDate() - 31); // 31 days ago
      const result = checkRotationDue(policy, lastRotated.toISOString());
      expect(result.isDue).toBe(true);
    });

    it('returns inGracePeriod=false for database credentials (no grace period)', () => {
      const policy = createDbPolicy();
      const lastRotated = new Date().toISOString();
      const result = checkRotationDue(policy, lastRotated);
      expect(result.inGracePeriod).toBe(false);
    });

    it('returns inGracePeriod=true for JWT key within 24 hours of rotation', () => {
      const policy = createJwtPolicy();
      const lastRotated = new Date(); // just rotated
      const result = checkRotationDue(policy, lastRotated.toISOString(), new Date());
      expect(result.inGracePeriod).toBe(true);
      expect(result.gracePeriodExpiresAt).toBeDefined();
    });

    it('returns inGracePeriod=false for JWT key after 24 hours', () => {
      const policy = createJwtPolicy();
      const lastRotated = new Date();
      lastRotated.setHours(lastRotated.getHours() - 25); // 25 hours ago
      const result = checkRotationDue(policy, lastRotated.toISOString());
      expect(result.inGracePeriod).toBe(false);
    });
  });

  describe('isInGracePeriod', () => {
    it('returns true when within grace period', () => {
      const rotationTime = new Date();
      rotationTime.setHours(rotationTime.getHours() - 12); // 12 hours ago
      const result = isInGracePeriod(rotationTime.toISOString(), 24);
      expect(result).toBe(true);
    });

    it('returns false when grace period has expired', () => {
      const rotationTime = new Date();
      rotationTime.setHours(rotationTime.getHours() - 25); // 25 hours ago
      const result = isInGracePeriod(rotationTime.toISOString(), 24);
      expect(result).toBe(false);
    });

    it('returns true at exactly the grace period boundary', () => {
      const now = new Date();
      const rotationTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // exactly 24h ago
      const result = isInGracePeriod(rotationTime.toISOString(), 24, now);
      expect(result).toBe(true);
    });

    it('returns false with 0 grace period', () => {
      const rotationTime = new Date().toISOString();
      // With 0 grace period, the expiry is the same as rotation time
      const now = new Date(new Date(rotationTime).getTime() + 1); // 1ms after
      const result = isInGracePeriod(rotationTime, 0, now);
      expect(result).toBe(false);
    });
  });

  describe('createRotationRecord', () => {
    it('creates a record with pending status', () => {
      const record = createRotationRecord(
        'policy-db-credentials',
        'database_credentials',
        'scheduled',
        0
      );
      expect(record.status).toBe('pending');
      expect(record.policyId).toBe('policy-db-credentials');
      expect(record.secretType).toBe('database_credentials');
      expect(record.triggeredBy).toBe('scheduled');
      expect(record.initiatedAt).toBeDefined();
      expect(record.id).toMatch(/^rotation-/);
    });

    it('includes grace period expiry when grace period > 0', () => {
      const record = createRotationRecord(
        'policy-jwt-signing-key',
        'jwt_signing_key',
        'scheduled',
        24
      );
      expect(record.gracePeriodExpiresAt).toBeDefined();
      const expiresAt = new Date(record.gracePeriodExpiresAt!);
      const initiatedAt = new Date(record.initiatedAt);
      const diffHours = (expiresAt.getTime() - initiatedAt.getTime()) / (60 * 60 * 1000);
      expect(Math.round(diffHours)).toBe(24);
    });

    it('does not include grace period expiry when grace period is 0', () => {
      const record = createRotationRecord(
        'policy-db-credentials',
        'database_credentials',
        'manual',
        0
      );
      expect(record.gracePeriodExpiresAt).toBeUndefined();
    });
  });

  describe('createRotationFailureAlert', () => {
    it('creates a critical alert with correct details', () => {
      const policy = createDbPolicy();
      const alert = createRotationFailureAlert(policy, 'Connection timeout');

      expect(alert.severity).toBe('critical');
      expect(alert.secretType).toBe('database_credentials');
      expect(alert.policyId).toBe('policy-db-credentials');
      expect(alert.error).toBe('Connection timeout');
      expect(alert.channels).toEqual(DEFAULT_ALERT_CHANNELS);
      expect(alert.actionTaken).toContain('Retained current active secret');
      expect(alert.title).toContain('Database Credentials Rotation');
      expect(alert.id).toMatch(/^alert-rotation-/);
    });

    it('uses provided notification channels', () => {
      const policy = createJwtPolicy();
      const alert = createRotationFailureAlert(policy, 'API error', ['email', 'slack']);
      expect(alert.channels).toEqual(['email', 'slack']);
    });

    it('message indicates no service disruption', () => {
      const policy = createJwtPolicy();
      const alert = createRotationFailureAlert(policy, 'timeout');
      expect(alert.message).toContain('not affected');
      expect(alert.actionTaken).toContain('No service disruption');
    });
  });

  describe('executeRotation', () => {
    it('completes successfully when all steps succeed', async () => {
      const policy = createJwtPolicy();
      const log = createMockLog();
      const generateSecret = createMockGenerateSecret();
      const updateSecret = createMockUpdateSecret();
      const dispatchAlert = createMockDispatchAlert();

      const record = await executeRotation(
        policy,
        generateSecret,
        updateSecret,
        dispatchAlert,
        log
      );

      expect(record.status).toBe('completed');
      expect(record.completedAt).toBeDefined();
      expect(record.errorMessage).toBeUndefined();
      expect(generateSecret).toHaveBeenCalledWith('jwt_signing_key');
      expect(updateSecret).toHaveBeenCalledWith('jwt_signing_key', 'new-secret-value-abc123');
      expect(dispatchAlert).not.toHaveBeenCalled();
    });

    it('fails and dispatches alert when secret generation fails', async () => {
      const policy = createDbPolicy();
      const log = createMockLog();
      const generateSecret = vi.fn().mockRejectedValue(new Error('RNG failure'));
      const updateSecret = createMockUpdateSecret();
      const dispatchAlert = createMockDispatchAlert();

      const record = await executeRotation(
        policy,
        generateSecret,
        updateSecret,
        dispatchAlert,
        log
      );

      expect(record.status).toBe('failed');
      expect(record.errorMessage).toBe('RNG failure');
      expect(updateSecret).not.toHaveBeenCalled();
      expect(dispatchAlert).toHaveBeenCalledTimes(1);
      const alert = (dispatchAlert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(alert.severity).toBe('critical');
      expect(alert.error).toBe('RNG failure');
    });

    it('fails and dispatches alert when secret update fails', async () => {
      const policy = createDbPolicy();
      const log = createMockLog();
      const generateSecret = createMockGenerateSecret();
      const updateSecret = vi.fn().mockRejectedValue(new Error('Railway API timeout'));
      const dispatchAlert = createMockDispatchAlert();

      const record = await executeRotation(
        policy,
        generateSecret,
        updateSecret,
        dispatchAlert,
        log
      );

      expect(record.status).toBe('failed');
      expect(record.errorMessage).toBe('Railway API timeout');
      expect(dispatchAlert).toHaveBeenCalledTimes(1);
    });

    it('still returns failed record even if alert dispatch fails', async () => {
      const policy = createDbPolicy();
      const log = createMockLog();
      const generateSecret = vi.fn().mockRejectedValue(new Error('gen error'));
      const updateSecret = createMockUpdateSecret();
      const dispatchAlert = vi.fn().mockRejectedValue(new Error('alert send failed'));

      const record = await executeRotation(
        policy,
        generateSecret,
        updateSecret,
        dispatchAlert,
        log
      );

      // Rotation still marked as failed, alert failure doesn't crash
      expect(record.status).toBe('failed');
      expect(record.errorMessage).toBe('gen error');
    });
  });

  describe('evaluateRotationSchedule', () => {
    it('returns empty array when rotation is disabled', async () => {
      const config: SecretRotationConfig = {
        ...getDefaultSecretRotationConfig(),
        enabled: false,
      };
      const getLastRotation = vi.fn();

      const results = await evaluateRotationSchedule(config, getLastRotation);
      expect(results).toEqual([]);
      expect(getLastRotation).not.toHaveBeenCalled();
    });

    it('skips disabled policies', async () => {
      const config: SecretRotationConfig = {
        ...getDefaultSecretRotationConfig({ enabled: true }),
        policies: [createDbPolicy({ enabled: false }), createJwtPolicy({ enabled: true })],
      };
      const getLastRotation = vi.fn().mockResolvedValue(new Date().toISOString());

      const results = await evaluateRotationSchedule(config, getLastRotation);
      expect(results).toHaveLength(1);
      expect(results[0].policy.secretType).toBe('jwt_signing_key');
    });

    it('marks policies as due when never rotated', async () => {
      const config = getDefaultSecretRotationConfig({ enabled: true });
      const getLastRotation = vi.fn().mockResolvedValue(undefined);

      const results = await evaluateRotationSchedule(config, getLastRotation);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.isDue)).toBe(true);
    });

    it('marks policies as not due when recently rotated', async () => {
      const config = getDefaultSecretRotationConfig({ enabled: true });
      const recentDate = new Date().toISOString();
      const getLastRotation = vi.fn().mockResolvedValue(recentDate);

      const results = await evaluateRotationSchedule(config, getLastRotation);
      expect(results).toHaveLength(2);
      expect(results.every((r) => !r.isDue)).toBe(true);
    });
  });

  describe('Zod schemas', () => {
    it('validates a correct rotation policy', () => {
      const policy = createDbPolicy();
      const result = SecretRotationPolicySchema.safeParse(policy);
      expect(result.success).toBe(true);
    });

    it('rejects policy with negative interval', () => {
      const policy = createDbPolicy({ rotationIntervalDays: -1 });
      const result = SecretRotationPolicySchema.safeParse(policy);
      expect(result.success).toBe(false);
    });

    it('rejects policy with empty id', () => {
      const policy = createDbPolicy({ id: '' });
      const result = SecretRotationPolicySchema.safeParse(policy);
      expect(result.success).toBe(false);
    });

    it('validates a correct rotation config', () => {
      const config = getDefaultSecretRotationConfig({ enabled: true });
      const result = SecretRotationConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('rejects config with fewer than 2 alert channels', () => {
      const config = getDefaultSecretRotationConfig({ alertChannels: ['email'] as any });
      const result = SecretRotationConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});
