import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ClientAuthUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'authenticated';
  session_id: string;
  auth_provider: 'supabase_gotrue' | 'supabase_pg_auth' | 'memory_fallback';
  created_at: string;
}

export interface ClientAuthSession {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: number;
  user: ClientAuthUser;
}

export interface PublicAuthConfig {
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_anon_key_configured: boolean;
  supabase_pg_auth_available: boolean;
  active_auth_mode: 'supabase_gotrue_and_pg' | 'supabase_pg_auth' | 'memory_fallback';
  rls_enabled: boolean;
  missing_optional_env_vars: string[];
}

const SESSION_STORAGE_KEY = 'green_loop_supabase_auth_session_v1';
const DEMO_MODE_STORAGE_KEY = 'green_loop_read_only_demo_mode_v1';

let supabaseBrowserClient: SupabaseClient | null = null;
let currentSession: ClientAuthSession | null = null;
let readOnlyDemoMode = false;

type SessionListener = ( state: {
  session: ClientAuthSession | null;
  isDemoMode: boolean;
  expiredReason?: string | null;
}) => void;

const listeners = new Set<SessionListener>();

function emitChange(expiredReason?: string | null) {
  for (const listener of listeners) {
    listener({
      session: currentSession,
      isDemoMode: readOnlyDemoMode,
      expiredReason: expiredReason ?? null,
    });
  }
}

export function subscribeAuthState(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStoredSession(): ClientAuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientAuthSession;
    if (!parsed?.access_token || !parsed?.user?.id) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof parsed.expires_at === 'number' && parsed.expires_at <= nowSec) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(session: ClientAuthSession | null) {
  currentSession = session;
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
      readOnlyDemoMode = false;
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getActiveAccessToken(): string | null {
  if (!currentSession) {
    currentSession = readStoredSession();
  }
  if (!currentSession) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof currentSession.expires_at === 'number' && currentSession.expires_at <= nowSec) {
    persistSession(null);
    return null;
  }
  return currentSession.access_token;
}

export function getActiveSession(): ClientAuthSession | null {
  if (!currentSession) {
    currentSession = readStoredSession();
  }
  return currentSession;
}

export function isReadOnlyDemoModeActive(): boolean {
  if (currentSession) return false;
  try {
    return readOnlyDemoMode || window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return readOnlyDemoMode;
  }
}

export function enterReadOnlyDemoMode(): void {
  persistSession(null);
  readOnlyDemoMode = true;
  try {
    window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
  } catch {
    // Ignore
  }
  emitChange(null);
}

export function exitReadOnlyDemoMode(): void {
  readOnlyDemoMode = false;
  try {
    window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch {
    // Ignore
  }
  emitChange(null);
}

export function notifySessionExpired(reason = 'Your session has expired. Please sign in again.'): void {
  persistSession(null);
  readOnlyDemoMode = false;
  try {
    window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch {
    // Ignore
  }
  emitChange(reason);
}

export async function fetchPublicAuthConfig(): Promise<PublicAuthConfig> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) {
    throw new Error('Failed to load authentication configuration');
  }
  const config = (await res.json()) as PublicAuthConfig;

  const viteUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || config.supabase_url;
  const viteAnonKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || config.supabase_anon_key;

  if (viteUrl && viteAnonKey && !supabaseBrowserClient) {
    supabaseBrowserClient = createClient(viteUrl, viteAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return config;
}

export async function restoreVerifiedSession(): Promise<{
  session: ClientAuthSession | null;
  isDemoMode: boolean;
  expiredReason: string | null;
}> {
  const stored = readStoredSession();
  if (!stored) {
    const demo = isReadOnlyDemoModeActive();
    readOnlyDemoMode = demo;
    return { session: null, isDemoMode: demo, expiredReason: null };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof stored.expires_at === 'number' && stored.expires_at <= nowSec) {
    persistSession(null);
    return {
      session: null,
      isDemoMode: false,
      expiredReason: 'Your authentication session has expired. Please sign in again.',
    };
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${stored.access_token}`,
      },
    });
    if (!res.ok) {
      persistSession(null);
      return {
        session: null,
        isDemoMode: false,
        expiredReason: 'Your previous session is no longer active. Please sign in again.',
      };
    }
    const payload = (await res.json()) as { data: ClientAuthUser };
    const verifiedSession: ClientAuthSession = {
      ...stored,
      user: payload.data,
    };
    persistSession(verifiedSession);
    return { session: verifiedSession, isDemoMode: false, expiredReason: null };
  } catch {
    return { session: stored, isDemoMode: false, expiredReason: null };
  }
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  full_name?: string;
}): Promise<ClientAuthSession> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issueMsg = Array.isArray(body.issues) && body.issues[0]?.message;
    throw new Error(issueMsg || body.error || 'Failed to register account.');
  }
  const session = body.data as ClientAuthSession;
  persistSession(session);
  emitChange(null);
  return session;
}

export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<ClientAuthSession> {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issueMsg = Array.isArray(body.issues) && body.issues[0]?.message;
    throw new Error(issueMsg || body.error || 'Invalid email or password.');
  }
  const session = body.data as ClientAuthSession;
  persistSession(session);
  emitChange(null);
  return session;
}

export async function signOutCurrentUser(): Promise<void> {
  const token = getActiveAccessToken();
  try {
    if (token) {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
    if (supabaseBrowserClient) {
      await supabaseBrowserClient.auth.signOut().catch(() => {});
    }
  } finally {
    persistSession(null);
    readOnlyDemoMode = false;
    try {
      window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    } catch {
      // Ignore
    }
    emitChange(null);
  }
}
