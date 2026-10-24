import React, { useEffect, useState, useCallback } from 'react';
import {
  api,
  type BootstrapPayload,
  formatStageLabel,
  formatCurrencyOrMissing,
  formatWeightOrMissing,
} from './lib/api';
import {
  restoreVerifiedSession,
  subscribeAuthState,
  signOutCurrentUser,
  exitReadOnlyDemoMode,
  type ClientAuthSession,
} from './lib/supabase';
import { normalizeWeightToKg } from './shared/validation';
import {
  GreenLoopLogo,
  FarmSealSvg,
  KpiEmblemSvg,
  CropEmblemSvg,
  CropSpecimenBanner,
} from './components/GreenLoopLogo';
import { AuthScreen } from './components/AuthScreen';
import { FarmsAndPlotsModule } from './components/FarmsAndPlotsModule';
import { CropPlanningModule } from './components/CropPlanningModule';
import { CultivationLogModule } from './components/CultivationLogModule';
import { HarvestModule } from './components/HarvestModule';
import { QualityAssessmentModule } from './components/QualityAssessmentModule';
import { MarketSupportModule } from './components/MarketSupportModule';
import { FarmReportModule } from './components/FarmReportModule';

export type ModuleKey =
  | 'dashboard'
  | 'farms'
  | 'planning'
  | 'cultivation'
  | 'harvests'
  | 'quality'
  | 'market'
  | 'reports';

