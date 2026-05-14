/**
 * Secret rotation mechanism for database credentials and JWT signing keys.
 *
 * This module manages the lifecycle of rotatable secrets:
 * - Database credentials: rotated every 90 days
 * - JWT signing keys: rotated every 30 days with a 24-hour grace period
 *   where the old key remains valid for verification
 *
 * On rotation failure, the current active secret is retained and an alert
 * is sent to the administrator without disrupting platform operations.
 *
 * Secrets are stored in Railway environment variables and rotated via
 * the Railway API or equivalent secret management mechanism.
 *
 * Requirements: 3.3, 3.4, 3.5
 */

import { z } from 'zod';

// --- Types ---

/** Supported secret types for rotation */
export type SecretType = 'database_credentials' | 'jwt_signing_key';

/** Status of a rotation attempt */
export type RotationStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/** Alert severity levels */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/** Notification channel for alerts */
export type NotificationChannel = 'email' | 'telegram' | 'slack';

/** Configuration for a rotatable secret */
export interface SecretRotationPolicy {
  /** Unique identifier for this rotation policy */
  id: string;
  /** Type of secret being rotated */
  secretType: SecretType;
  /** Human-readable name */
  name: string;
  /** Rotation interval in days */
  rotationIntervalDays: number;
  /** Grace period in hours where old secret remains valid for verification */
  gracePeriodHours: number;
  /** Whether this policy is enabled */
  enabled: boolean;
}

/** Record of a rotation event */
export interface RotationRecord {
  /** Unique rotation event ID */
  id: string;
  /** Policy ID that triggered this rotation */
  policyId: string;
  /** Type of secret rotated */
  secretType: SecretType;
  /** Status of the rotation */
  status: RotationStatus;
  /** When the rotation was initiated */
  initiatedAt: string;
  /** When the rotation completed (or failed) */
  completedAt?: string;
  /** When the grace period expires (old key becomes invalid) */
  gracePeriodExpiresAt?: string;
  /** Error message if rotation failed */
  errorMessage?: string;
  /** Who or what triggered the rotation */
  triggeredBy: 'scheduled' | 'manual' | 'emergency';
}

/** Alert payload sent on rotation failure */
export interface RotationAlert {
  /** Alert ID */
  id: string;
  /** Severity of the alert */
  severity: AlertSeverity;
  /** Alert title */
  title: string;
  /** Detailed message */
  message: string;
  /** Timestamp of the alert */
  timestamp: string;
  /** The secret type that failed rotation */
  secretType: SecretType;
  /** Policy ID */
  policyId: string;
  /** Error details */
  error: string;
  /** Notification channels to use */
  channels: NotificationChannel[];
  /** Action taken (retain current secret) */
  actionTaken: string;
}

/** Configuration for the secret rotation system */
export interface SecretRotationConfig {
  /** All rotation policies */
  policies: SecretRotationPolicy[];
  /** Notification channels for failure alerts */
  alertChannels: NotificationChannel[];
  /** Whether the rotation system is enabled */
  enabled: boolean;
  /** Railway API token environment variable name (never the value itself) */
  railwayApiTokenEnvVar: string;
  /** Railway project ID environment variable name */
  railwayProjectIdEnvVar: string;
}

/** Result of a rotation check */
export interface RotationCheckResult {
  /** Policy that was checked */
  policy: SecretRotationPolicy;
  /** Whether rotation is due */
  isDue: boolean;
  /** Days until next rotation (negative if overdue) */
  daysUntilRotation: number;
  /** Last successful rotation timestamp */
  lastRotatedAt?: string;
  /** Whether currently in grace period */
  inGracePeriod: boolean;
  /** Grace period expiry if applicable */
  gracePeriodExpiresAt?: string;
}

// --- Zod Schemas ---

export const SecretRotationPolicySchema = z.object({
  id: z.string().min(1),
  secretType: z.enum(['database_credentials', 'jwt_signing_key']),
  name: z.string().min(1),
  rotationIntervalDays: z.number().int().positive().max(365),
  gracePeriodHours: z.number().int().min(0).max(168), // max 7 days
  enabled: z.boolean(),
});

export const SecretRotationConfigSchema = z.object({
  policies: z.array(SecretRotationPolicySchema).min(1),
  alertChannels: z.array(z.enum(['email', 'telegram', 'slack'])).min(2),
  enabled: z.boolean(),
  railwayApiTokenEnvVar: z.string().min(1),
  railwayProjectIdEnvVar: z.string().min(1),
});

