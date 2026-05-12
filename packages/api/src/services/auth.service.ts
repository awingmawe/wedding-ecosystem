import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ErrorCode } from '@wedding/shared';
import type { LoginInput } from '@wedding/shared';

// --- Constants ---

const BCRYPT_COST_FACTOR = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// --- Types ---

export interface TokenPayload {
  sub: string; // user id
  tenant_id: string;
  role: string;
  email: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
}

export interface UserRecord {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: string;
  name: string;
  created_at: Date;
}

export interface LoginAttemptInfo {
  failed_attempts: number;
  locked_until: Date | null;
}

export interface LoginResult {
  user: Omit<UserRecord, 'password_hash'>;
  tokens: AuthTokens;
}

export interface AuthServiceError {
  code: ErrorCode;
  message: string;
}

// --- Database interface (dependency injection) ---

export interface AuthRepository {
  findUserByEmail(tenantId: string, email: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  getLoginAttemptInfo(userId: string): Promise<LoginAttemptInfo>;
  incrementFailedAttempts(userId: string): Promise<void>;
  lockAccount(userId: string, lockedUntil: Date): Promise<void>;
  resetFailedAttempts(userId: string): Promise<void>;
  storeRefreshToken(record: Omit<RefreshTokenRecord, 'created_at'>): Promise<void>;
  findRefreshToken(token: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(tokenId: string): Promise<void>;
  revokeAllUserRefreshTokens(userId: string): Promise<void>;
}

// --- Auth Service ---

export class AuthService {
  private readonly jwtSecret: string;
  private readonly refreshSecret: string;
  private readonly repository: AuthRepository;

  constructor(config: {
    jwtSecret: string;
    refreshSecret: string;
    repository: AuthRepository;
  }) {
    this.jwtSecret = config.jwtSecret;
    this.refreshSecret = config.refreshSecret;
    this.repository = config.repository;
  }

  // --- Password Hashing ---

  /**
   * Hash a password using bcrypt with cost factor 10 (Req 2.11)
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST_FACTOR);
  }

  /**
   * Compare a plain text password with a bcrypt hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // --- Login ---

  /**
   * Authenticate user with email and password (Req 2.1, 2.2, 2.3, 2.4)
   * - Returns generic error for invalid credentials (Req 2.3)
   * - Locks account after 5 failed attempts for 15 minutes (Req 2.4)
   */
  async login(
    tenantId: string,
    credentials: LoginInput
  ): Promise<LoginResult | AuthServiceError> {
    const { email, password } = credentials;

    // Find user by email within tenant
    const user = await this.repository.findUserByEmail(tenantId, email);

    if (!user) {
      // Generic error - don't reveal whether email exists (Req 2.3)
      return {
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email atau password tidak valid',
      };
    }

    // Check account lockout (Req 2.4)
    const attemptInfo = await this.repository.getLoginAttemptInfo(user.id);

    if (attemptInfo.locked_until && attemptInfo.locked_until > new Date()) {
      return {
        code: ErrorCode.ACCOUNT_LOCKED,
        message: 'Akun terkunci sementara. Silakan coba lagi nanti.',
      };
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts
      const newAttemptCount = attemptInfo.failed_attempts + 1;
      await this.repository.incrementFailedAttempts(user.id);

      // Lock account if threshold reached (Req 2.4)
      if (newAttemptCount >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await this.repository.lockAccount(user.id, lockedUntil);
        return {
          code: ErrorCode.ACCOUNT_LOCKED,
          message: 'Akun terkunci sementara. Silakan coba lagi nanti.',
        };
      }

      // Generic error - don't reveal whether email or password is wrong (Req 2.3)
      return {
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email atau password tidak valid',
      };
    }

    // Successful login - reset failed attempts
    await this.repository.resetFailedAttempts(user.id);

    // Generate tokens (Req 2.1)
    const tokens = await this.generateTokenPair(user);

    // Return user without password_hash
    const { password_hash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  // --- Token Generation ---

  /**
   * Generate access token (15min) and refresh token (7 days) (Req 2.1)
   */
  async generateTokenPair(user: UserRecord): Promise<AuthTokens> {
    const payload: TokenPayload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
    };

    // Generate access token (15 min expiry)
    const access_token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Generate refresh token (7 day expiry)
    const refreshTokenId = randomUUID();
    const refreshTokenValue = jwt.sign(
      { sub: user.id, jti: refreshTokenId },
      this.refreshSecret,
      { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
    );

    // Store refresh token in database
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await this.repository.storeRefreshToken({
      id: refreshTokenId,
      user_id: user.id,
      token: refreshTokenValue,
      expires_at: expiresAt,
      revoked: false,
    });

    return {
      access_token,
      refresh_token: refreshTokenValue,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  // --- Token Refresh with Rotation ---

  /**
   * Refresh token rotation: validate old refresh token, revoke it, issue new pair (Req 2.9, 2.10)
   */
  async refreshTokens(
    refreshToken: string
  ): Promise<AuthTokens | AuthServiceError> {
    // Verify the refresh token JWT signature and expiry
    let decoded: { sub: string; jti: string };
    try {
      decoded = jwt.verify(refreshToken, this.refreshSecret) as {
        sub: string;
        jti: string;
      };
    } catch (error) {
      // Token expired or invalid signature (Req 2.10)
      return {
        code: ErrorCode.SESSION_EXPIRED,
        message: 'Sesi telah berakhir. Silakan login ulang.',
      };
    }

    // Find the refresh token record in database
    const tokenRecord = await this.repository.findRefreshToken(refreshToken);

    if (!tokenRecord) {
      // Token not found in database (Req 2.10)
      return {
        code: ErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Refresh token tidak valid. Silakan login ulang.',
      };
    }

    // Check if token has been revoked (Req 2.10)
    if (tokenRecord.revoked) {
      // Potential token reuse attack - revoke all tokens for this user
      await this.repository.revokeAllUserRefreshTokens(tokenRecord.user_id);
      return {
        code: ErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Refresh token tidak valid. Silakan login ulang.',
      };
    }

    // Check if token has expired (Req 2.10)
    if (tokenRecord.expires_at < new Date()) {
      await this.repository.revokeRefreshToken(tokenRecord.id);
      return {
        code: ErrorCode.SESSION_EXPIRED,
        message: 'Sesi telah berakhir. Silakan login ulang.',
      };
    }

    // Revoke the old refresh token (rotation - Req 2.9)
    await this.repository.revokeRefreshToken(tokenRecord.id);

    // Find the user to generate new tokens
    // We use the user_id from the token record
    const user = await this.findUserById(tokenRecord.user_id);

    if (!user) {
      return {
        code: ErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Refresh token tidak valid. Silakan login ulang.',
      };
    }

    // Issue new token pair (Req 2.9)
    return this.generateTokenPair(user);
  }

  // --- Access Token Verification ---

  /**
   * Verify and decode an access token
   */
  verifyAccessToken(token: string): TokenPayload | AuthServiceError {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'Access token telah kedaluwarsa.',
        };
      }
      return {
        code: ErrorCode.REFRESH_TOKEN_INVALID,
        message: 'Token tidak valid.',
      };
    }
  }

  // --- Helper: find user by ID (used internally for refresh) ---

  private async findUserById(userId: string): Promise<UserRecord | null> {
    return this.repository.findUserById(userId);
  }
}

// --- Exported constants for testing ---

export const AUTH_CONSTANTS = {
  BCRYPT_COST_FACTOR,
  ACCESS_TOKEN_EXPIRY,
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_DAYS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} as const;

// --- Type guard ---

/**
 * Type guard to check if a result is an AuthServiceError
 */
export function isAuthError(
  result: LoginResult | AuthTokens | TokenPayload | AuthServiceError
): result is AuthServiceError {
  return 'code' in result && 'message' in result && !('access_token' in result);
}