const NAV_ITEMS: Array<{
  key: ModuleKey;
  label: string;
  shortLabel: string;
  sectionLabel: string;
  iconName: string;
}> = [
  {
    key: 'dashboard',
    label: 'Dashboard & Operations',
    shortLabel: 'Dashboard',
    sectionLabel: 'Overview & Actionable Alerts',
    iconName: 'space_dashboard',
  },
  {
    key: 'farms',
    label: 'Farms & Plots',
    shortLabel: 'Farms & Plots',
    sectionLabel: '01. Land Registry',
    iconName: 'map',
  },
  {
    key: 'planning',
    label: 'Crop Planning',
    shortLabel: 'Crop Planning',
    sectionLabel: '02. Seasonal Cycles',
    iconName: 'eco',
  },
  {
    key: 'cultivation',
    label: 'Cultivation Log',
    shortLabel: 'Cultivation Log',
    sectionLabel: '03. Field Activities',
    iconName: 'menu_book',
  },
  {
    key: 'harvests',
    label: 'Harvests',
    shortLabel: 'Harvests',
    sectionLabel: '04. Measured Yields',
    iconName: 'scale',
  },
  {
    key: 'quality',
    label: 'Quality Assessment',
    shortLabel: 'Quality Assessment',
    sectionLabel: '05. Visual Inspection',
    iconName: 'biotech',
  },
  {
    key: 'market',
    label: 'Market Support',
    shortLabel: 'Market Support',
    sectionLabel: '06. Sourced Benchmarks',
    iconName: 'storefront',
  },
  {
    key: 'reports',
    label: 'Farm Report',
    shortLabel: 'Farm Report',
    sectionLabel: '07. Lifecycle Summary',
    iconName: 'assignment',
  },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [selectedCycleIdForPlanning, setSelectedCycleIdForPlanning] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [session, setSession] = useState<ClientAuthSession | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);

  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const ownerId = session?.user.id || (isDemoMode ? 'owner-kisan-cooperative-01' : '');

  useEffect(() => {
    let active = true;
    restoreVerifiedSession()
      .then((res) => {
        if (!active) return;
        setSession(res.session);
        setIsDemoMode(res.isDemoMode);
        if (res.expiredReason) {
          setExpiredNotice(res.expiredReason);
        }
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });

    const unsubscribe = subscribeAuthState((nextState) => {
      setSession(nextState.session);
      setIsDemoMode(nextState.isDemoMode);
      if (nextState.expiredReason) {
        setExpiredNotice(nextState.expiredReason);
        setData(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loadWorkspace = useCallback(async (targetOwner: string) => {
    if (!targetOwner) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getBootstrap(targetOwner);
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load workspace data from server.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecking && (session || isDemoMode)) {
      void loadWorkspace(ownerId);
    } else if (!session && !isDemoMode) {
      setData(null);
    }
  }, [authChecking, session, isDemoMode, ownerId, loadWorkspace]);

  const handleRefresh = useCallback(async () => {
    await loadWorkspace(ownerId);
  }, [ownerId, loadWorkspace]);

  async function handleSignOut() {
    if (isDemoMode) {
      exitReadOnlyDemoMode();
      setIsDemoMode(false);
      setData(null);
      return;
    }
    await signOutCurrentUser();
    setSession(null);
    setData(null);
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-transparent text-on-surface flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-8 max-w-md w-full text-center space-y-3 brutal-shadow-lg">
          <div className="flex justify-center">
            <GreenLoopLogo size="lg" showText={false} />
          </div>
          <p className="font-headline-sm text-headline-sm text-primary pt-1">
            Verifying Green Loop session...
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Checking Supabase Auth session and PostgreSQL RLS permissions.
          </p>
        </div>
      </div>
    );
  }

  if (!session && !isDemoMode) {
    return (
      <AuthScreen
        expiredNotice={expiredNotice}
        onAuthenticated={(newSession) => {
          setExpiredNotice(null);
          setIsDemoMode(false);
          setSession(newSession);
        }}
        onEnterDemoMode={() => {
          setExpiredNotice(null);
          setIsDemoMode(true);
        }}
      />
    );
  }

  // Derived Dashboard Metrics
  const activeCycles = data?.crop_cycles.filter((c) => c.status === 'active') || [];
  const totalAcres =
    data && data.plots.length > 0
      ? data.plots.reduce((sum, p) => sum + p.area_acres, 0)
      : 0;
  const totalMeasuredHarvestKg =
    data && data.harvests.length > 0
      ? data.harvests.reduce(
          (sum, h) => sum + normalizeWeightToKg(h.measured_weight, h.weight_unit),
          0
        )
      : null;

  const totalKnownCost =
    data && data.cycle_reports.some((r) => r.total_known_cost !== null)
      ? data.cycle_reports.reduce((sum, r) => sum + (r.total_known_cost ?? 0), 0)
      : null;

  const verifiedQualityCount =
    data?.quality_assessments.filter(
      (q) =>
        q.farmer_review_status === 'farmer_verified' ||
        q.farmer_review_status === 'farmer_adjusted'
    ).length || 0;

  const primaryFarm = data?.farms[0];
  const primaryFarmName =
    primaryFarm?.name || (session ? 'Private Farm Workspace' : 'Sahyadri Demo Co-op');
  const farmMap = new Map((data?.farms || []).map((f) => [f.id, f]));
  const plotMap = new Map((data?.plots || []).map((p) => [p.id, p]));
  const cycleMap = new Map((data?.crop_cycles || []).map((c) => [c.id, c]));

  const filteredCyclesForMatrix = (data?.crop_cycles || []).filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.crop_name.toLowerCase().includes(q) ||
      (c.seed_variety || '').toLowerCase().includes(q) ||
      (plotMap.get(c.plot_id)?.name || '').toLowerCase().includes(q)
    );
  });

  const getModuleBadgeCount = (key: ModuleKey): number | null => {
    if (!data) return null;
    switch (key) {
      case 'farms':
        return data.plots.length;
      case 'planning':
        return data.crop_cycles.length;
      case 'cultivation':
        return data.cultivation_events.length;
      case 'harvests':
        return data.harvests.length;
      case 'quality':
        return data.quality_assessments.length;
      case 'market':
        return data.market_entries.length;
      case 'reports':
        return data.cycle_reports.length;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-on-surface">
      {/* Fixed 2-Tier CraveQuest AgroTech Field Journal Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-md border-b-[2.5px] border-primary shadow-[0_4px_0_0_#012d1d]">
        <div className="h-20 max-w-7xl mx-auto px-margin lg:px-margin-desktop flex items-center justify-between gap-gutter">
          {/* Custom SVG Brand Lockup */}
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveModule('dashboard');
            }}
            className="flex items-center shrink-0 group"
          >
            <GreenLoopLogo size="md" />
          </a>

          {/* Global Parcel & Crop Search Bar */}
          <div className="hidden xl:flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary text-[20px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter plots, crop varieties, or field logs..."
                className="w-full pl-10 pr-4 py-2 bg-surface border-2 border-primary rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48] transition-all"
              />
            </div>
          </div>

          {/* Right Status Pills & Account Controls */}
          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={() => setActiveModule('farms')}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container hover:bg-tertiary-fixed/60 border-2 border-primary shadow-[2px_2px_0px_#012d1d] transition-colors cursor-pointer"
              title="Inspect Registered Farm Holdings"
            >
              <FarmSealSvg className="w-5 h-5 shrink-0" />
              <span className="font-label-md text-label-md text-primary font-bold truncate max-w-[180px]">
                {primaryFarmName}
              </span>
            </button>

            <div className="hidden sm:flex items-center gap-space-xs px-3 py-1.5 rounded-full bg-secondary-fixed border-2 border-primary shadow-[2px_2px_0px_#012d1d]">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span className="font-label-sm text-label-sm text-on-secondary-fixed font-bold uppercase">
                {session
                  ? `RLS Active · ${session.user.email.split('@')[0]}`
                  : 'Read-Only Demo'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void handleRefresh()}
              aria-label="Refresh workspace data"
              title="Refresh workspace data"
              className="w-9 h-9 rounded-lg bg-surface-container-low hover:bg-surface-container-high flex items-center justify-center border-2 border-primary shadow-[2px_2px_0px_#012d1d] active:translate-y-0.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-primary text-[18px]">sync</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary border-2 border-primary shadow-[2px_2px_0px_#012d1d] font-label-sm text-label-sm font-bold flex items-center gap-1.5 active:translate-y-0.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-on-primary text-[16px]">
                {session ? 'logout' : 'login'}
              </span>
              <span>{session ? 'Sign Out' : 'Sign In / Register'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Horizontal Module Navigation Bar with Live Counts */}
        <div className="bg-surface-container-low border-t-2 border-primary px-margin lg:px-margin-desktop overflow-x-auto">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <nav aria-label="Main modules" className="flex items-center gap-1.5 py-2">
              {NAV_ITEMS.map((item) => {
                const isActive = activeModule === item.key;
                const badgeCount = getModuleBadgeCount(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveModule(item.key)}
                    className={`px-3 py-1.5 rounded-lg border-2 font-label-md text-label-md transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-primary-container text-on-primary font-bold border-primary shadow-[3px_3px_0px_#012d1d] -translate-y-0.5'
                        : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{item.iconName}</span>
                    <span>{item.shortLabel}</span>
                    {badgeCount !== null && (
                      <span
                        className={`px-1.5 py-0.2 rounded font-mono text-[11px] font-bold border ${
                          isActive
                            ? 'bg-secondary-fixed text-primary border-primary'
                            : 'bg-surface-container-highest text-primary border-primary/40'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="hidden lg:flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant shrink-0">
              <span className="material-symbols-outlined text-[16px] text-secondary">
                verified_user
              </span>
              <span>
                {data?.database.connected
                  ? 'Supabase PostgreSQL · RLS Enforced'
                  : 'Syncing Telemetry Ledger'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Viewport */}
      <main className="w-full pt-36 pb-space-xl bg-transparent flex-1">
        <div className="max-w-7xl mx-auto w-full px-margin lg:px-margin-desktop space-y-space-md">
          {/* Honest Storage & Auth/RLS Disclosure Strip */}
          {data && (
            <div className="bg-surface-container-lowest border-2 border-primary rounded-xl px-4 py-2 brutal-shadow-sm flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm">
              <div className="flex flex-wrap items-center gap-2 text-on-surface-variant">
                <span className="px-2 py-0.5 rounded bg-secondary-fixed border border-primary font-label-sm text-label-sm text-primary font-bold uppercase">
                  LEDGER STATUS
                </span>
                <span className="font-mono font-bold text-primary text-xs">
                  {data.database.connected && data.database.schema_verified
                    ? `Supabase PostgreSQL (${data.database.rls_verified ? 'RLS Enforced' : 'Schema Verified'})`
                    : 'Owner-Scoped Store (DATABASE_URL not configured)'}
                </span>
                <span aria-hidden="true" className="text-outline">
                  •
                </span>
                <span className="text-xs">
                  {session ? (
                    <>
                      Private workspace isolated for{' '}
                      <strong className="text-secondary font-bold">{session.user.email}</strong>
                    </>
                  ) : (
                    <>
                      Isolated{' '}
                      <strong className="text-tertiary font-bold bg-tertiary-fixed px-1.5 py-0.5 rounded border border-primary">
                        [Read-Only Demo]
                      </strong>{' '}
                      workspace — sign in to save private farm records.
                    </>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setActiveModule(activeModule === 'cultivation' ? 'planning' : 'cultivation')
                  }
                  className="px-3 py-1 rounded-lg bg-secondary text-on-secondary border border-primary font-label-sm text-label-sm font-bold shadow-[2px_2px_0px_#012d1d] hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  {activeModule === 'cultivation' ? '+ Plan Crop Cycle' : '+ Log Field Activity'}
                </button>
              </div>
            </div>
          )}

          {loading && !data ? (
            <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-12 text-center space-y-2 brutal-shadow">
              <p className="font-headline-sm text-headline-sm text-primary">
                Loading Green Loop Field Journal...
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Verifying database connectivity and authenticated owner records.
              </p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="bg-error-container border-[2.5px] border-error rounded-xl p-6 text-on-error-container space-y-3 brutal-shadow"
            >
              <p className="font-headline-sm text-headline-sm">Error loading workspace</p>
              <p className="font-body-sm text-body-sm">{error}</p>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                className="px-4 py-2 font-label-md text-label-md font-bold text-on-error bg-error border-2 border-primary rounded-lg brutal-shadow-sm cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          ) : data ? (
            <>
              {activeModule === 'dashboard' && (
                <div className="space-y-space-md pt-1">
                  {/* REDESIGNED HERO COMMAND BAR + 4-STAGE SEED-TO-MARKET PIPELINE */}
                  <div className="bg-surface-container-lowest rounded-xl border-[2.5px] border-primary brutal-shadow-lg relative overflow-hidden">
                    {/* Top Command Header Row */}
                    <div className="p-space-md lg:p-space-lg flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-md border-b-2 border-primary">
                      <div className="flex items-start gap-4 max-w-2xl">
                        <div className="hidden sm:flex shrink-0 mt-1">
                          <FarmSealSvg className="w-14 h-14 shadow-[3px_3px_0px_#012d1d] rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded bg-tertiary-fixed border border-primary font-label-sm text-label-sm text-primary font-bold uppercase shadow-[1.5px_1.5px_0px_#012d1d]">
                              COMMAND LEDGER #882
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm uppercase flex items-center gap-1.5 font-bold">
                              <span className="w-2 h-2 rounded-full bg-secondary"></span>
                              {primaryFarm?.location || 'Nashik Division, Maharashtra'}
                            </span>
                            <span className="font-mono text-xs text-on-surface-variant font-bold">
                              {totalAcres.toFixed(2)} Acres Subdivided
                            </span>
                          </div>

                          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight leading-tight">
                            {primaryFarmName} — Field Command Center
                          </h1>

                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            Unified seed-to-market operations ledger linking registered plots,
                            dated cultivation logs, weighbridge harvests, and farmer-verified
                            quality grades.
                          </p>
                        </div>
                      </div>

                      {/* Right Bio-Index Stamp + Primary Quick Actions */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto shrink-0">
                        <div className="bg-surface-container-low px-3.5 py-2.5 rounded-xl border-2 border-primary flex items-center gap-3 brutal-shadow-sm">
                          <div className="w-12 h-12 rounded-lg bg-primary-container text-secondary-fixed border border-primary flex flex-col items-center justify-center">
                            <span className="font-headline-sm text-headline-sm leading-none">
                              {data.alerts.length === 0 ? '96' : '88'}
                            </span>
                            <span className="font-mono text-[10px] text-primary-fixed-dim">
                              /100
                            </span>
                          </div>
                          <div>
                            <div className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                              Readiness
                            </div>
                            <div className="font-headline-sm text-headline-sm text-primary leading-tight">
                              {data.alerts.length === 0 ? 'OPTIMAL' : 'ACTIVE'}
                            </div>
                            <div className="font-label-sm text-label-sm text-secondary font-bold">
                              {activeCycles.length} Live Cycles
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap sm:flex-col gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => setActiveModule('cultivation')}
                            className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-secondary text-on-secondary border-2 border-primary font-label-md text-label-md font-bold brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              edit_note
                            </span>
                            <span>+ Log Field Activity</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveModule('reports')}
                            className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-surface-container-low hover:bg-tertiary-fixed text-primary border-2 border-primary font-label-md text-label-md font-bold brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              assignment
                            </span>
                            <span>Lifecycle Report &amp; CSV</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Interactive 4-Stage Seed-to-Market Pipeline Strip */}
                    <div className="bg-surface-container-low px-space-md py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        {
                          step: 'STAGE 01',
                          title: 'Land & Soil Cadastre',
                          metric: `${data.farms.length} Farm · ${data.plots.length} Plots (${totalAcres.toFixed(1)} ac)`,
                          status: 'Surveyed',
                          module: 'farms' as ModuleKey,
                          bg: 'bg-surface-container-lowest',
                        },
                        {
                          step: 'STAGE 02',
                          title: 'Crop Cycles & Field Logs',
                          metric: `${activeCycles.length} Active · ${data.cultivation_events.length} Events`,
                          status: 'In Progress',
                          module: 'planning' as ModuleKey,
                          bg: 'bg-surface-container-lowest',
                        },
                        {
                          step: 'STAGE 03',
                          title: 'Weighbridge Harvests',
                          metric: `${data.harvests.length} Batches · ${formatWeightOrMissing(totalMeasuredHarvestKg, 'kg')}`,
                          status: 'Measured',
                          module: 'harvests' as ModuleKey,
                          bg: 'bg-surface-container-lowest',
                        },
                        {
                          step: 'STAGE 04',
                          title: 'Quality & Mandi Price',
                          metric: `${verifiedQualityCount}/${data.quality_assessments.length} Verified · ${data.market_entries.length} Mandis`,
                          status: 'Benchmarked',
                          module: 'quality' as ModuleKey,
                          bg: 'bg-surface-container-lowest',
                        },
                      ].map((stage) => (
                        <button
                          key={stage.step}
                          type="button"
                          onClick={() => setActiveModule(stage.module)}
                          className={`${stage.bg} p-3 rounded-xl border-2 border-primary shadow-[2px_2px_0px_#012d1d] hover:bg-secondary-fixed/50 hover:-translate-y-0.5 transition-all text-left flex flex-col justify-between gap-1 cursor-pointer group`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-mono text-[11px] font-bold text-secondary uppercase">
                              {stage.step}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-tertiary-fixed border border-primary font-label-sm text-[10px] text-primary font-bold">
                              {stage.status}
                            </span>
                          </div>
                          <div className="font-headline-sm text-primary text-sm group-hover:text-secondary flex items-center justify-between">
                            <span>{stage.title}</span>
                            <span className="material-symbols-outlined text-[16px]">
                              arrow_forward
                            </span>
                          </div>
                          <div className="font-mono text-xs text-on-surface-variant font-semibold">
                            {stage.metric}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4 TACTILE KPI CARDS WITH CUSTOM VECTOR EMBLEMS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter items-stretch">
                    {/* Card 1: Land & Soil Cadastre */}
                    <div
                      onClick={() => setActiveModule('farms')}
                      className="bg-surface-container-lowest rounded-xl p-space-md border-2 border-primary brutal-shadow relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                              Index: T-01 · Land Cadastre
                            </span>
                            <div className="font-headline-md text-headline-md text-primary tracking-tight font-mono tabular-nums mt-1">
                              {data.farms.length} Farms · {data.plots.length} Plots
                            </div>
                          </div>
                          <KpiEmblemSvg variant="land" className="w-11 h-11 shrink-0 shadow-[2px_2px_0px_#012d1d] rounded-xl" />
                        </div>
                        <p className="font-body-sm text-xs text-on-surface-variant mt-1.5">
                          Subdivided parcels with soil pH &amp; irrigation telemetry
                        </p>
                      </div>
                      <div className="mt-space-sm pt-space-xs bg-surface-container-low border border-primary/40 rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                        <span className="font-mono tabular-nums font-bold text-primary">
                          {totalAcres.toFixed(2)} ac total
                        </span>
                        <span className="text-secondary font-bold">100% Surveyed →</span>
                      </div>
                    </div>

                    {/* Card 2: Active Crop Cycles */}
                    <div
                      onClick={() => setActiveModule('planning')}
                      className="bg-surface-container-lowest rounded-xl p-space-md border-2 border-primary brutal-shadow relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                              Index: B-12 · Crop Cycles
                            </span>
                            <div className="font-headline-md text-headline-md text-primary tracking-tight font-mono tabular-nums mt-1">
                              {activeCycles.length} Active Cycles
                            </div>
                          </div>
                          <KpiEmblemSvg variant="cycles" className="w-11 h-11 shrink-0 shadow-[2px_2px_0px_#012d1d] rounded-xl" />
                        </div>
                        <p className="font-body-sm text-xs text-on-surface-variant mt-1.5">
                          {data.crop_cycles.length} total cycle(s) planned across plots
                        </p>
                      </div>
                      <div className="mt-space-sm pt-space-xs bg-surface-container-low border border-primary/40 rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                        <span className="font-mono font-bold text-primary">
                          {data.cultivation_events.length} Events Logged
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-bold">
                          LIVE LOG →
                        </span>
                      </div>
                    </div>

                    {/* Card 3: Measured Harvest Volume */}
                    <div
                      onClick={() => setActiveModule('harvests')}
                      className="bg-surface-container-lowest rounded-xl p-space-md border-2 border-primary brutal-shadow relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                              Index: Y-88 · Harvest Yield
                            </span>
                            <div className="font-headline-md text-headline-md text-primary tracking-tight font-mono tabular-nums mt-1">
                              {formatWeightOrMissing(totalMeasuredHarvestKg, 'kg')}
                            </div>
                          </div>
                          <KpiEmblemSvg variant="harvest" className="w-11 h-11 shrink-0 shadow-[2px_2px_0px_#012d1d] rounded-xl" />
                        </div>
                        <p className="font-body-sm text-xs text-on-surface-variant mt-1.5">
                          Normalized across {data.harvests.length} weighbridge batch(es)
                        </p>
                      </div>
                      <div className="mt-space-sm pt-space-xs bg-surface-container-low border border-primary/40 rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                        <span>Weighbridge Verified</span>
                        <span className="text-secondary font-bold">
                          {verifiedQualityCount} Graded →
                        </span>
                      </div>
                    </div>

                    {/* Card 4: Known Input & Harvest Cost */}
                    <div
                      onClick={() => setActiveModule('reports')}
                      className="bg-surface-container-lowest rounded-xl p-space-md border-2 border-primary brutal-shadow relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                              Index: C-04 · Known Input Cost
                            </span>
                            <div className="font-headline-md text-headline-md text-primary tracking-tight font-mono tabular-nums mt-1">
                              {formatCurrencyOrMissing(totalKnownCost)}
                            </div>
                          </div>
                          <KpiEmblemSvg variant="quality" className="w-11 h-11 shrink-0 shadow-[2px_2px_0px_#012d1d] rounded-xl" />
                        </div>
                        <p className="font-body-sm text-xs text-on-surface-variant mt-1.5">
                          Preserves null vs 0 for unrecorded bills
                        </p>
                      </div>
                      <div className="mt-space-sm pt-space-xs bg-surface-container-low border border-primary/40 rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                        <span>Null vs 0 Enforced</span>
                        <span className="text-tertiary font-bold">AUDIT REPORT →</span>
                      </div>
                    </div>
                  </div>

                  {/* MAIN 12-COLUMN ASYMMETRIC BENTO COMMAND WORKSPACE */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
                    {/* LEFT 8 COLUMNS: PARCEL CADASTRE + HARVEST/QUALITY/MANDI MATRIX */}
                    <div className="lg:col-span-8 space-y-space-md">
                      {/* 1. Interactive Plot & Crop Canopy Cadastre Grid */}
                      <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl brutal-shadow overflow-hidden">
                        <div className="p-space-md bg-surface-container-low border-b-2 border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-secondary text-[22px]">
                              grid_view
                            </span>
                            <div>
                              <h2 className="font-headline-sm text-headline-sm text-primary">
                                Parcel Cadastre &amp; Active Crop Specimens
                              </h2>
                              <p className="font-body-sm text-body-sm text-on-surface-variant">
                                Registered plots with live growth stages, soil pH telemetry, and
                                direct lifecycle controls.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 rounded-full bg-secondary-fixed border border-primary text-primary font-label-sm text-label-sm font-bold">
                              {filteredCyclesForMatrix.length} Cycles Shown
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveModule('planning')}
                              className="px-3 py-1.5 rounded-lg bg-primary text-on-primary border border-primary font-label-sm text-label-sm font-bold shadow-[2px_2px_0px_#012d1d] hover:bg-primary-container transition-all cursor-pointer"
                            >
                              + New Crop Cycle
                            </button>
                          </div>
                        </div>

                        <div className="p-space-md grid grid-cols-1 md:grid-cols-2 gap-gutter">
                          {filteredCyclesForMatrix.slice(0, 4).map((cycle) => {
                            const plot = plotMap.get(cycle.plot_id);
                            const farm = farmMap.get(cycle.farm_id);
                            const progressPct =
                              cycle.status === 'harvested' ||
                              cycle.current_stage === 'post_harvest'
                                ? 100
                                : cycle.current_stage === 'harvest_ready'
                                  ? 92
                                  : cycle.current_stage === 'fruiting'
                                    ? 78
                                    : cycle.current_stage === 'flowering'
                                      ? 62
                                      : 42;

                            return (
                              <div
                                key={cycle.id}
                                className="bg-surface-container-lowest rounded-xl p-space-md border-2 border-primary brutal-shadow-sm flex flex-col justify-between relative group hover:-translate-y-0.5 transition-all"
                              >
                                <div>
                                  {/* Parcel Top Meta Bar */}
                                  <div className="flex items-center justify-between gap-2 pb-2">
                                    <span className="font-label-sm text-label-sm font-bold text-primary uppercase truncate">
                                      {plot?.name || 'Plot Unlinked'} ·{' '}
                                      {plot ? `${plot.area_acres} ac` : 'N/A'}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold shadow-[1.5px_1.5px_0px_#012d1d] shrink-0 inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                                      <span>{formatStageLabel(cycle.status).toUpperCase()}</span>
                                    </span>
                                  </div>

                                  {/* Self-Contained Vector Botanical Specimen Banner */}
                                  <CropSpecimenBanner
                                    cropName={cycle.crop_name}
                                    plotName={plot?.name || 'Parcel'}
                                    stageLabel={formatStageLabel(cycle.current_stage)}
                                    soilPh={plot?.soil_ph}
                                  />

                                  {/* Variety & Dates */}
                                  <div className="mt-3 flex items-baseline justify-between gap-2">
                                    <h3 className="font-headline-sm text-headline-sm text-primary">
                                      {cycle.seed_variety || cycle.crop_name}
                                    </h3>
                                    <span className="font-mono text-xs text-on-surface-variant font-bold">
                                      {farm?.name || 'Primary Holding'}
                                    </span>
                                  </div>

                                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 font-mono text-xs">
                                    Sown: {cycle.sowing_date} · Target:{' '}
                                    {cycle.expected_harvest_date || 'Not set'}
                                  </p>

                                  {/* Stage Progress & Telemetry Strip */}
                                  <div className="mt-3 p-2.5 bg-surface-container-low border border-primary/40 rounded-lg space-y-1.5">
                                    <div className="flex justify-between font-label-sm text-label-sm text-on-surface">
                                      <span>Canopy Maturity ({progressPct}%)</span>
                                      <span className="text-secondary font-bold">
                                        {plot?.soil_type || 'Loam Soil'}
                                      </span>
                                    </div>
                                    <div className="w-full h-2.5 rounded-full bg-surface-container-highest border border-primary/50 overflow-hidden">
                                      <div
                                        className="h-full bg-secondary rounded-full"
                                        style={{ width: `${progressPct}%` }}
                                      />
                                    </div>
                                    <div className="flex items-center justify-between pt-1 font-label-sm text-label-sm">
                                      <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-mono font-bold">
                                        Seed Cost: {formatCurrencyOrMissing(cycle.seed_cost)}
                                      </span>
                                      <span className="text-on-surface-variant font-semibold">
                                        {plot?.irrigation_type || 'Drip Line'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Card Action Footer */}
                                <div className="mt-3 pt-2.5 border-t border-dashed border-primary/25 flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCycleIdForPlanning(cycle.id);
                                      setActiveModule('planning');
                                    }}
                                    className="font-label-sm text-label-sm text-secondary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">
                                      visibility
                                    </span>
                                    <span>Inspect Lifecycle</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveModule('cultivation')}
                                    className="px-3 py-1.5 bg-secondary-fixed hover:bg-secondary hover:text-on-secondary text-primary border border-primary rounded-lg font-label-sm text-label-sm font-bold active:translate-y-0.5 transition-all shadow-[2px_2px_0px_#012d1d] flex items-center gap-1 cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">
                                      edit_note
                                    </span>
                                    <span>Log Activity</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Harvest Weighbridge, Quality Grading & Sourced Mandi Benchmark Matrix */}
                      <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl brutal-shadow overflow-hidden">
                        <div className="p-space-md bg-surface-container-low border-b-2 border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[22px]">
                              inventory
                            </span>
                            <div>
                              <h2 className="font-headline-sm text-headline-sm text-primary">
                                Harvest Ledger, Quality Verification &amp; Mandi Benchmarks
                              </h2>
                              <p className="font-body-sm text-body-sm text-on-surface-variant">
                                Traceable post-harvest batches linked to farmer-verified grades and
                                sourced mandi modal prices.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveModule('harvests')}
                              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold shadow-[2px_2px_0px_#012d1d] cursor-pointer"
                            >
                              Weighbridge ({data.harvests.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveModule('market')}
                              className="px-3 py-1.5 rounded-lg bg-tertiary-fixed hover:bg-tertiary-fixed-dim text-primary border border-primary font-label-sm text-label-sm font-bold shadow-[2px_2px_0px_#012d1d] cursor-pointer"
                            >
                              Mandi Prices ({data.market_entries.length})
                            </button>
                          </div>
                        </div>

                        {/* Harvest + Quality Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b-2 border-primary bg-surface-container text-primary font-label-sm text-label-sm uppercase tracking-wider">
                                <th className="py-2.5 px-4">Crop &amp; Harvest Batch</th>
                                <th className="py-2.5 px-4">Measured Yield</th>
                                <th className="py-2.5 px-4">Quality &amp; Verification</th>
                                <th className="py-2.5 px-4 text-right">Harvest Cost</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm">
                              {data.harvests.map((harvest) => {
                                const cycle = cycleMap.get(harvest.crop_cycle_id);
                                const qc = data.quality_assessments.find(
                                  (q) => q.harvest_id === harvest.id
                                );
                                return (
                                  <tr
                                    key={harvest.id}
                                    onClick={() => setActiveModule('quality')}
                                    className="hover:bg-surface-container-low cursor-pointer transition-colors"
                                  >
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-2.5">
                                        <CropEmblemSvg
                                          cropName={cycle?.crop_name || 'Crop'}
                                          className="w-8 h-8 shrink-0"
                                        />
                                        <div>
                                          <div className="font-bold text-primary">
                                            {cycle?.crop_name || 'Recorded Batch'}
                                          </div>
                                          <div className="font-mono text-xs text-on-surface-variant">
                                            Date: {harvest.harvest_date} ·{' '}
                                            {harvest.storage_location || 'Farm Store'}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-primary">
                                      <div>
                                        {harvest.measured_weight} {harvest.weight_unit}
                                      </div>
                                      <div className="text-xs text-on-surface-variant font-normal">
                                        Batch: {harvest.batch_code || 'Standard Lot'}
                                      </div>
                                    </td>
                                    <td className="py-3 px-4">
                                      {qc ? (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="px-2 py-0.5 rounded bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold">
                                            {qc.farmer_final_grade || 'Pending Grade'}
                                          </span>
                                          <span
                                            className={`px-2 py-0.5 rounded border border-primary font-label-sm text-[10px] font-bold ${
                                              qc.farmer_review_status === 'farmer_verified' ||
                                              qc.farmer_review_status === 'farmer_adjusted'
                                                ? 'bg-primary text-on-primary'
                                                : 'bg-tertiary-fixed text-primary'
                                            }`}
                                          >
                                            {qc.farmer_review_status === 'farmer_verified' ||
                                            qc.farmer_review_status === 'farmer_adjusted'
                                              ? '✓ Farmer Verified'
                                              : '[Experimental Unvalidated]'}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-on-surface-variant font-label-sm text-label-sm">
                                          Pending Quality Check
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-primary text-xs">
                                      {formatCurrencyOrMissing(harvest.harvest_cost)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Sourced Mandi Benchmarks Strip */}
                        <div className="p-space-md bg-surface-container-low border-t-2 border-primary">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-secondary text-[16px]">
                                storefront
                              </span>
                              Sourced Mandi Price Benchmarks (INR / Quintal)
                            </span>
                            <span className="font-label-sm text-[11px] text-on-surface-variant">
                              Explicit source citation required
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {data.market_entries.slice(0, 3).map((m) => (
                              <div
                                key={m.id}
                                onClick={() => setActiveModule('market')}
                                className="bg-surface-container-lowest p-3 rounded-lg border-2 border-primary shadow-[2px_2px_0px_#012d1d] hover:-translate-y-0.5 transition-all cursor-pointer"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-headline-sm text-sm text-primary">
                                    {m.crop_name}
                                  </span>
                                  <span className="font-mono font-bold text-secondary text-sm tabular-nums">
                                    {m.price_per_unit !== null && m.price_per_unit !== undefined
                                      ? `₹${m.price_per_unit.toLocaleString('en-IN')}`
                                      : 'Buyer Lead'}
                                  </span>
                                </div>
                                <div className="font-body-sm text-xs text-on-surface-variant mt-1 truncate">
                                  {m.market_name}, {m.region}
                                </div>
                                <div className="font-mono text-[10px] text-primary/80 mt-1 flex items-center justify-between gap-2">
                                  <span className="truncate">{m.source_citation}</span>
                                  <span className="shrink-0">{m.recorded_date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT 4 COLUMNS: ALERTS, FIELD JOURNAL TIMELINE & GAP INTEGRITY STAMP */}
                    <div className="lg:col-span-4 space-y-space-md">
                      {/* 1. Actionable Field Alerts Card */}
                      <div className="bg-surface-container-lowest rounded-xl border-[2.5px] border-primary brutal-shadow overflow-hidden">
                        <div className="p-space-md bg-tertiary-fixed/70 border-b-2 border-primary flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">
                              notification_important
                            </span>
                            <h2 className="font-headline-sm text-headline-sm text-primary">
                              Actionable Alerts ({data.alerts.length})
                            </h2>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-surface-container-lowest border border-primary font-label-sm text-[10px] text-primary font-bold">
                            LIVE AUDIT
                          </span>
                        </div>

                        <div className="p-space-md space-y-3">
                          {data.alerts.length === 0 ? (
                            <div className="p-3 bg-surface-container-low rounded-lg border border-primary/30 font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2">
                              <span className="material-symbols-outlined text-secondary text-[20px]">
                                check_circle
                              </span>
                              <span>
                                All active crop cycles have up-to-date logs and verified quality
                                grades.
                              </span>
                            </div>
                          ) : (
                            data.alerts.map((alert) => (
                              <div
                                key={alert.id}
                                className="bg-surface-container-low border-2 border-primary rounded-xl p-3.5 brutal-shadow-sm space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`px-2 py-0.5 rounded border border-primary font-label-sm text-[10px] font-bold uppercase ${
                                      alert.severity === 'high'
                                        ? 'bg-error-container text-on-error-container'
                                        : 'bg-tertiary-fixed text-on-tertiary-fixed'
                                    }`}
                                  >
                                    {alert.severity === 'high'
                                      ? 'Priority Action'
                                      : 'Attention Needed'}
                                  </span>
                                  <span className="font-mono text-[11px] text-on-surface-variant font-bold uppercase">
                                    {alert.module_target}
                                  </span>
                                </div>
                                <h3 className="font-headline-sm text-sm text-primary">
                                  {alert.title}
                                </h3>
                                <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                                  {alert.detail}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setActiveModule(alert.module_target)}
                                  className="w-full py-1.5 px-3 rounded-lg bg-secondary-fixed hover:bg-secondary hover:text-on-secondary text-primary border border-primary font-label-sm text-label-sm font-bold shadow-[2px_2px_0px_#012d1d] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                >
                                  <span>Resolve in {formatStageLabel(alert.module_target)}</span>
                                  <span className="material-symbols-outlined text-[15px]">
                                    arrow_forward
                                  </span>
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* 2. Chronological Field Journal Feed */}
                      <div className="bg-surface-container-lowest rounded-xl border-[2.5px] border-primary brutal-shadow overflow-hidden">
                        <div className="p-space-md bg-surface-container-low border-b-2 border-primary flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-secondary text-[20px]">
                              event_note
                            </span>
                            <h2 className="font-headline-sm text-headline-sm text-primary">
                              Field Journal Timeline
                            </h2>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveModule('cultivation')}
                            className="font-label-sm text-label-sm font-bold text-secondary hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Full Log ({data.cultivation_events.length}) →
                          </button>
                        </div>

                        <div className="divide-y divide-surface-container-high font-body-sm text-body-sm">
                          {data.cultivation_events.slice(0, 5).map((ev) => {
                            const cycle = cycleMap.get(ev.crop_cycle_id);
                            return (
                              <div
                                key={ev.id}
                                className="p-3.5 space-y-1 hover:bg-surface-container-low/60 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold">
                                      {formatStageLabel(ev.activity_type)}
                                    </span>
                                    {cycle && (
                                      <span className="font-label-sm text-label-sm text-primary font-bold truncate max-w-[110px]">
                                        {cycle.crop_name}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono tabular-nums font-label-sm text-label-sm text-on-surface-variant">
                                    {ev.event_date}
                                  </span>
                                </div>
                                <p className="font-semibold text-primary text-xs pt-0.5">
                                  {ev.description}
                                </p>
                                <div className="text-on-surface-variant font-label-sm text-label-sm flex items-center justify-between pt-0.5">
                                  <span>Stage: {formatStageLabel(ev.crop_stage)}</span>
                                  <span className="font-mono tabular-nums font-bold text-primary">
                                    Cost: {formatCurrencyOrMissing(ev.cost_amount)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="p-3 bg-surface-container-low border-t-2 border-primary">
                          <button
                            type="button"
                            onClick={() => setActiveModule('cultivation')}
                            className="w-full py-2 rounded-lg bg-secondary text-on-secondary border-2 border-primary font-label-sm text-label-sm font-bold brutal-shadow-sm hover:bg-secondary/95 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">add_circle</span>
                            <span>Record New Field Event</span>
                          </button>
                        </div>
                      </div>

                      {/* 3. GAP Audit & Agronomic Data Integrity Stamp Card */}
                      <div className="bg-surface-container-lowest rounded-xl p-space-md border-[2.5px] border-primary brutal-shadow space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-primary/20">
                          <div className="flex items-center gap-2">
                            <GreenLoopLogo size="sm" showText={false} />
                            <div>
                              <h3 className="font-headline-sm text-headline-sm text-primary">
                                GAP Audit &amp; Ledger Seal
                              </h3>
                              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                                Verified Data Integrity Rules
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-secondary-fixed border border-primary font-mono text-[10px] font-bold text-primary">
                            PASS
                          </span>
                        </div>

                        <ul className="space-y-2 font-body-sm text-xs text-on-surface-variant">
                          <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-secondary text-[16px] shrink-0 mt-0.5">
                              check_circle
                            </span>
                            <span>
                              <strong className="text-primary">Null vs 0 Preserved:</strong> Missing
                              costs render as &ldquo;Not recorded&rdquo; while farm-saved inputs
                              preserve explicit ₹0.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-secondary text-[16px] shrink-0 mt-0.5">
                              check_circle
                            </span>
                            <span>
                              <strong className="text-primary">Human-in-the-Loop QC:</strong> AI
                              visual checks are labeled{' '}
                              <code className="font-mono text-primary font-bold">
                                [Experimental Unvalidated]
                              </code>{' '}
                              until farmer sign-off.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-secondary text-[16px] shrink-0 mt-0.5">
                              check_circle
                            </span>
                            <span>
                              <strong className="text-primary">Multi-User Isolation:</strong>{' '}
                              PostgreSQL RLS policies enforce{' '}
                              <code className="font-mono text-primary font-bold">auth.uid()</code>{' '}
                              ownership.
                            </span>
                          </li>
                        </ul>

                        <button
                          type="button"
                          onClick={() => setActiveModule('reports')}
                          className="w-full py-2 rounded-lg bg-primary text-on-primary border-2 border-primary font-label-sm text-label-sm font-bold transition-all brutal-shadow-sm hover:bg-primary-container flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            download
                          </span>
                          <span>Open Lifecycle Report &amp; Export CSV</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeModule === 'farms' && (
                <FarmsAndPlotsModule
                  ownerId={ownerId}
                  farms={data.farms}
                  plots={data.plots}
                  onRefresh={handleRefresh}
                />
              )}

              {activeModule === 'planning' && (
                <CropPlanningModule
                  ownerId={ownerId}
                  farms={data.farms}
                  plots={data.plots}
                  cropCycles={data.crop_cycles}
                  initialSelectedCycleId={selectedCycleIdForPlanning}
                  onClearSelectedCycle={() => setSelectedCycleIdForPlanning(null)}
                  onRefresh={handleRefresh}
                />
              )}

              {activeModule === 'cultivation' && (
                <CultivationLogModule
                  ownerId={ownerId}
                  cropCycles={data.crop_cycles}
                  cultivationEvents={data.cultivation_events}
                  onRefresh={handleRefresh}
                />
              )}

              {activeModule === 'harvests' && (
                <HarvestModule
                  ownerId={ownerId}
                  cropCycles={data.crop_cycles}
                  harvests={data.harvests}
                  onRefresh={handleRefresh}
                />
              )}

              {activeModule === 'quality' && (
                <QualityAssessmentModule
                  ownerId={ownerId}
                  geminiConfigured={data.gemini_configured}
                  cropCycles={data.crop_cycles}
                  harvests={data.harvests}
                  qualityAssessments={data.quality_assessments}
                  onRefresh={handleRefresh}
                />
              )}

              {activeModule === 'market' && (
                <MarketSupportModule
                  ownerId={ownerId}
                  marketEntries={data.market_entries}
                  onRefresh={handleRefresh}
                />
              )}

              {activeModule === 'reports' && (
                <FarmReportModule
                  ownerId={ownerId}
                  cycleReports={data.cycle_reports}
                  databaseStatus={data.database}
                  onRefresh={handleRefresh}
                />
              )}
            </>
          ) : null}
        </div>
      </main>

      {/* CraveQuest AgroTech Field Journal Footer with Official Brand Lockup */}
      <footer className="w-full bg-surface-container-lowest border-t-[3px] border-primary shadow-[0_-4px_0_0_#012d1d] mt-auto">
        <div className="max-w-7xl mx-auto px-margin lg:px-margin-desktop py-space-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter pb-space-lg border-b-2 border-primary/20">
            <div className="space-y-2">
              <GreenLoopLogo size="sm" />
              <p className="font-body-sm text-body-sm text-on-surface-variant pt-1">
                All plot entries, cultivation logs, and harvest weights recorded with strict owner
                isolation on Supabase PostgreSQL.
              </p>
            </div>

            <div className="space-y-space-xs">
              <h5 className="font-label-lg text-label-lg text-primary uppercase">Data Integrity</h5>
              <ul className="space-y-1 font-body-sm text-body-sm text-on-surface-variant">
                <li>Missing Costs: Reported as &ldquo;Not recorded&rdquo;</li>
                <li>Zero-Cost Inputs: Explicit 0 preserved</li>
                <li>Weights Normalized: Standard kg ledger</li>
              </ul>
            </div>

            <div className="space-y-space-xs">
              <h5 className="font-label-lg text-label-lg text-primary uppercase">
                AI Transparency
              </h5>
              <ul className="space-y-1 font-body-sm text-body-sm text-on-surface-variant">
                <li>Visual Checks: [Experimental Unvalidated]</li>
                <li>Farmer Sign-off: Mandatory for grading</li>
                <li>Market Benchmarks: Explicit source citation</li>
              </ul>
            </div>

            <div className="space-y-space-xs">
              <h5 className="font-label-lg text-label-lg text-primary uppercase">
                Field Log System
              </h5>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                CraveQuest AgroTech Engine · Handcrafted with tactile paper-and-stamp feedback.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container rounded-md border border-primary">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                <span className="font-label-sm text-label-sm text-primary font-bold">
                  FARM RUNTIME OK
                </span>
              </div>
            </div>
          </div>

          <div className="pt-space-md flex flex-col sm:flex-row items-center justify-between gap-space-sm font-label-sm text-label-sm text-on-surface-variant">
            <div>
              © 2026 GREEN LOOP AGROTECH FIELD JOURNAL · RECORDED IN IMMUTABLE ARCHIVE
            </div>
            <div className="flex items-center gap-space-md">
              <span>PARCEL CADASTRE: V2.4</span>
              <span>SUPABASE POSTGRESQL RLS</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
