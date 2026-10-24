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
import { DashboardOverview } from './components/DashboardOverview';

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
                <DashboardOverview
                  data={data}
                  session={session}
                  isDemoMode={isDemoMode}
                  searchQuery={searchQuery}
                  onNavigate={setActiveModule}
                  onSelectCycleForPlanning={(cycleId) => {
                    setSelectedCycleIdForPlanning(cycleId);
                    setActiveModule('planning');
                  }}
                  onRefresh={handleRefresh}
                />
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