// --- Constants ---

/** Database credential rotation interval: 90 days (Requirement 3.3) */
export const DB_CREDENTIAL_ROTATION_DAYS = 90;

/** JWT signing key rotation interval: 30 days (Requirement 3.4) */
export const JWT_KEY_ROTATION_DAYS = 30;

/** JWT key grace period: 24 hours (Requirement 3.4) */
export const JWT_KEY_GRACE_PERIOD_HOURS = 24;

/** Database credential grace period: 0 hours (immediate switch) */
export const DB_CREDENTIAL_GRACE_PERIOD_HOURS = 0;

/** Default notification channels for rotation failure alerts */
export const DEFAULT_ALERT_CHANNELS: NotificationChannel[] = ['email', 'telegram'];

/** Environment variable name for Railway API token */
export const RAILWAY_API_TOKEN_ENV_VAR = 'RAILWAY_API_TOKEN';

/** Environment variable name for Railway project ID */
export const RAILWAY_PROJECT_ID_ENV_VAR = 'RAILWAY_PROJECT_ID';

// --- Default Configuration ---

/**
 * Returns the default secret rotation configuration.
 *
 * Policies:
 * - Database credentials: 90-day rotation, no grace period
 * - JWT signing key: 30-day rotation, 24-hour grace period
 */
export function getDefaultSecretRotationConfig(
  overrides?: Partial<SecretRotationConfig>
): SecretRotationConfig {
  const config: SecretRotationConfig = {
    policies: [
      {
        id: 'policy-db-credentials',
        secretType: 'database_credentials',
        name: 'Database Credentials Rotation',
        rotationIntervalDays: DB_CREDENTIAL_ROTATION_DAYS,
        gracePeriodHours: DB_CREDENTIAL_GRACE_PERIOD_HOURS,
        enabled: true,
      },
      {
        id: 'policy-jwt-signing-key',
        secretType: 'jwt_signing_key',
        name: 'JWT Signing Key Rotation',
        rotationIntervalDays: JWT_KEY_ROTATION_DAYS,
        gracePeriodHours: JWT_KEY_GRACE_PERIOD_HOURS,
        enabled: true,
      },
    ],
    alertChannels: DEFAULT_ALERT_CHANNELS,
    enabled: process.env.SECRET_ROTATION_ENABLED === 'true',
    railwayApiTokenEnvVar: RAILWAY_API_TOKEN_ENV_VAR,
    railwayProjectIdEnvVar: RAILWAY_PROJECT_ID_ENV_VAR,
    ...overrides,
  };

  return config;
}

// --- Rotation Logic ---

/**
 * Checks whether a secret rotation is due based on the policy interval
 * and the last rotation timestamp.
 *
 * @param policy - The rotation policy to check
 * @param lastRotatedAt - ISO 8601 timestamp of last successful rotation (or undefined if never rotated)
 * @param now - Current timestamp (defaults to Date.now())
 * @returns RotationCheckResult with rotation status
 */
