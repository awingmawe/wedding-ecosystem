export {
  calculatePoolSize,
  getDatabaseConfig,
  getDatabaseUrls,
  getPoolConfig,
  getSSLConfig,
  type DatabaseConfig,
  type DatabaseUrls,
  type PoolConfig,
  type SSLConfig,
} from './database';

export {
  buildRedisOptions,
  cacheDel,
  cacheGet,
  cacheSet,
  createCacheClient,
  createPubSubClient,
  createRetryStrategy,
  disconnectRedis,
  getCacheClient,
  getPubSubClient,
  getRedisConfig,
  getRedisHealth,
  resetRedisClients,
  type CacheOperationResult,
  type RedisConfig,
} from './redis';

export {
  buildLoggerOptions,
  createRequestLogger,
  DEFAULT_SERVICE_NAME,
  getFastifyLoggerConfig,
  getLoggerConfig,
  logSerializers,
  type LoggerConfig,
} from './logger';

export {
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
  runRotationCycle,
  SecretRotationConfigSchema,
  SecretRotationPolicySchema,
  type AlertDispatchFn,
  type AlertSeverity,
  type NotificationChannel,
  type RotationAlert,
  type RotationCheckResult,
  type RotationLogFn,
  type RotationRecord,
  type RotationStatus,
  type SecretGeneratorFn,
  type SecretRotationConfig,
  type SecretRotationPolicy,
  type SecretType,
  type SecretUpdateFn,
} from './secret-rotation';

export {
  ENCRYPTION_KEY_ENV_VAR,
  loadEncryptionKey,
  redactEncryptionKey,
  validateEncryptionKeyAvailable,
  type EncryptionKeyConfig,
} from './encryption-key';

export { getEnvConfig, resetEnvConfig, validateEnv, type EnvConfig } from './env';
