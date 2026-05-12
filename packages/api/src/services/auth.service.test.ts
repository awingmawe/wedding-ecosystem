import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { ErrorCode } from '@wedding/shared';
import {
  AuthService,
  AuthRepository,
  UserRecord,
  LoginAttemptInfo,
  RefreshTokenRecord,
  AUTH_CONSTANTS,
  isAuthError,
} from './auth.service';

// --- Test helpers ---

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing';
const TEST_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
const TEST_TENANT_ID = 'tenant-001';

async function createHashedPassword(password: string): Promise<string> {
  return bcrypt.hash(password, AUTH_CONSTANTS.BCRYPT_COST_FACTOR);
}

function createMockUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-001',
    tenant_id: TEST_TENANT_ID,
    email: 'test@example.com',
    password_hash: '', // will be set in tests
    role: 'client',
    name: 'Test User',
    created_at: new Date(),
    ...overrides,
  };
}

// --- Mock Repository ---

class MockAuthRepository implements AuthRepository {
  users: UserRecord[] = [];
  loginAttempts: Map<string, LoginAttemptInfo> = new Map();
  refreshTokens: Map<string, RefreshTokenRecord> = new Map();

  async findUserByEmail(tenantId: string, email: string): Promise<UserRecord | null> {
    return (
      this.users.find((u) => u.tenant_id === tenantId && u.email === email) ?? null
    );
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.id === userId) ?? null;
  }

  async getLoginAttemptInfo(userId: string): Promise<LoginAttemptInfo> {
    return this.loginAttempts.get(userId) ?? { failed_attempts: 0, locked_until: null };
  }

  async incrementFailedAttempts(userId: string): Promise<void> {
    const current = this.loginAttempts.get(userId) ?? {
      failed_attempts: 0,
      locked_until: null,
    };
    this.loginAttempts.set(userId, {
      ...current,
      failed_attempts: current.failed_attempts + 1,
    });
  }

  async lockAccount(userId: string, lockedUntil: Date): Promise<void> {
    const current = this.loginAttempts.get(userId) ?? {
      failed_attempts: 0,
      locked_until: null,
    };
    this.loginAttempts.set(userId, { ...current, locked_until: lockedUntil });
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    this.loginAttempts.set(userId, { failed_attempts: 0, locked_until: null });
  }

  async storeRefreshToken(record: Omit<RefreshTokenRecord, 'created_at'>): Promise<void> {
    this.refreshTokens.set(record.token, {
      ...record,
      created_at: new Date(),
    });
  }

  async findRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(token) ?? null;
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    for (const [key, record] of this.refreshTokens.entries()) {
      if (record.id === tokenId) {
        this.refreshTokens.set(key, { ...record, revoked: true });
        break;
      }
    }
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    for (const [key, record] of this.refreshTokens.entries()) {
      if (record.user_id === userId) {
        this.refreshTokens.set(key, { ...record, revoked: true });
      }
    }
  }
}

// --- Tests ---