export function checkRotationDue(
  policy: SecretRotationPolicy,
  lastRotatedAt?: string,
  now: Date = new Date()
): RotationCheckResult {
  if (!lastRotatedAt) {
    return {
      policy,
      isDue: true,
      daysUntilRotation: 0,
      inGracePeriod: false,
    };
  }

  const lastRotation = new Date(lastRotatedAt);
  const intervalMs = policy.rotationIntervalDays * 24 * 60 * 60 * 1000;
  const nextRotationAt = new Date(lastRotation.getTime() + intervalMs);
  const daysUntilRotation = Math.floor(
    (nextRotationAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );

  // Check if currently in grace period
  const gracePeriodMs = policy.gracePeriodHours * 60 * 60 * 1000;
  const gracePeriodExpiresAt = new Date(lastRotation.getTime() + gracePeriodMs);
  const inGracePeriod =
    policy.gracePeriodHours > 0 && now.getTime() <= gracePeriodExpiresAt.getTime();

  return {
    policy,
    isDue: daysUntilRotation <= 0,
    daysUntilRotation,
    lastRotatedAt,
    inGracePeriod,
    gracePeriodExpiresAt:
      policy.gracePeriodHours > 0 ? gracePeriodExpiresAt.toISOString() : undefined,
  };
}

/**
 * Determines whether an old JWT key is still valid for verification
 * during the grace period after rotation.
 *
 * Per Requirement 3.4: Old JWT key remains valid for verification
 * for 24 hours after rotation.
 *
 * @param rotationTimestamp - When the rotation occurred (ISO 8601)
 * @param gracePeriodHours - Grace period duration in hours
 * @param now - Current timestamp (defaults to Date.now())
 * @returns true if the old key should still be accepted for verification
 */
export function isInGracePeriod(
  rotationTimestamp: string,
  gracePeriodHours: number,
  now: Date = new Date()
): boolean {
  const rotationTime = new Date(rotationTimestamp);
  const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;
  const expiresAt = new Date(rotationTime.getTime() + gracePeriodMs);

  return now.getTime() <= expiresAt.getTime();
}

/**
 * Creates a rotation record for tracking rotation attempts.
 *
 * @param policyId - The policy ID triggering the rotation
 * @param secretType - Type of secret being rotated
 * @param triggeredBy - What triggered the rotation
 * @param gracePeriodHours - Grace period for the old secret
 * @returns A new RotationRecord in 'pending' status
 */
export function createRotationRecord(
  policyId: string,
  secretType: SecretType,
  triggeredBy: RotationRecord['triggeredBy'],
  gracePeriodHours: number
): RotationRecord {
  const now = new Date();
  const gracePeriodExpiresAt =
    gracePeriodHours > 0
      ? new Date(now.getTime() + gracePeriodHours * 60 * 60 * 1000).toISOString()
      : undefined;

  return {
    id: `rotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    policyId,
    secretType,
    status: 'pending',
    initiatedAt: now.toISOString(),
    gracePeriodExpiresAt,
    triggeredBy,
  };
}

/**
 * Creates a rotation failure alert payload.
 *
 * Per Requirement 3.5: On failure, alert administrator and retain
 * current active secret without disrupting operations.
 *
 * @param policy - The policy that failed rotation
 * @param error - Error message describing the failure
 * @param channels - Notification channels to use
 * @returns RotationAlert payload ready for dispatch
 */
export function createRotationFailureAlert(
  policy: SecretRotationPolicy,
  error: string,
  channels: NotificationChannel[] = DEFAULT_ALERT_CHANNELS
): RotationAlert {
  return {
    id: `alert-rotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    severity: 'critical',
    title: `Secret Rotation Failed: ${policy.name}`,
    message:
      `Rotation of ${policy.secretType} (policy: ${policy.id}) failed. ` +
      `Current active secret has been retained. Platform operations are not affected. ` +
      `Manual intervention required to complete rotation.`,
    timestamp: new Date().toISOString(),
    secretType: policy.secretType,
    policyId: policy.id,
    error,
    channels,
    actionTaken: 'Retained current active secret. No service disruption.',
  };
}

// --- Rotation Executor ---

/** Function signature for the secret update operation */
export type SecretUpdateFn = (secretType: SecretType, newSecretValue: string) => Promise<void>;

/** Function signature for generating a new secret value */
export type SecretGeneratorFn = (secretType: SecretType) => Promise<string>;

/** Function signature for sending alerts */
export type AlertDispatchFn = (alert: RotationAlert) => Promise<void>;

/** Function signature for logging */
export type RotationLogFn = (
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
) => void;

/**
 * Executes a secret rotation for a given policy.
 *
 * Steps:
 * 1. Generate new secret value
 * 2. Update secret in the secret store (Railway env vars)
 * 3. Record successful rotation
 *
 * On failure at any step:
 * - Retain current secret (no change applied)
 * - Dispatch alert to administrator
 * - Return failed rotation record
 *
 * @param policy - The rotation policy to execute
 * @param generateSecret - Function to generate a new secret value
 * @param updateSecret - Function to update the secret in the store
 * @param dispatchAlert - Function to send failure alerts
 * @param log - Logger function
 * @returns The rotation record with final status
 */
export async function executeRotation(
  policy: SecretRotationPolicy,
  generateSecret: SecretGeneratorFn,
  updateSecret: SecretUpdateFn,
  dispatchAlert: AlertDispatchFn,
  log: RotationLogFn
): Promise<RotationRecord> {
  const record = createRotationRecord(
    policy.id,
    policy.secretType,
    'scheduled',
    policy.gracePeriodHours
  );

  record.status = 'in_progress';
  log('info', `Starting secret rotation for ${policy.name}`, {
    policyId: policy.id,
    secretType: policy.secretType,
  });

  try {
    // Step 1: Generate new secret
    const newSecret = await generateSecret(policy.secretType);

    // Step 2: Update secret in the store
    await updateSecret(policy.secretType, newSecret);

    // Step 3: Mark as completed
    record.status = 'completed';
    record.completedAt = new Date().toISOString();

    log('info', `Secret rotation completed successfully for ${policy.name}`, {
      policyId: policy.id,
      secretType: policy.secretType,
      gracePeriodExpiresAt: record.gracePeriodExpiresAt,
    });

    return record;
  } catch (error) {
    // Requirement 3.5: On failure, retain current secret and alert admin
    record.status = 'failed';
    record.completedAt = new Date().toISOString();
    record.errorMessage = error instanceof Error ? error.message : String(error);

    log('error', `Secret rotation FAILED for ${policy.name}. Retaining current secret.`, {
      policyId: policy.id,
      secretType: policy.secretType,
      error: record.errorMessage,
    });

    // Dispatch failure alert
    const alert = createRotationFailureAlert(policy, record.errorMessage, DEFAULT_ALERT_CHANNELS);

    try {
      await dispatchAlert(alert);
      log('info', `Rotation failure alert dispatched for ${policy.name}`, {
        alertId: alert.id,
        channels: alert.channels,
      });
    } catch (alertError) {
      // Even if alert dispatch fails, we still retain the current secret
      log('error', `Failed to dispatch rotation failure alert for ${policy.name}`, {
        alertError: alertError instanceof Error ? alertError.message : String(alertError),
      });
    }

    return record;
  }
}

// --- Scheduler ---

/**
 * Evaluates all rotation policies and returns which ones are due for rotation.
 *
 * @param config - The secret rotation configuration
 * @param getLastRotation - Function to retrieve last rotation timestamp for a policy
 * @param now - Current timestamp
 * @returns Array of policies that are due for rotation
 */
export async function evaluateRotationSchedule(
  config: SecretRotationConfig,
  getLastRotation: (policyId: string) => Promise<string | undefined>,
  now: Date = new Date()
): Promise<RotationCheckResult[]> {
  if (!config.enabled) {
    return [];
  }

  const results: RotationCheckResult[] = [];

  for (const policy of config.policies) {
    if (!policy.enabled) {
      continue;
    }

    const lastRotatedAt = await getLastRotation(policy.id);
    const check = checkRotationDue(policy, lastRotatedAt, now);
    results.push(check);
  }

  return results;
}

/**
 * Runs the full rotation cycle: evaluate schedule, execute due rotations.
 *
 * This is the main entry point for the rotation scheduler (e.g., called
 * by a cron job or Railway scheduled task).
 *
 * @param config - Secret rotation configuration
 * @param getLastRotation - Retrieves last rotation timestamp
 * @param generateSecret - Generates new secret values
 * @param updateSecret - Updates secrets in the store
 * @param dispatchAlert - Sends failure alerts
 * @param log - Logger function
 * @returns Array of rotation records for all executed rotations
 */
export async function runRotationCycle(
  config: SecretRotationConfig,
  getLastRotation: (policyId: string) => Promise<string | undefined>,
  generateSecret: SecretGeneratorFn,
  updateSecret: SecretUpdateFn,
  dispatchAlert: AlertDispatchFn,
  log: RotationLogFn
): Promise<RotationRecord[]> {
  if (!config.enabled) {
    log('info', 'Secret rotation is disabled. Skipping cycle.');
    return [];
  }

  log('info', 'Starting secret rotation cycle evaluation.');

  const schedule = await evaluateRotationSchedule(config, getLastRotation);
  const dueRotations = schedule.filter((r) => r.isDue);

  if (dueRotations.length === 0) {
    log('info', 'No rotations due. All secrets are within their rotation interval.');
    return [];
  }

  log('info', `${dueRotations.length} rotation(s) due. Executing...`, {
    policies: dueRotations.map((r) => r.policy.id),
  });

  const records: RotationRecord[] = [];

  for (const check of dueRotations) {
    const record = await executeRotation(
      check.policy,
      generateSecret,
      updateSecret,
      dispatchAlert,
      log
    );
    records.push(record);
  }

  const successful = records.filter((r) => r.status === 'completed').length;
  const failed = records.filter((r) => r.status === 'failed').length;

  log('info', `Rotation cycle complete. ${successful} succeeded, ${failed} failed.`);

  return records;
}
