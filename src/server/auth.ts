import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPool, isDatabaseUrlConfigured } from './db';

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'authenticated';
  session_id: string;
  auth_provider: 'supabase_gotrue' | 'supabase_pg_auth' | 'memory_fallback';
  created_at: string;
}

export interface AuthSessionPayload {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: number;
  user: AuthenticatedUser;
}

export interface AuthConfigStatus {
  supabase_url: string | null;
  supabase_anon_key_configured: boolean;
  supabase_pg_auth_available: boolean;
  active_auth_mode: 'supabase_gotrue_and_pg' | 'supabase_pg_auth' | 'memory_fallback';
  rls_enabled: boolean;
  missing_optional_env_vars: string[];
}

export class AuthError extends Error {
  public statusCode: number;
  public code: string;
  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

/**
 * Derives the Supabase project URL from SUPABASE_URL, VITE_SUPABASE_URL,
 * or the Supabase session pooler username (`postgres.<project-ref>`).
 */
export function resolveSupabaseUrl(): string | null {
  const explicit = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl) return null;
  try {
    const parsed = new URL(dbUrl);
    const parts = decodeURIComponent(parsed.username).split('.');
    if (parts.length === 2 && parts[0] === 'postgres' && parts[1].length >= 12) {
      return `https://${parts[1]}.supabase.co`;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export function resolveSupabaseAnonKey(): string | null {
  const key = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return key.length > 0 ? key : null;
}

let cachedSupabaseClient: SupabaseClient | null = null;

function getSupabaseServerClient(): SupabaseClient | null {
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabaseAnonKey();
  if (!url || !anonKey) return null;
  if (!cachedSupabaseClient) {
    cachedSupabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedSupabaseClient;
}

/**
 * Derives a deterministic server-side HMAC-SHA256 signing key that is never exposed to clients.
 * Uses SUPABASE_JWT_SECRET or AUTH_JWT_SECRET if configured, otherwise derives a 256-bit key
 * via HKDF/HMAC from the server-only DATABASE_URL credential.
 */
function getServerJwtSigningSecret(): Buffer {
  const secretMaterial =
    process.env.SUPABASE_JWT_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    process.env.DATABASE_URL ||
    'green-loop-local-dev-ephemeral-signing-key';
  return crypto
    .createHmac('sha256', 'green-loop-supabase-auth-v1')
    .update(secretMaterial)
    .digest();
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToString(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf-8');
}

interface SignedJwtClaims {
  sub: string;
  email: string;
  full_name: string | null;
  role: 'authenticated';
  session_id: string;
  aud: 'authenticated';
  iss: string;
  iat: number;
  exp: number;
}

export function issueSignedAccessToken(
  user: {
    id: string;
    email: string;
    full_name: string | null;
    session_id: string;
  },
  ttlSeconds = SESSION_TTL_SECONDS
): { token: string; expiresAt: number; expiresIn: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSeconds;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SignedJwtClaims = {
    sub: user.id,
    email: user.email,
    full_name: user.full_name,
    role: 'authenticated',
    session_id: user.session_id,
    aud: 'authenticated',
    iss: resolveSupabaseUrl()
      ? `${resolveSupabaseUrl()}/auth/v1`
      : 'green-loop-supabase-auth',
    iat: nowSec,
    exp: expSec,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getServerJwtSigningSecret())
    .update(signingInput)
    .digest();
  const encodedSig = base64UrlEncode(signature);

  return {
    token: `${signingInput}.${encodedSig}`,
    expiresAt: expSec,
    expiresIn: ttlSeconds,
  };
}

function verifyLocalJwtSignature(token: string): SignedJwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('Malformed authentication token.', 401, 'INVALID_TOKEN');
  }
  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = base64UrlEncode(
    crypto
      .createHmac('sha256', getServerJwtSigningSecret())
      .update(signingInput)
      .digest()
  );

  const actualBuf = Buffer.from(encodedSig, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (
    actualBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(actualBuf, expectedBuf)
  ) {
    throw new AuthError('Invalid authentication token signature.', 401, 'INVALID_SIGNATURE');
  }

  let claims: SignedJwtClaims;
  try {
    claims = JSON.parse(base64UrlDecodeToString(encodedPayload)) as SignedJwtClaims;
  } catch {
    throw new AuthError('Invalid authentication token payload.', 401, 'INVALID_TOKEN');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
    throw new AuthError('Authentication session has expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
  }

  if (!claims.sub || !claims.session_id || claims.role !== 'authenticated') {
    throw new AuthError('Authentication token is missing required identity claims.', 401, 'INVALID_CLAIMS');
  }

  return claims;
}

// Fallback memory store ONLY when DATABASE_URL is not configured
interface MemoryAuthUser {
  id: string;
  email: string;
  full_name: string | null;
  password_salt: string;
  password_hash: string;
  created_at: string;
}
const memoryUsersByEmail = new Map<string, MemoryAuthUser>();
const memoryActiveSessions = new Map<string, { user_id: string; expires_at: number }>();

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function getAuthConfigStatus(): Promise<AuthConfigStatus> {
  const supabaseUrl = resolveSupabaseUrl();
  const anonKeyConfigured = Boolean(resolveSupabaseAnonKey());
  const dbConfigured = isDatabaseUrlConfigured();

  const missingVars: string[] = [];
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    missingVars.push('VITE_SUPABASE_URL');
  }
  if (!anonKeyConfigured) {
    missingVars.push('VITE_SUPABASE_ANON_KEY');
  }

  let rlsEnabled = false;
  let pgAuthAvailable = false;
  const pool = getPool();
  if (pool && dbConfigured) {
    try {
      const rlsRes = await pool.query<{ all_rls: boolean }>(
        `SELECT bool_and(rowsecurity) AS all_rls
         FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN ('farms', 'plots', 'crop_cycles', 'cultivation_events', 'harvests', 'quality_assessments', 'market_entries')`
      );
      rlsEnabled = Boolean(rlsRes.rows[0]?.all_rls);
      pgAuthAvailable = true;
    } catch {
      pgAuthAvailable = false;
    }
  }

  const activeMode =
    anonKeyConfigured && pgAuthAvailable
      ? 'supabase_gotrue_and_pg'
      : pgAuthAvailable
        ? 'supabase_pg_auth'
        : 'memory_fallback';

  return {
    supabase_url: supabaseUrl,
    supabase_anon_key_configured: anonKeyConfigured,
    supabase_pg_auth_available: pgAuthAvailable,
    active_auth_mode: activeMode,
    rls_enabled: rlsEnabled,
    missing_optional_env_vars: missingVars,
  };
}

/**
 * Registers a new user in Supabase Auth (`auth.users`, `auth.identities`, `auth.sessions`).
 * Never creates a custom password table and never stores plaintext passwords.
 */
export async function registerUser(input: {
  email: string;
  password: string;
  full_name?: string | null;
}): Promise<AuthSessionPayload> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const fullName = input.full_name?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Please provide a valid email address.', 400, 'INVALID_EMAIL');
  }
  if (!password || password.length < 8) {
    throw new AuthError('Password must be at least 8 characters long.', 400, 'WEAK_PASSWORD');
  }

  // 1. If official Supabase GoTrue client is configured with SUPABASE_ANON_KEY, try GoTrue first
  const supClient = getSupabaseServerClient();
  if (supClient) {
    const { data, error } = await supClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (!error && data.user && data.session) {
      return {
        access_token: data.session.access_token,
        token_type: 'bearer',
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + data.session.expires_in,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          full_name: (data.user.user_metadata?.full_name as string) || fullName,
          role: 'authenticated',
          session_id: data.user.id,
          auth_provider: 'supabase_gotrue',
          created_at: data.user.created_at,
        },
      };
    }
  }

  // 2. Native Supabase PostgreSQL `auth.users` + `auth.identities` + `auth.sessions` (using pgcrypto bcrypt)
  const pool = getPool();
  if (pool && isDatabaseUrlConfigured()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM auth.users WHERE lower(email) = $1 AND deleted_at IS NULL LIMIT 1`,
        [email]
      );
      if ((existing.rowCount ?? 0) > 0) {
        await client.query('ROLLBACK');
        throw new AuthError(
          'An account with this email address is already registered. Please sign in instead.',
          409,
          'EMAIL_EXISTS'
        );
      }

      const userId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const instanceId = '00000000-0000-0000-0000-000000000000';
      const userMeta = JSON.stringify({
        sub: userId,
        email,
        full_name: fullName,
        email_verified: true,
      });
      const appMeta = JSON.stringify({
        provider: 'email',
        providers: ['email'],
      });

      const userRes = await client.query<{ id: string; email: string; created_at: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, is_sso_user, is_anonymous
         )
         VALUES (
           $1::uuid, $2::uuid, 'authenticated', 'authenticated', $3,
           crypt($4, gen_salt('bf', 10)),
           NOW(), NOW(), $5::jsonb, $6::jsonb,
           NOW(), NOW(), FALSE, FALSE
         )
         RETURNING id, email, created_at`,
        [instanceId, userId, email, password, appMeta, userMeta]
      );

      await client.query(
        `INSERT INTO auth.identities (
           id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
         )
         VALUES (
           gen_random_uuid(), $1::uuid, $2::jsonb, 'email', $1::text, NOW(), NOW(), NOW()
         )`,
        [userId, userMeta]
      );

      await client.query(
        `INSERT INTO auth.sessions (
           id, user_id, created_at, updated_at, not_after
         )
         VALUES (
           $1::uuid, $2::uuid, NOW(), NOW(), NOW() + ($3 || ' seconds')::interval
         )`,
        [sessionId, userId, String(SESSION_TTL_SECONDS)]
      );

      await client.query('COMMIT');

      const createdUser = userRes.rows[0];
      const issued = issueSignedAccessToken({
        id: createdUser.id,
        email: createdUser.email,
        full_name: fullName,
        session_id: sessionId,
      });

      return {
        access_token: issued.token,
        token_type: 'bearer',
        expires_in: issued.expiresIn,
        expires_at: issued.expiresAt,
        user: {
          id: createdUser.id,
          email: createdUser.email,
          full_name: fullName,
          role: 'authenticated',
          session_id: sessionId,
          auth_provider: 'supabase_pg_auth',
          created_at: new Date(createdUser.created_at).toISOString(),
        },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof AuthError) throw err;
      throw new AuthError(
        err instanceof Error ? err.message : 'Failed to register user account.',
        500,
        'REGISTRATION_FAILED'
      );
    } finally {
      client.release();
    }
  }

  // 3. Fallback when DATABASE_URL is not configured
  if (memoryUsersByEmail.has(email)) {
    throw new AuthError(
      'An account with this email address is already registered.',
      409,
      'EMAIL_EXISTS'
    );
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  memoryUsersByEmail.set(email, {
    id: userId,
    email,
    full_name: fullName,
    password_salt: salt,
    password_hash: hash,
    created_at: createdAt,
  });

  const issued = issueSignedAccessToken({
    id: userId,
    email,
    full_name: fullName,
    session_id: sessionId,
  });
  memoryActiveSessions.set(sessionId, {
    user_id: userId,
    expires_at: issued.expiresAt,
  });

  return {
    access_token: issued.token,
    token_type: 'bearer',
    expires_in: issued.expiresIn,
    expires_at: issued.expiresAt,
    user: {
      id: userId,
      email,
      full_name: fullName,
      role: 'authenticated',
      session_id: sessionId,
      auth_provider: 'memory_fallback',
      created_at: createdAt,
    },
  };
}

