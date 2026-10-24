import React, { useState, useEffect } from 'react';
import {
  signInWithEmail,
  signUpWithEmail,
  enterReadOnlyDemoMode,
  fetchPublicAuthConfig,
  type PublicAuthConfig,
  type ClientAuthSession,
} from '../lib/supabase';
import { GreenLoopLogo, FarmSealSvg } from './GreenLoopLogo';

interface AuthScreenProps {
  expiredNotice: string | null;
  onAuthenticated: (session: ClientAuthSession) => void;
  onEnterDemoMode: () => void;
}

export function AuthScreen({
  expiredNotice,
  onAuthenticated,
  onEnterDemoMode,
}: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<PublicAuthConfig | null>(null);

  useEffect(() => {
    fetchPublicAuthConfig()
      .then((cfg) => setAuthConfig(cfg))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const session =
        mode === 'signup'
          ? await signUpWithEmail({
              email: trimmedEmail,
              password,
              full_name: fullName.trim() || undefined,
            })
          : await signInWithEmail({
              email: trimmedEmail,
              password,
            });
      onAuthenticated(session);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleExploreDemo() {
    enterReadOnlyDemoMode();
    onEnterDemoMode();
  }

  return (
    <div className="min-h-screen bg-transparent text-on-surface flex flex-col justify-between">
      {/* Top Bar — CraveQuest Field Journal Header */}
      <header className="w-full bg-surface-container-lowest/95 backdrop-blur-md border-b-[2.5px] border-primary shadow-[0_4px_0_0_#012d1d]">
        <div className="h-20 max-w-7xl mx-auto px-margin lg:px-margin-desktop flex items-center justify-between gap-gutter">
          <div className="flex items-center gap-space-md shrink-0">
            <GreenLoopLogo size="md" />
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border-2 border-primary shadow-[2px_2px_0px_#012d1d]">
              <FarmSealSvg className="w-5 h-5" />
              <span className="font-label-sm text-label-sm text-primary font-bold">
                Cadastral &amp; Crop Ledger
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-space-xs px-3 py-1.5 rounded-full bg-secondary-fixed border-2 border-primary shadow-[2px_2px_0px_#012d1d]">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span className="font-label-sm text-label-sm text-on-secondary-fixed font-bold uppercase">
                {authConfig?.rls_enabled
                  ? 'Supabase Auth · PostgreSQL RLS Active'
                  : 'Supabase Multi-User Isolation'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Split Container */}
      <main className="flex-1 flex items-center justify-center px-margin lg:px-margin-desktop py-space-xl">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
          {/* Left Agronomic & Security Context Panel (7 cols) */}
          <div className="lg:col-span-7 bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-lg brutal-shadow-lg flex flex-col justify-between space-y-6 relative">
            {/* Decorative vintage tape strip */}
            <div className="absolute -top-3 left-10 w-44 h-7 bg-tertiary-fixed border border-primary rotate-1 shadow-[2px_2px_0px_#012d1d] pointer-events-none flex items-center justify-center">
              <span className="font-label-sm text-label-sm text-primary tracking-widest uppercase font-bold">
                DISPATCH #882 · LEDGER
              </span>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center gap-space-xs">
                <span className="px-3 py-1 rounded-full bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm uppercase flex items-center gap-1.5 shadow-[2px_2px_0px_#012d1d] font-bold">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  Verified Multi-User Farm Workspace
                </span>
                <span className="px-3 py-1 rounded-full bg-tertiary-fixed text-tertiary border border-primary font-label-sm text-label-sm uppercase shadow-[2px_2px_0px_#012d1d] font-bold">
                  GS1 & GAP Ready
                </span>
              </div>

              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight leading-tight">
                Traceable crop planning, field logs, and measured harvests.
              </h1>

              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Sign in or register your farmer account to manage private land holdings, seasonal
                crop cycles, dated cultivation inputs, and verified harvest grades backed by
                Supabase PostgreSQL Row-Level Security.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter pt-2">
                <div className="bg-surface-container-low border-2 border-primary rounded-xl p-4 space-y-1.5 brutal-shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-label-md text-label-md text-primary font-bold uppercase">
                      Strict Account Isolation
                    </p>
                    <span className="material-symbols-outlined text-secondary text-[20px]">
                      verified_user
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Every farm, plot, crop cycle, cultivation log, and harvest batch is bound to
                    your verified Supabase user ID (<span className="font-mono font-bold text-primary">auth.uid()</span>).
                  </p>
                </div>

                <div className="bg-surface-container-low border-2 border-primary rounded-xl p-4 space-y-1.5 brutal-shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-label-md text-label-md text-primary font-bold uppercase">
                      Honest Agronomic Records
                    </p>
                    <span className="material-symbols-outlined text-secondary text-[20px]">
                      menu_book
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Distinguishes unrecorded costs (<span className="font-mono font-bold text-primary">null</span>) from
                    zero-cost farm-saved inputs (<span className="font-mono font-bold text-primary">0</span>) with
                    farmer-verified quality grading.
                  </p>
                </div>
              </div>
            </div>

            {/* Read-Only Demo Workspace Card */}
            <div className="bg-tertiary-fixed/40 border-2 border-primary rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 brutal-shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-label-md text-label-md font-bold text-primary uppercase">
                  <span className="material-symbols-outlined text-[18px] text-secondary">
                    visibility
                  </span>
                  <span>Evaluating Green Loop?</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Inspect the pre-populated Sahyadri Cooperative dataset in isolated{' '}
                  <strong className="text-primary">Read-Only Demo Mode</strong> without mixing demo data into private
                  accounts.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExploreDemo}
                className="px-4 py-2.5 rounded-lg bg-surface-container-lowest hover:bg-secondary-fixed text-primary border-2 border-primary font-label-md text-label-md font-bold brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Explore Read-Only Demo</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* Right Authentication Card (5 cols) */}
          <div className="lg:col-span-5 bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-lg brutal-shadow-lg flex flex-col justify-between space-y-6 relative">
            <div className="space-y-5">
              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-surface-container-low rounded-xl border-2 border-primary">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className={`py-2 rounded-lg font-label-md text-label-md font-bold transition-all cursor-pointer ${
                    mode === 'signin'
                      ? 'bg-primary-container text-on-primary border-2 border-primary shadow-[2px_2px_0px_#012d1d]'
                      : 'text-on-surface-variant hover:text-primary border-2 border-transparent'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className={`py-2 rounded-lg font-label-md text-label-md font-bold transition-all cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-primary-container text-on-primary border-2 border-primary shadow-[2px_2px_0px_#012d1d]'
                      : 'text-on-surface-variant hover:text-primary border-2 border-transparent'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <div>
                <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-secondary uppercase font-bold">
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>Field Terminal Access</span>
                </div>
                <h2 className="font-headline-md text-headline-md text-primary mt-0.5">
                  {mode === 'signin' ? 'Sign in to your farm workspace' : 'Register farmer account'}
                </h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  {mode === 'signin'
                    ? 'Enter your registered email and password to access your private holdings.'
                    : 'Create an isolated workspace backed by Supabase PostgreSQL.'}
                </p>
              </div>

              {expiredNotice && (
                <div
                  role="alert"
                  className="bg-tertiary-fixed border-2 border-primary rounded-lg p-3 font-body-sm text-body-sm text-on-tertiary-fixed flex items-start gap-2 brutal-shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                    warning
                  </span>
                  <span>{expiredNotice}</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="bg-error-container border-2 border-error rounded-lg p-3 font-body-sm text-body-sm text-on-error-container flex items-start gap-2 brutal-shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                    error
                  </span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-full-name"
                      className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                    >
                      Farmer or Cooperative Name (optional)
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined text-primary text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                        person
                      </span>
                      <input
                        id="auth-full-name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g., Rameshwar Patil"
                        className="w-full pl-9 pr-3 py-2.5 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48] transition-all"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                  >
                    Email Address *
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined text-primary text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                      mail
                    </span>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="farmer@example.com"
                      className="w-full pl-9 pr-3 py-2.5 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                  >
                    Password {mode === 'signup' ? '(minimum 8 characters) *' : '*'}
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined text-primary text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                      key
                    </span>
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={mode === 'signup' ? 8 : 1}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter password'}
                      className="w-full pl-9 pr-3 py-2.5 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48] transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-secondary hover:bg-secondary/95 text-on-secondary font-label-lg text-label-lg font-bold border-[2.5px] border-primary brutal-shadow hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-60 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {mode === 'signin' ? 'login' : 'how_to_reg'}
                  </span>
                  <span>
                    {submitting
                      ? mode === 'signin'
                        ? 'Verifying credentials...'
                        : 'Creating farmer account...'
                      : mode === 'signin'
                        ? 'Sign In to Workspace'
                        : 'Create Farmer Account'}
                  </span>
                </button>
              </form>
            </div>

            <div className="pt-4 border-t-2 border-dashed border-primary/25 font-body-sm text-body-sm text-on-surface-variant space-y-1">
              <p className="font-label-sm text-label-sm font-bold text-primary uppercase">
                Security & Privacy Protocol
              </p>
              <p className="text-[12px]">
                Passwords are encrypted via Supabase PostgreSQL <span className="font-mono font-bold text-primary">pgcrypto</span>{' '}
                bcrypt hashing in <span className="font-mono font-bold text-primary">auth.users</span>. Client-supplied{' '}
                <span className="font-mono font-bold text-primary">X-Owner-Id</span> headers are never trusted.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — CraveQuest Field Journal Ledger Footer */}
      <footer className="w-full bg-surface-container-lowest border-t-[3px] border-primary shadow-[0_-4px_0_0_#012d1d]">
        <div className="max-w-7xl mx-auto px-margin lg:px-margin-desktop py-space-md flex flex-col sm:flex-row items-center justify-between gap-space-sm font-label-sm text-label-sm text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
            <span className="text-primary font-bold">
              GREEN LOOP AGROTECH FIELD JOURNAL · PROTECTED BY VERIFIED BEARER TOKEN &amp; POSTGRESQL RLS
            </span>
          </div>
          <div className="flex items-center gap-space-md">
            <span>LEDGER NODE: #4092-A</span>
            <span>TLS VERIFIED</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