describe('AuthService', () => {
  let authService: AuthService;
  let repository: MockAuthRepository;

  beforeEach(() => {
    repository = new MockAuthRepository();
    authService = new AuthService({
      jwtSecret: TEST_JWT_SECRET,
      refreshSecret: TEST_REFRESH_SECRET,
      repository,
    });
  });

  describe('hashPassword', () => {
    it('should hash a password with bcrypt cost factor 10', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2b$10$')).toBe(true); // bcrypt cost factor 10
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'SecurePassword123!';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2); // different salts
    });
  });

  describe('verifyPassword', () => {
    it('should return true for matching password', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);

      const result = await authService.verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = await authService.hashPassword('CorrectPassword');

      const result = await authService.verifyPassword('WrongPassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      const password = 'ValidPassword123!';
      const hash = await createHashedPassword(password);
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password,
      });

      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        expect(result.tokens.access_token).toBeDefined();
        expect(result.tokens.refresh_token).toBeDefined();
        expect(result.tokens.expires_in).toBe(AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS);
        expect(result.user.email).toBe(user.email);
        expect(result.user).not.toHaveProperty('password_hash');
      }
    });

    it('should return generic error for non-existent email (Req 2.3)', async () => {
      const result = await authService.login(TEST_TENANT_ID, {
        email: 'nonexistent@example.com',
        password: 'AnyPassword',
      });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_CREDENTIALS);
        // Should NOT reveal that email doesn't exist
        expect(result.message).not.toContain('email');
        expect(result.message).not.toContain('tidak ditemukan');
      }
    });

    it('should return generic error for wrong password (Req 2.3)', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'WrongPassword',
      });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_CREDENTIALS);
        // Same generic message as non-existent email
        expect(result.message).toBe('Email atau password tidak valid');
      }
    });

    it('should use same error message for wrong email and wrong password (Req 2.3)', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const wrongEmailResult = await authService.login(TEST_TENANT_ID, {
        email: 'wrong@example.com',
        password: 'AnyPassword',
      });

      const wrongPasswordResult = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'WrongPassword',
      });

      expect(isAuthError(wrongEmailResult)).toBe(true);
      expect(isAuthError(wrongPasswordResult)).toBe(true);
      if (isAuthError(wrongEmailResult) && isAuthError(wrongPasswordResult)) {
        expect(wrongEmailResult.message).toBe(wrongPasswordResult.message);
        expect(wrongEmailResult.code).toBe(wrongPasswordResult.code);
      }
    });

    it('should lock account after 5 failed attempts (Req 2.4)', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await authService.login(TEST_TENANT_ID, {
          email: user.email,
          password: 'WrongPassword',
        });
      }

      // 6th attempt should show locked message
      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'CorrectPassword', // even correct password should fail
      });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.ACCOUNT_LOCKED);
      }
    });

    it('should lock account for 15 minutes after 5 failures (Req 2.4)', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Fail 5 times to trigger lockout
      for (let i = 0; i < 5; i++) {
        await authService.login(TEST_TENANT_ID, {
          email: user.email,
          password: 'WrongPassword',
        });
      }

      // Verify the lockout duration is 15 minutes
      const attemptInfo = await repository.getLoginAttemptInfo(user.id);
      expect(attemptInfo.locked_until).not.toBeNull();
      if (attemptInfo.locked_until) {
        const lockDurationMs = attemptInfo.locked_until.getTime() - Date.now();
        // Should be approximately 15 minutes (allow 5 second tolerance)
        expect(lockDurationMs).toBeGreaterThan(AUTH_CONSTANTS.LOCKOUT_DURATION_MS - 5000);
        expect(lockDurationMs).toBeLessThanOrEqual(AUTH_CONSTANTS.LOCKOUT_DURATION_MS);
      }
    });

    it('should not lock account before 5 failed attempts (Req 2.4)', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Fail 4 times (below threshold)
      for (let i = 0; i < 4; i++) {
        await authService.login(TEST_TENANT_ID, {
          email: user.email,
          password: 'WrongPassword',
        });
      }

      // 5th attempt with correct password should succeed
      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'CorrectPassword',
      });

      expect(isAuthError(result)).toBe(false);
    });

    it('should allow login after lockout period expires (Req 2.4)', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Simulate an expired lockout (locked_until in the past)
      repository.loginAttempts.set(user.id, {
        failed_attempts: 5,
        locked_until: new Date(Date.now() - 1000), // 1 second ago
      });

      // Login should succeed since lockout has expired
      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'CorrectPassword',
      });

      expect(isAuthError(result)).toBe(false);
    });

    it('should complete login within 2 seconds for valid credentials (Req 2.2)', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const startTime = Date.now();
      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });
      const elapsed = Date.now() - startTime;

      expect(isAuthError(result)).toBe(false);
      expect(elapsed).toBeLessThan(2000);
    });

    it('should reset failed attempts on successful login', async () => {
      const hash = await createHashedPassword('CorrectPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await authService.login(TEST_TENANT_ID, {
          email: user.email,
          password: 'WrongPassword',
        });
      }

      // Successful login
      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'CorrectPassword',
      });

      expect(isAuthError(result)).toBe(false);

      // Verify attempts were reset
      const attemptInfo = await repository.getLoginAttemptInfo(user.id);
      expect(attemptInfo.failed_attempts).toBe(0);
    });

    it('should generate valid JWT access token with correct payload', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });

      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        const decoded = jwt.verify(result.tokens.access_token, TEST_JWT_SECRET) as {
          sub: string;
          tenant_id: string;
          role: string;
          email: string;
        };

        expect(decoded.sub).toBe(user.id);
        expect(decoded.tenant_id).toBe(user.tenant_id);
        expect(decoded.role).toBe(user.role);
        expect(decoded.email).toBe(user.email);
      }
    });

    it('should return access token with 15min expiry and refresh token with 7 day expiry (Req 2.1)', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });

      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        // Access token expires_in should be 900 seconds (15 minutes)
        expect(result.tokens.expires_in).toBe(900);

        // Verify access token JWT has correct expiry
        const decodedAccess = jwt.decode(result.tokens.access_token) as {
          exp: number;
          iat: number;
        };
        const accessTokenLifetime = decodedAccess.exp - decodedAccess.iat;
        expect(accessTokenLifetime).toBe(15 * 60); // 15 minutes in seconds

        // Verify refresh token JWT has correct expiry (7 days)
        const decodedRefresh = jwt.decode(result.tokens.refresh_token) as {
          exp: number;
          iat: number;
        };
        const refreshTokenLifetime = decodedRefresh.exp - decodedRefresh.iat;
        expect(refreshTokenLifetime).toBe(7 * 24 * 60 * 60); // 7 days in seconds
      }
    });

    it('should not include password_hash in returned user data', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const result = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });

      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        expect(result.user).not.toHaveProperty('password_hash');
        expect(result.user.id).toBe(user.id);
        expect(result.user.email).toBe(user.email);
        expect(result.user.name).toBe(user.name);
        expect(result.user.role).toBe(user.role);
        expect(result.user.tenant_id).toBe(user.tenant_id);
      }
    });
  });

  describe('refreshTokens', () => {
    it('should issue new token pair and revoke old refresh token (Req 2.9)', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Login to get initial tokens
      const loginResult = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });

      expect(isAuthError(loginResult)).toBe(false);
      if (isAuthError(loginResult)) return;

      const oldRefreshToken = loginResult.tokens.refresh_token;

      // Refresh tokens
      const refreshResult = await authService.refreshTokens(oldRefreshToken);

      expect(isAuthError(refreshResult)).toBe(false);
      if (!isAuthError(refreshResult)) {
        expect(refreshResult.access_token).toBeDefined();
        expect(refreshResult.refresh_token).toBeDefined();
        expect(refreshResult.refresh_token).not.toBe(oldRefreshToken);
      }

      // Old token should be revoked
      const oldTokenRecord = repository.refreshTokens.get(oldRefreshToken);
      expect(oldTokenRecord?.revoked).toBe(true);
    });

    it('should reject expired refresh token (Req 2.10)', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { sub: 'user-001', jti: 'token-001' },
        TEST_REFRESH_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a tiny bit for the token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await authService.refreshTokens(expiredToken);

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.SESSION_EXPIRED);
      }
    });

    it('should reject invalid refresh token (Req 2.10)', async () => {
      const result = await authService.refreshTokens('invalid-token-string');

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.SESSION_EXPIRED);
      }
    });

    it('should reject revoked refresh token and revoke all user tokens (Req 2.10)', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      // Login to get tokens
      const loginResult = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });

      if (isAuthError(loginResult)) return;

      const refreshToken = loginResult.tokens.refresh_token;

      // Manually revoke the token
      const tokenRecord = repository.refreshTokens.get(refreshToken);
      if (tokenRecord) {
        repository.refreshTokens.set(refreshToken, { ...tokenRecord, revoked: true });
      }

      // Try to use revoked token
      const result = await authService.refreshTokens(refreshToken);

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.REFRESH_TOKEN_INVALID);
      }
    });
  });

  describe('verifyAccessToken', () => {
    it('should decode a valid access token', async () => {
      const hash = await createHashedPassword('ValidPassword');
      const user = createMockUser({ password_hash: hash });
      repository.users.push(user);

      const loginResult = await authService.login(TEST_TENANT_ID, {
        email: user.email,
        password: 'ValidPassword',
      });

      if (isAuthError(loginResult)) return;

      const decoded = authService.verifyAccessToken(loginResult.tokens.access_token);

      expect(isAuthError(decoded)).toBe(false);
      if (!isAuthError(decoded)) {
        expect(decoded.sub).toBe(user.id);
        expect(decoded.tenant_id).toBe(user.tenant_id);
        expect(decoded.role).toBe(user.role);
      }
    });

    it('should return error for expired access token', () => {
      const expiredToken = jwt.sign(
        { sub: 'user-001', tenant_id: 'tenant-001', role: 'client', email: 'test@test.com' },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Token is already expired at creation with 0s
      const result = authService.verifyAccessToken(expiredToken);

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.code).toBe(ErrorCode.TOKEN_EXPIRED);
      }
    });

    it('should return error for token with wrong secret', () => {
      const tokenWithWrongSecret = jwt.sign(
        { sub: 'user-001', tenant_id: 'tenant-001', role: 'client', email: 'test@test.com' },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      const result = authService.verifyAccessToken(tokenWithWrongSecret);

      expect(isAuthError(result)).toBe(true);
    });
  });

  describe('isAuthError type guard', () => {
    it('should identify error objects', () => {
      const error = { code: ErrorCode.INVALID_CREDENTIALS, message: 'test' };
      expect(isAuthError(error)).toBe(true);
    });

    it('should not identify token results as errors', () => {
      const tokens = { access_token: 'abc', refresh_token: 'def', expires_in: 900 };
      expect(isAuthError(tokens)).toBe(false);
    });
  });
});