/**
 * Authenticates an existing user with email and password against Supabase Auth.
 */
export async function signInUser(input: {
  email: string;
  password: string;
}): Promise<AuthSessionPayload> {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!email || !password) {
    throw new AuthError('Email and password are required.', 400, 'MISSING_CREDENTIALS');
  }

  // 1. If official Supabase GoTrue client is configured, attempt GoTrue sign-in
  const supClient = getSupabaseServerClient();
  if (supClient) {
    const { data, error } = await supClient.auth.signInWithPassword({
      email,
      password,
    });
    if (!error && data.user && data.session) {
      return {
        access_token: data.session.access_token,
        token_type: 'bearer',
        expires_in: data.session.expires_in,
        expires_at:
          data.session.expires_at ?? Math.floor(Date.now() / 1000) + data.session.expires_in,
        user: {
          id: data.user.id,
          email: data.user.email || email,
          full_name: (data.user.user_metadata?.full_name as string) || null,
          role: 'authenticated',
          session_id: data.user.id,
          auth_provider: 'supabase_gotrue',
          created_at: data.user.created_at,
        },
      };
    }
  }

  // 2. Verify against Supabase PostgreSQL `auth.users` using pgcrypto `crypt()`
  const pool = getPool();
  if (pool && isDatabaseUrlConfigured()) {
    const res = await pool.query<{
      id: string;
      email: string;
      raw_user_meta_data: { full_name?: string } | null;
      created_at: string;
      password_matches: boolean;
    }>(
      `SELECT
         id,
         email,
         raw_user_meta_data,
         created_at,
         (encrypted_password IS NOT NULL AND encrypted_password = crypt($2, encrypted_password)) AS password_matches
       FROM auth.users
       WHERE lower(email) = $1
         AND deleted_at IS NULL
         AND (banned_until IS NULL OR banned_until <= NOW())
       LIMIT 1`,
      [email, password]
    );

    const row = res.rows[0];
    if (!row || !row.password_matches) {
      throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO auth.sessions (id, user_id, created_at, updated_at, not_after)
       VALUES ($1::uuid, $2::uuid, NOW(), NOW(), NOW() + ($3 || ' seconds')::interval)`,
      [sessionId, row.id, String(SESSION_TTL_SECONDS)]
    );

    await pool.query(
      `UPDATE auth.users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
      [row.id]
    );

    const fullName = row.raw_user_meta_data?.full_name || null;
    const issued = issueSignedAccessToken({
      id: row.id,
      email: row.email,
      full_name: fullName,
      session_id: sessionId,
    });

    return {
      access_token: issued.token,
      token_type: 'bearer',
      expires_in: issued.expiresIn,
      expires_at: issued.expiresAt,
      user: {
        id: row.id,
        email: row.email,
        full_name: fullName,
        role: 'authenticated',
        session_id: sessionId,
        auth_provider: 'supabase_pg_auth',
        created_at: new Date(row.created_at).toISOString(),
      },
    };
  }

  // 3. Fallback when DATABASE_URL is not configured
  const memUser = memoryUsersByEmail.get(email);
  if (!memUser) {
    throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }
  const computedHash = crypto
    .scryptSync(password, memUser.password_salt, 64)
    .toString('hex');
  if (
    !crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(memUser.password_hash, 'hex')
    )
  ) {
    throw new AuthError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const sessionId = crypto.randomUUID();
  const issued = issueSignedAccessToken({
    id: memUser.id,
    email: memUser.email,
    full_name: memUser.full_name,
    session_id: sessionId,
  });
  memoryActiveSessions.set(sessionId, {
    user_id: memUser.id,
    expires_at: issued.expiresAt,
  });

  return {
    access_token: issued.token,
    token_type: 'bearer',
    expires_in: issued.expiresIn,
    expires_at: issued.expiresAt,
    user: {
      id: memUser.id,
      email: memUser.email,
      full_name: memUser.full_name,
      role: 'authenticated',
      session_id: sessionId,
      auth_provider: 'memory_fallback',
      created_at: memUser.created_at,
    },
  };
}

/**
 * Verifies a Bearer token and returns the authenticated user identity.
 * Rejects missing, tampered, expired, or signed-out tokens with 401 AuthError.
 */
export async function verifyAccessToken(rawToken: string | undefined | null): Promise<AuthenticatedUser> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    throw new AuthError(
      'Authentication required. Please sign in and provide a valid Bearer token.',
      401,
      'MISSING_TOKEN'
    );
  }

  const token = rawToken.trim();

  // 1. Try local HMAC-SHA256 verification + Supabase `auth.sessions` active session check
  let localClaims: SignedJwtClaims | null = null;
  let localVerifyError: AuthError | null = null;
  try {
    localClaims = verifyLocalJwtSignature(token);
  } catch (err) {
    if (err instanceof AuthError) {
      localVerifyError = err;
    }
  }

  if (localClaims) {
    const pool = getPool();
    if (pool && isDatabaseUrlConfigured()) {
      const sessionRes = await pool.query<{
        session_id: string;
        user_id: string;
        email: string;
        raw_user_meta_data: { full_name?: string } | null;
        created_at: string;
      }>(
        `SELECT
           s.id AS session_id,
           u.id AS user_id,
           u.email,
           u.raw_user_meta_data,
           u.created_at
         FROM auth.sessions s
         INNER JOIN auth.users u ON u.id = s.user_id
         WHERE s.id = $1::uuid
           AND s.user_id = $2::uuid
           AND (s.not_after IS NULL OR s.not_after > NOW())
           AND u.deleted_at IS NULL
           AND (u.banned_until IS NULL OR u.banned_until <= NOW())
         LIMIT 1`,
        [localClaims.session_id, localClaims.sub]
      );

      const active = sessionRes.rows[0];
      if (!active) {
        throw new AuthError(
          'Session has been signed out or expired. Please sign in again.',
          401,
          'SESSION_REVOKED'
        );
      }

      return {
        id: active.user_id,
        email: active.email,
        full_name: active.raw_user_meta_data?.full_name || localClaims.full_name || null,
        role: 'authenticated',
        session_id: active.session_id,
        auth_provider: 'supabase_pg_auth',
        created_at: new Date(active.created_at).toISOString(),
      };
    }

    // Memory fallback verification
    const memSession = memoryActiveSessions.get(localClaims.session_id);
    if (!memSession || memSession.user_id !== localClaims.sub) {
      throw new AuthError('Session has been signed out or expired.', 401, 'SESSION_REVOKED');
    }
    return {
      id: localClaims.sub,
      email: localClaims.email,
      full_name: localClaims.full_name,
      role: 'authenticated',
      session_id: localClaims.session_id,
      auth_provider: 'memory_fallback',
      created_at: new Date(localClaims.iat * 1000).toISOString(),
    };
  }

  // 2. If official Supabase GoTrue client is configured, verify via `supabase.auth.getUser(token)`
  const supClient = getSupabaseServerClient();
  if (supClient) {
    const { data, error } = await supClient.auth.getUser(token);
    if (!error && data.user) {
      return {
        id: data.user.id,
        email: data.user.email || '',
        full_name: (data.user.user_metadata?.full_name as string) || null,
        role: 'authenticated',
        session_id: data.user.id,
        auth_provider: 'supabase_gotrue',
        created_at: data.user.created_at,
      };
    }
  }

  throw (
    localVerifyError ||
    new AuthError('Invalid or expired authentication token.', 401, 'INVALID_TOKEN')
  );
}

/**
 * Invalidates the active session in Supabase `auth.sessions` (and memory fallback) upon sign-out.
 */
export async function signOutSession(rawToken: string | undefined | null): Promise<void> {
  if (!rawToken) return;
  try {
    const claims = verifyLocalJwtSignature(rawToken.trim());
    const pool = getPool();
    if (pool && isDatabaseUrlConfigured()) {
      await pool.query(
        `DELETE FROM auth.sessions WHERE id = $1::uuid AND user_id = $2::uuid`,
        [claims.session_id, claims.sub]
      );
    }
    memoryActiveSessions.delete(claims.session_id);
  } catch {
    // Even if token is already expired, sign-out succeeds idempotently
  }
}
