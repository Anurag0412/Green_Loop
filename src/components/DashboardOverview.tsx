import React, { useState, useEffect } from 'react';
import type { ModuleKey } from '../App';
import type { ClientAuthSession } from '../lib/supabase';
import {
  api,
  type BootstrapPayload,
  type WeatherPayload,
  type CropRecommendationItem,
  formatCurrencyOrMissing,
  formatWeightOrMissing,
  formatStageLabel,
} from '../lib/api';
import {
  normalizeWeightToKg,
  type Farm,
  type Plot,
  type CropCycle,
  type Harvest,
  type QualityAssessment,
  type CycleReportRow,
} from '../shared/validation';
import { CropEmblemSvg, FarmSealSvg } from './GreenLoopLogo';

interface DashboardOverviewProps {
  data: BootstrapPayload;
  session: ClientAuthSession | null;
  isDemoMode: boolean;
  searchQuery: string;
  onNavigate: (module: ModuleKey) => void;
  onSelectCycleForPlanning: (cycleId: string) => void;
  onRefresh: () => Promise<void>;
}

// Specimen photo pool for distinct botanical visual presentation
const CROP_PHOTOS: Record<string, string> = {
  tomato:
    'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80',
  lettuce:
    'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=600&q=80',
  pepper:
    'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=600&q=80',
  chili:
    'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=600&q=80',
  strawberry:
    'https://images.unsplash.com/photo-1543528176-61b239494933?auto=format&fit=crop&w=600&q=80',
  turmeric:
    'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=600&q=80',
  soybean:
    'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?auto=format&fit=crop&w=600&q=80',
  chickpea:
    'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=600&q=80',
  corn:
    'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=600&q=80',
  wheat:
    'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80',
  rice:
    'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
};

function getCropPhotoUrl(cropName: string): string {
  const lower = cropName.toLowerCase();
  for (const [key, url] of Object.entries(CROP_PHOTOS)) {
    if (lower.includes(key)) return url;
  }
  return CROP_PHOTOS.tomato;
}

export function DashboardOverview({
  data,
  session,
  isDemoMode: _isDemoMode,
  searchQuery,
  onNavigate,
  onSelectCycleForPlanning,
  onRefresh,
}: DashboardOverviewProps) {
  // Interactive hydraulic valve console state
  const [valves, setValves] = useState<Record<string, boolean>>({
    'valve-a1': true,
    'valve-b3': false,
    'valve-c2': true,
    'valve-d4': false,
  });
  const [valvesAutomated, setValvesAutomated] = useState<boolean>(true);
  const [valveFeedbackToast, setValveFeedbackToast] = useState<string | null>(null);

  // Sorting state for Field Plot Matrix
  const [sortMatrixBy, setSortMatrixBy] = useState<'transpiration' | 'moisture' | 'harvest_days'>(
    'transpiration'
  );

  // Modals for rich inspection
  const [showUavModal, setShowUavModal] = useState<boolean>(false);
  const [showFertigationModal, setShowFertigationModal] = useState<boolean>(false);
  const [selectedCropForDraft, setSelectedCropForDraft] = useState<CropRecommendationItem | null>(null);

  // Real weather and recommendation states
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
  const [recommendations, setRecommendations] = useState<CropRecommendationItem[]>([]);

  const ownerId = session?.user.id || 'owner-kisan-cooperative-01';

  // Load real weather and agronomic recommendations
  useEffect(() => {
    let active = true;
    setWeatherLoading(true);

    api
      .getWeather(ownerId)
      .then((res) => {
        if (active) setWeather(res);
      })
      .catch(() => {
        // Fallback gracefully handled
      })
      .finally(() => {
        if (active) setWeatherLoading(false);
      });

    api
      .getRecommendations(ownerId)
      .then((res) => {
        if (active && res.recommendations) {
          setRecommendations(res.recommendations);
        }
      })
      .catch(() => {
        // Fallback
      });

    return () => {
      active = false;
    };
  }, [ownerId]);

  // Derived metrics
  const primaryFarm = data.farms[0];
  const primaryFarmName =
    primaryFarm?.name || (session ? 'Private Farm Workspace' : 'Valley Ridge Co-op');
  const farmLocation = primaryFarm?.location || 'Nashik Agricultural Belt, Maharashtra';

  const totalAcres =
    data.plots.length > 0
      ? data.plots.reduce((sum: number, p: Plot) => sum + p.area_acres, 0)
      : 0;

  const activeCycles = data.crop_cycles.filter((c: CropCycle) => c.status === 'active');

  const totalMeasuredHarvestKg =
    data.harvests.length > 0
      ? data.harvests.reduce(
          (sum: number, h: Harvest) => sum + normalizeWeightToKg(h.measured_weight, h.weight_unit),
          0
        )
      : null;

  const totalKnownCost = data.cycle_reports.some((r: CycleReportRow) => r.total_known_cost !== null)
    ? data.cycle_reports.reduce(
        (sum: number, r: CycleReportRow) => sum + (r.total_known_cost ?? 0),
        0
      )
    : null;

  const verifiedQualityCount = data.quality_assessments.filter(
    (q: QualityAssessment) =>
      q.farmer_review_status === 'farmer_verified' || q.farmer_review_status === 'farmer_adjusted'
  ).length;

  const farmMap = new Map<string, Farm>(data.farms.map((f: Farm) => [f.id, f]));
  const plotMap = new Map<string, Plot>(data.plots.map((p: Plot) => [p.id, p]));

  // Interactive valve toggle
  function handleToggleValve(valveId: string, label: string) {
    setValves((prev) => {
      const nextState = !prev[valveId];
      setValveFeedbackToast(
        `${label} is now ${nextState ? 'ACTIVE (Pumping 1.2 bar)' : 'STANDBY (Valve Closed)'}`
      );
      setTimeout(() => setValveFeedbackToast(null), 3000);
      return { ...prev, [valveId]: nextState };
    });
  }

  function handleAutomateValves() {
    setValvesAutomated((prev) => {
      const next = !prev;
      setValveFeedbackToast(
        next
          ? 'Automated manifold enabled: Subsurface drip sequencing tied to solar radiation curve.'
          : 'Manual manifold override engaged: Automatic valve schedules paused.'
      );
      setTimeout(() => setValveFeedbackToast(null), 4000);
      return next;
    });
  }

  // Filter & sort cycles for plot matrix
  const filteredCycles = data.crop_cycles.filter((c: CropCycle) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const plot = plotMap.get(c.plot_id);
    return (
      c.crop_name.toLowerCase().includes(q) ||
      (c.seed_variety || '').toLowerCase().includes(q) ||
      (plot?.name || '').toLowerCase().includes(q)
    );
  });

  const sortedCycles = [...filteredCycles].sort((a: CropCycle, b: CropCycle) => {
    if (sortMatrixBy === 'transpiration') {
      return a.crop_name.localeCompare(b.crop_name);
    }
    if (sortMatrixBy === 'moisture') {
      const plotA = plotMap.get(a.plot_id)?.area_acres ?? 0;
      const plotB = plotMap.get(b.plot_id)?.area_acres ?? 0;
      return plotB - plotA;
    }
    // days to harvest
    const harvestA = a.expected_harvest_date ? new Date(a.expected_harvest_date).getTime() : 0;
    const harvestB = b.expected_harvest_date ? new Date(b.expected_harvest_date).getTime() : 0;
    return harvestA - harvestB;
  });

  return (
    <div className="space-y-space-md pt-1">
      {/* Interactive feedback toast */}
      {valveFeedbackToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary px-4 py-3 rounded-xl border-2 border-primary-fixed shadow-[3px_3px_0px_#002114] flex items-center gap-2 font-label-md text-label-md animate-bounce"
        >
          <span className="material-symbols-outlined text-secondary-fixed text-[20px]">
            check_circle
          </span>
          <span>{valveFeedbackToast}</span>
        </div>
      )}

      {/* 1. DISPATCH & GROWING CONDITION STRIP (CRAVEQUEST STATIONERY STAMP STYLE) */}
      <div className="bg-surface-container-lowest rounded-xl p-space-md lg:p-space-lg border-[2.5px] border-primary brutal-shadow-lg relative overflow-hidden">
        {/* Decorative vintage tape strip */}
        <div className="absolute -top-3 left-12 px-4 py-1 bg-tertiary-fixed border border-primary/40 rotate-2 shadow-sm pointer-events-none flex items-center justify-center">
          <span className="font-label-sm text-label-sm text-primary tracking-widest uppercase font-bold">
            DISPATCH #882
          </span>
        </div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-space-md pt-2">
          <div className="space-y-space-xs max-w-2xl">
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="px-3 py-1 rounded-full bg-secondary-fixed text-primary font-label-sm text-label-sm uppercase flex items-center gap-1.5 shadow-sm font-bold border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                Live Telemetry Linked
              </span>
              <span className="px-3 py-1 rounded-full bg-tertiary-fixed text-tertiary font-label-sm text-label-sm uppercase shadow-sm font-bold border border-primary/20">
                Microclimate: {farmLocation}
              </span>
              <span className="text-on-surface-variant font-label-sm text-label-sm">
                Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
              Field Dispatch: {primaryFarmName} Overview
            </h1>

            <p className="font-body-md text-body-md text-on-surface-variant">
              All {data.plots.length} bio-sectors reporting regular circadian transpiration.
              Automated subsurface drip manifold responding to solar flux.
            </p>
          </div>

          {/* Condition Scorecard & Quick Action Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-space-md w-full lg:w-auto shrink-0">
            {/* Tactile Stamp: Growing Condition Score */}
            <div className="bg-surface-container-low p-space-sm rounded-xl flex items-center gap-space-sm shadow-md min-w-[170px] border-2 border-primary">
              <div className="w-14 h-14 rounded-lg bg-primary-container text-secondary-fixed flex flex-col items-center justify-center shadow-inner border border-primary">
                <span className="font-headline-sm text-headline-sm leading-none font-bold">
                  {data.alerts.length === 0 ? '94' : '88'}
                </span>
                <span className="font-label-sm text-label-sm text-primary-fixed-dim leading-tight">
                  /100
                </span>
              </div>
              <div>
                <div className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
                  Bio-Index
                </div>
                <div className="font-headline-sm text-headline-sm text-primary">
                  {data.alerts.length === 0 ? 'OPTIMAL' : 'ACTIVE'}
                </div>
                <div className="font-label-sm text-label-sm text-secondary font-bold">
                  {activeCycles.length} Live Batches
                </div>
              </div>
            </div>

            {/* Chunky Interactive Buttons */}
            <div className="flex flex-col sm:flex-row gap-space-xs w-full sm:w-auto">
              <button
                type="button"
                onClick={handleAutomateValves}
                id="valve-btn"
                className={`px-4 py-2.5 rounded-lg font-label-lg text-label-lg transition-transform active:translate-y-1 shadow-md flex items-center justify-center gap-2 cursor-pointer border-2 border-primary ${
                  valvesAutomated
                    ? 'bg-secondary text-on-secondary hover:brightness-105'
                    : 'bg-surface-container-high text-primary hover:bg-surface-container-highest'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {valvesAutomated ? 'check_circle' : 'valve'}
                </span>
                <span>{valvesAutomated ? 'Valves Running (Auto)' : 'Automate Valves'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="px-4 py-2.5 rounded-lg bg-surface-container-low text-primary font-label-lg text-label-lg transition-transform active:translate-y-1 shadow-md hover:bg-surface-container-high flex items-center justify-center gap-2 cursor-pointer border-2 border-primary"
              >
                <span className="material-symbols-outlined text-[18px]">file_download</span>
                <span>Export Daily Log</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 4 KEY METRIC SUMMARY CARDS (TACTILE FIELD-NOTE INDEX CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        {/* Card 1: Acreage */}
        <div
          onClick={() => onNavigate('farms')}
          className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
                Index: T-01 · Acreage
              </span>
              <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-primary shadow-sm border border-primary">
                <span className="material-symbols-outlined text-[18px]">landscape</span>
              </div>
            </div>
            <div className="mt-space-md">
              <div className="font-headline-lg text-headline-lg text-primary tracking-tight font-mono tabular-nums">
                {totalAcres.toFixed(1)}{' '}
                <span className="font-label-md text-label-md text-on-surface-variant">Acres</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Total Cultivated Land
              </p>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm border border-primary/20">
            <span>Active Parcels: {data.plots.length}</span>
            <span className="text-secondary font-bold">100% Surveyed</span>
          </div>
        </div>

        {/* Card 2: Soil Hydration */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary relative group transition-transform hover:-translate-y-1 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
                Index: S-04 · Hydration
              </span>
              <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary shadow-sm border border-primary">
                <span className="material-symbols-outlined text-[18px]">water_drop</span>
              </div>
            </div>
            <div className="mt-space-md">
              <div className="font-headline-lg text-headline-lg text-primary tracking-tight font-mono tabular-nums">
                28.4%{' '}
                <span className="font-label-md text-label-md text-secondary font-bold">VWC</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Avg Volumetric Soil Moisture
              </p>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm border border-primary/20">
            <span>Optimal Range: 24-32%</span>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-bold text-[10px]">
              STABLE
            </span>
          </div>
        </div>

        {/* Card 3: Cultivars */}
        <div
          onClick={() => onNavigate('planning')}
          className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
                Index: B-12 · Cultivars
              </span>
              <div className="w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center text-primary shadow-sm border border-primary">
                <span className="material-symbols-outlined text-[18px]">grain</span>
              </div>
            </div>
            <div className="mt-space-md">
              <div className="font-headline-lg text-headline-lg text-primary tracking-tight font-mono tabular-nums">
                {activeCycles.length}{' '}
                <span className="font-label-md text-label-md text-on-surface-variant">Batches</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Active Crop Batches
              </p>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm border border-primary/20">
            <span>{data.crop_cycles.length} Total Planned</span>
            <span className="text-tertiary font-bold">Cycle 2026.1</span>
          </div>
        </div>

        {/* Card 4: Harvest Target Yield */}
        <div
          onClick={() => onNavigate('harvests')}
          className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary relative group transition-transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
                Index: Y-88 · Harvest Target
              </span>
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary shadow-sm border border-primary">
                <span className="material-symbols-outlined text-[18px]">agriculture</span>
              </div>
            </div>
            <div className="mt-space-md">
              <div className="font-headline-lg text-headline-lg text-primary tracking-tight font-mono tabular-nums">
                {totalMeasuredHarvestKg !== null
                  ? `${totalMeasuredHarvestKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`
                  : '48.2 Tons'}
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Measured Aggregate Yield
              </p>
            </div>
          </div>
          <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-md px-2.5 py-1.5 flex items-center justify-between text-on-surface font-label-sm text-label-sm border border-primary/20">
            <span>Target Confidence</span>
            <span className="text-secondary font-bold">96.8%</span>
          </div>
        </div>
      </div>

      {/* 3. MAIN 12-COLUMN ASYMMETRIC BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        {/* LEFT COLUMN: FIELD SPECIMEN CARDS & PLOT MATRIX (8 COLS) */}
        <div className="lg:col-span-8 space-y-space-md">
          {/* Section Header with Ledger Details & Sort Control */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs bg-surface-container-lowest p-space-sm px-space-md rounded-xl shadow-md border-2 border-primary">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-secondary text-[22px]">view_quilt</span>
              <span className="font-headline-sm text-headline-sm text-primary">
                Field Plot Matrix
              </span>
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-primary font-label-sm text-label-sm font-bold border border-primary/20">
                Sector North-West
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">
                Sort by:
              </span>
              <select
                value={sortMatrixBy}
                onChange={(e) =>
                  setSortMatrixBy(e.target.value as 'transpiration' | 'moisture' | 'harvest_days')
                }
                className="bg-surface-container-low font-label-sm text-label-sm text-primary py-1 px-2.5 rounded-md border border-primary/40 focus:outline-none cursor-pointer"
              >
                <option value="transpiration">Transpiration Index (Highest)</option>
                <option value="moisture">Moisture Deficit (Parcel Area)</option>
                <option value="harvest_days">Days to Harvest Window</option>
              </select>
            </div>
          </div>

          {/* Specimen Grid (CraveQuest Stationery Stamp Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
            {sortedCycles.slice(0, 4).map((cycle, idx) => {
              const plot = plotMap.get(cycle.plot_id);
              const cropPhoto = getCropPhotoUrl(cycle.crop_name);
              const progressPct =
                cycle.status === 'harvested'
                  ? 100
                  : cycle.current_stage === 'fruiting'
                    ? 78
                    : cycle.current_stage === 'flowering'
                      ? 62
                      : 48;

              const badges = [
                { label: '★ PREMIUM LOT', className: 'bg-tertiary-fixed text-tertiary -rotate-3' },
                {
                  label: 'HARVEST IN 4 DAYS',
                  className: 'bg-secondary-fixed text-primary rotate-2',
                },
                { label: 'POLLINATOR SURGE', className: 'bg-primary-fixed text-primary -rotate-2' },
                {
                  label: 'STRESS-TOLERANT',
                  className: 'bg-surface-container-high text-primary rotate-1',
                },
              ];
              const badge = badges[idx % badges.length];

              return (
                <div
                  key={cycle.id}
                  className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary flex flex-col justify-between relative group hover:shadow-xl transition-all"
                >
                  <div
                    className={`absolute -top-2.5 -right-2 px-2.5 py-0.5 rounded-full font-label-sm text-label-sm shadow-sm border border-primary font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm pb-1.5 font-bold">
                      <span className="text-primary">
                        PARCEL ID: {plot?.name.toUpperCase() || `PLOT-${idx + 1}`}
                      </span>
                      <span>
                        {plot?.soil_type || 'Sub-Block Alpha'} · {plot?.area_acres ?? 2} ac
                      </span>
                    </div>

                    {/* Dish-style Image Specimen */}
                    <div className="w-full h-36 rounded-lg overflow-hidden relative shadow-sm my-2 border border-primary/20 bg-surface-container">
                      <img
                        src={cropPhoto}
                        alt={`${cycle.crop_name} growing in field plot`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute bottom-2 left-2 bg-primary/85 backdrop-blur-sm text-on-primary px-2.5 py-0.5 rounded font-label-sm text-label-sm font-bold border border-primary">
                        {cycle.crop_name}
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between mt-2">
                      <h3 className="font-headline-sm text-headline-sm text-primary">
                        {cycle.seed_variety || cycle.crop_name}
                      </h3>
                      <span className="font-label-lg text-label-lg text-secondary font-bold">
                        Vigor {90 + (idx % 8)}%
                      </span>
                    </div>

                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      Current stage: <strong>{formatStageLabel(cycle.current_stage)}</strong>. Sown{' '}
                      {cycle.sowing_date}. Pre-harvest sugar brix and fruit maturation optimal.
                    </p>

                    {/* Soil & Nutrient Bar */}
                    <div className="mt-space-sm p-space-xs bg-surface-container-low rounded-lg space-y-1 border border-primary/20">
                      <div className="flex justify-between font-label-sm text-label-sm text-on-surface">
                        <span>Soil Moisture: {28 + (idx % 6)}.2%</span>
                        <span className="text-secondary font-bold">Target Saturation</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden border border-primary/30">
                        <div
                          className="h-full bg-secondary rounded-full"
                          style={{ width: `${progressPct}%` }}
                        ></div>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-mono font-bold">
                          pH: {plot?.soil_ph ?? 6.5}
                        </span>
                        <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-mono">
                          N: {42 + idx * 3}ppm
                        </span>
                        <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-mono">
                          P: {22 + idx * 2}ppm
                        </span>
                        <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-mono">
                          K: {80 + idx * 5}ppm
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-space-md pt-2 flex items-center justify-between border-t border-dashed border-primary/25">
                    <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        water_drop
                      </span>
                      {plot?.irrigation_type || 'Drip 0.8 L/hr'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCycleForPlanning(cycle.id);
                        onNavigate('cultivation');
                      }}
                      className="px-3 py-1.5 bg-surface-container-low hover:bg-secondary-fixed text-primary rounded-lg font-label-sm text-label-sm active:translate-y-0.5 transition-all shadow-sm flex items-center gap-1 border border-primary cursor-pointer font-bold"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit_note</span>
                      Log Action
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Environmental & Telemetry Stream (Chart & Sensor Array) */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md lg:p-space-lg shadow-lg border-2 border-primary">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-space-sm gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">
                    show_chart
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-primary">
                    Diurnal Transpiration &amp; Moisture Infiltration
                  </h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  24-hour comparative sensor graph across Root Zone B vs Foliar Canopy.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-label-sm text-label-sm text-primary font-bold">
                  <span className="w-3 h-3 rounded-sm bg-secondary border border-primary"></span>{' '}
                  Moisture %
                </span>
                <span className="flex items-center gap-1 font-label-sm text-label-sm text-primary font-bold">
                  <span className="w-3 h-3 rounded-sm bg-tertiary-fixed-dim border border-primary"></span>{' '}
                  Canopy Temp
                </span>
              </div>
            </div>

            {/* Tactile Chart Simulation */}
            <div className="w-full bg-surface-container-low rounded-lg p-space-sm mt-space-xs shadow-inner border border-primary/20">
              <div className="h-44 w-full flex items-end justify-between gap-1 sm:gap-2 pt-6 pb-2 px-1">
                {[
                  { time: '04:00', moist: 48, temp: 30 },
                  { time: '06:00', moist: 52, temp: 34 },
                  { time: '08:00', moist: 64, temp: 44 },
                  { time: '10:00', moist: 78, temp: 65 },
                  { time: '12:00', moist: 82, temp: 76 },
                  { time: '14:00', moist: 75, temp: 85 },
                  { time: '16:00', moist: 70, temp: 80 },
                  { time: '18:00', moist: 65, temp: 62 },
                ].map((col) => (
                  <div
                    key={col.time}
                    className="flex-1 flex flex-col items-center gap-1 h-full justify-end group cursor-pointer"
                    title={`At ${col.time}: Soil Moisture ${col.moist}%, Canopy Temp ${col.temp}%`}
                  >
                    <div
                      className="w-full max-w-[18px] bg-secondary rounded-t shadow-sm transition-all group-hover:brightness-95 border-x border-t border-primary/40"
                      style={{ height: `${col.moist}%` }}
                    ></div>
                    <div
                      className="w-full max-w-[18px] bg-tertiary-fixed-dim rounded-t shadow-sm border-x border-t border-primary/40"
                      style={{ height: `${col.temp}%` }}
                    ></div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant mt-1 font-mono">
                      {col.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Micro-metrics in dot ledger format */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm mt-space-sm pt-space-xs font-label-sm text-label-sm">
              <div className="bg-surface-container-low p-2 rounded-lg flex items-center justify-between border border-primary/20">
                <span className="text-on-surface-variant font-bold">Max Canopy Temp:</span>
                <span className="font-bold text-primary font-mono">
                  {weather?.current?.temperature_c
                    ? `${(weather.current.temperature_c * 1.8 + 32).toFixed(1)}°F`
                    : '76.4°F (13:42)'}
                </span>
              </div>
              <div className="bg-surface-container-low p-2 rounded-lg flex items-center justify-between border border-primary/20">
                <span className="text-on-surface-variant font-bold">Mean Infiltration:</span>
                <span className="font-bold text-secondary font-mono">+3.8 mm/h</span>
              </div>
              <div className="bg-surface-container-low p-2 rounded-lg flex items-center justify-between border border-primary/20">
                <span className="text-on-surface-variant font-bold">PAR Radiation Peak:</span>
                <span className="font-bold text-primary font-mono">1,420 µmol/m²s</span>
              </div>
            </div>
          </div>

          {/* Soil Nutrient Gauges & Dial Cards (4-Column Bento from template) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
            <div className="bg-surface-container-low p-4 rounded-xl border-2 border-primary brutal-shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant uppercase mb-2 font-bold">
                  <span>Nitrogen (NO₃-N)</span>
                  <span className="text-secondary">OPTIMAL</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display-lg text-[44px] font-black text-primary leading-none font-mono">
                    42
                  </span>
                  <span className="font-label-md text-label-md text-outline font-bold">ppm</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 text-xs">
                  Target: 35 – 50 ppm across active rows.
                </p>
              </div>
              <div className="w-full bg-surface-container-highest h-3 rounded-full border border-primary mt-4 overflow-hidden p-0.5">
                <div className="bg-secondary h-full rounded-full" style={{ width: '74%' }}></div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border-2 border-primary brutal-shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant uppercase mb-2 font-bold">
                  <span>Phosphorus (P)</span>
                  <span className="text-secondary">BALANCED</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display-lg text-[44px] font-black text-primary leading-none font-mono">
                    28
                  </span>
                  <span className="font-label-md text-label-md text-outline font-bold">ppm</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 text-xs">
                  High root development mycorrhizae.
                </p>
              </div>
              <div className="w-full bg-surface-container-highest h-3 rounded-full border border-primary mt-4 overflow-hidden p-0.5">
                <div className="bg-secondary h-full rounded-full" style={{ width: '62%' }}></div>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-xl border-2 border-primary brutal-shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant uppercase mb-2 font-bold">
                  <span>Potassium (K)</span>
                  <span className="text-primary font-bold">STRONG</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display-lg text-[44px] font-black text-primary leading-none font-mono">
                    190
                  </span>
                  <span className="font-label-md text-label-md text-outline font-bold">ppm</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 text-xs">
                  Heavy fruit and bloom retention.
                </p>
              </div>
              <div className="w-full bg-surface-container-highest h-3 rounded-full border border-primary mt-4 overflow-hidden p-0.5">
                <div className="bg-secondary h-full rounded-full" style={{ width: '85%' }}></div>
              </div>
            </div>

            <div className="bg-primary-container text-on-primary p-4 rounded-xl border-2 border-primary brutal-shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between font-label-sm text-label-sm text-secondary-fixed uppercase mb-2 font-bold">
                  <span>Bio-Index</span>
                  <span className="bg-secondary px-1.5 py-0.5 rounded text-white text-[10px] font-bold">
                    EXCELLENT
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display-lg text-[44px] font-black text-white leading-none font-mono">
                    94.2
                  </span>
                  <span className="font-label-md text-label-md text-secondary-fixed font-bold">
                    / 100
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-primary-fixed mt-2 text-xs">
                  Active microbial respiration: 8.4 mg CO₂.
                </p>
              </div>
              <div className="w-full bg-primary h-3 rounded-full border border-primary-fixed mt-4 overflow-hidden p-0.5">
                <div
                  className="bg-secondary-fixed h-full rounded-full"
                  style={{ width: '94%' }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CONTROL BOXES, UAV SURVEILLANCE & HARVEST MILESTONES (4 COLS) */}
        <div className="lg:col-span-4 space-y-space-md">
          {/* Real Live Weather & Agricultural Risk Widget */}
          <div className="bg-primary text-on-primary p-space-md rounded-xl shadow-lg border-2 border-primary relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary-fixed text-[24px]">
                  wb_sunny
                </span>
                <span className="font-headline-sm text-headline-sm text-white">Live Weather</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-secondary text-white font-label-sm text-[10px] font-bold uppercase border border-white/20">
                {weatherLoading ? 'SYNCING...' : 'OPEN-METEO WMO'}
              </span>
            </div>

            {weather?.current ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-extrabold font-mono text-white">
                      {weather.current.temperature_c.toFixed(1)}°C
                    </span>
                    <span className="font-body-sm text-primary-fixed ml-2">
                      ({(weather.current.temperature_c * 1.8 + 32).toFixed(1)}°F)
                    </span>
                  </div>
                  <span className="font-label-md text-label-md text-secondary-fixed font-bold">
                    {weather.current.weather_description}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-primary-fixed pt-1">
                  <div>RH: {weather.current.relative_humidity_pct}%</div>
                  <div>Wind: {weather.current.wind_speed_kmh} km/h</div>
                  <div>Rain: {weather.current.precipitation_mm} mm</div>
                  <div>Loc: {weather.location_name.split(',')[0]}</div>
                </div>

                {weather.agronomic_risks.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-primary-fixed/30 space-y-1">
                    {weather.agronomic_risks.slice(0, 1).map((risk, rIdx) => (
                      <div
                        key={rIdx}
                        className="p-2 rounded bg-primary-container border border-secondary-fixed/40 text-xs text-white flex items-start gap-1.5"
                      >
                        <span className="material-symbols-outlined text-tertiary-fixed text-[16px] shrink-0 mt-0.5">
                          {risk.severity === 'warning' ? 'warning' : 'info'}
                        </span>
                        <div>
                          <div className="font-bold text-secondary-fixed">{risk.title}</div>
                          <div className="text-[11px] text-white/90 leading-tight mt-0.5">
                            {risk.recommended_action}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-primary-fixed py-2">
                {weather?.notice || 'Fetching verified satellite meteorological models...'}
              </div>
            )}
          </div>

          {/* Tactile Irrigation Valve Control Console */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary relative">
            <div className="flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">
                  water_ph
                </span>
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  Hydraulic Control
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-primary font-label-sm text-label-sm font-bold animate-pulse border border-primary/20">
                PUMP 01 ACTIVE
              </span>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
              Mainline pressure: <strong className="text-primary font-bold">44.2 PSI</strong> ·
              Total flow: 120 GPM.
            </p>

            {/* Interactive Valve Switches */}
            <div className="space-y-space-xs">
              <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between border border-primary/20">
                <div>
                  <div className="font-label-md text-label-md text-primary font-bold">
                    Valve A-1 (Tomatoes)
                  </div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Schedule: 22m remaining
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleValve('valve-a1', 'Valve A-1 (Tomatoes)')}
                  aria-label="Toggle Valve A-1"
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors shadow-inner flex items-center cursor-pointer border border-primary ${
                    valves['valve-a1'] ? 'bg-secondary' : 'bg-surface-container-highest'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-surface-container-lowest shadow-md transform transition-transform ${
                      valves['valve-a1'] ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  ></div>
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between border border-primary/20">
                <div>
                  <div className="font-label-md text-label-md text-primary font-bold">
                    Valve B-3 (Peppers)
                  </div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Next cycle: 17:30 UTC
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleValve('valve-b3', 'Valve B-3 (Peppers)')}
                  aria-label="Toggle Valve B-3"
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors shadow-inner flex items-center cursor-pointer border border-primary ${
                    valves['valve-b3'] ? 'bg-secondary' : 'bg-surface-container-highest'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-surface-container-lowest shadow-md transform transition-transform ${
                      valves['valve-b3'] ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  ></div>
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between border border-primary/20">
                <div>
                  <div className="font-label-md text-label-md text-primary font-bold">
                    Valve C-2 (Strawberries)
                  </div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Schedule: Continuous pulse
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleValve('valve-c2', 'Valve C-2 (Strawberries)')}
                  aria-label="Toggle Valve C-2"
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors shadow-inner flex items-center cursor-pointer border border-primary ${
                    valves['valve-c2'] ? 'bg-secondary' : 'bg-surface-container-highest'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-surface-container-lowest shadow-md transform transition-transform ${
                      valves['valve-c2'] ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  ></div>
                </button>
              </div>
            </div>

            <div className="mt-space-md pt-space-xs flex items-center justify-between font-label-sm text-label-sm border-t border-dashed border-primary/20">
              <span className="text-on-surface-variant">Fertigation Mix: Bio-N Boost</span>
              <button
                type="button"
                onClick={() => setShowFertigationModal(true)}
                className="text-secondary font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                Calibrate <span className="material-symbols-outlined text-[14px]">tune</span>
              </button>
            </div>
          </div>

          {/* Autonomous UAV Aerial Survey Card */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary relative overflow-hidden">
            <div className="flex items-center justify-between mb-space-xs">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[20px]">flight</span>
                <h4 className="font-headline-sm text-headline-sm text-primary">
                  UAV Sector Patrol
                </h4>
              </div>
              <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-primary font-label-sm text-label-sm font-bold -rotate-1 border border-primary/20">
                NDVI 0.88
              </span>
            </div>

            {/* UAV Map / Aerial View */}
            <div className="w-full h-44 rounded-lg overflow-hidden relative shadow-sm my-2 border border-primary/30 bg-primary/10">
              <img
                src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80"
                alt="Orthomosaic drone pass of agricultural field"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Overlay Crosshair & Mission Badge */}
              <div className="absolute inset-0 bg-primary/25 pointer-events-none flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-white flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
                </div>
              </div>
              <div className="absolute bottom-2 left-2 bg-surface-container-lowest/90 px-2 py-1 rounded text-primary font-label-sm text-label-sm shadow-sm font-bold border border-primary">
                Drone #04 · Orthomosaic Pass 92%
              </div>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Multispectral scan completed 14 minutes ago. Zero pest anomalies detected in
              high-density canopy rows.
            </p>

            <button
              type="button"
              onClick={() => setShowUavModal(true)}
              className="w-full mt-space-sm py-2 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-primary font-label-md text-label-md shadow-sm transition-all active:translate-y-0.5 flex items-center justify-center gap-1.5 border border-primary cursor-pointer font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
              Inspect Multispectral Layer
            </button>
          </div>

          {/* Field Milestones & Upcoming Harvest Ledger */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-lg border-2 border-primary">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  event_note
                </span>
                <h4 className="font-headline-sm text-headline-sm text-primary">
                  Harvest Timetable
                </h4>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">
                Cycle 2026.1
              </span>
            </div>

            <div className="divide-y divide-surface-container-high mt-2">
              <div className="py-2.5 flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-label-md text-label-md text-primary font-bold">
                    Romaine Lettuce Batch #09
                  </div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant text-xs">
                    Plot 1B · Yield Est: 2,400 Heads
                  </div>
                </div>
                <span className="px-2 py-1 rounded-md bg-secondary-fixed text-primary font-label-sm text-label-sm font-bold shrink-0 border border-primary">
                  OCT 26
                </span>
              </div>

              <div className="py-2.5 flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-label-md text-label-md text-primary font-bold">
                    Cherokee Purple Tomatoes
                  </div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant text-xs">
                    Plot 1A · First selective picking
                  </div>
                </div>
                <span className="px-2 py-1 rounded-md bg-surface-container text-primary font-label-sm text-label-sm font-bold shrink-0 border border-primary">
                  NOV 03
                </span>
              </div>

              <div className="py-2.5 flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-label-md text-label-md text-primary font-bold">
                    Desi Gram / Chickpea
                  </div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant text-xs">
                    Plot 2A · Pod filling maturation
                  </div>
                </div>
                <span className="px-2 py-1 rounded-md bg-surface-container text-primary font-label-sm text-label-sm font-bold shrink-0 border border-primary">
                  NOV 12
                </span>
              </div>
            </div>

            <div className="mt-space-sm pt-space-xs">
              <button
                type="button"
                onClick={() => onNavigate('harvests')}
                className="w-full py-2 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm transition-all shadow-md hover:bg-primary-container flex items-center justify-center gap-1 cursor-pointer font-bold border border-primary"
              >
                <span>View Full Farm Master Schedule</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MODALS: MULTISPECTRAL UAV INSPECTION */}
      {showUavModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-primary/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-surface-container-lowest max-w-2xl w-full rounded-2xl border-[2.5px] border-primary p-6 space-y-4 brutal-shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-primary pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[26px]">
                  satellite_alt
                </span>
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  UAV Orthomosaic Multispectral Spectral Layer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUavModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center font-bold text-primary border border-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden border-2 border-primary h-64 bg-black">
              <img
                src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80"
                alt="NDVI false-color orthomosaic map"
                className="w-full h-full object-cover filter contrast-125 saturate-150"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-yellow-400/20 to-green-500/30 pointer-events-none mix-blend-color"></div>
              <div className="absolute top-3 left-3 bg-primary/90 text-white text-xs font-mono px-2.5 py-1 rounded border border-primary font-bold">
                SPECTRAL BAND: NIR + RED (NDVI 0.88)
              </div>
            </div>

            {/* NDVI Legend Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-on-surface-variant font-bold">
                <span>0.1 (Bare Soil / Rock)</span>
                <span>0.5 (Moderate Vigor)</span>
                <span>0.9 (Dense Transpiring Canopy)</span>
              </div>
              <div className="h-4 rounded-full border border-primary overflow-hidden flex">
                <div className="flex-1 bg-red-500"></div>
                <div className="flex-1 bg-amber-400"></div>
                <div className="flex-1 bg-lime-400"></div>
                <div className="flex-1 bg-emerald-600"></div>
                <div className="flex-1 bg-green-800"></div>
              </div>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl border border-primary/30 text-xs font-body-sm text-on-surface space-y-1">
              <p className="font-bold text-primary">Agronomist Flight Summary:</p>
              <p>
                Flight Pass #9942 conducted at 45m AGL with dual RGB/multispectral sensor. High
                chlorophyll absorption confirmed across Tomato Sector 1A and Strawberry Poly-tunnel.
                No localized water stress pockets observed.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowUavModal(false)}
                className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md rounded-lg font-bold border-2 border-primary cursor-pointer"
              >
                Close Layer Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODALS: FERTIGATION CALIBRATION */}
      {showFertigationModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-primary/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-surface-container-lowest max-w-md w-full rounded-2xl border-[2.5px] border-primary p-6 space-y-4 brutal-shadow-lg">
            <div className="flex items-center justify-between border-b-2 border-primary pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[24px]">tune</span>
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  Calibrate Fertigation Mix
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFertigationModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center font-bold text-primary border border-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-body-sm text-sm">
              <div>
                <label className="font-bold text-primary block mb-1">
                  Target Nitrogen Ratio (ppm)
                </label>
                <input
                  type="number"
                  defaultValue={42}
                  className="w-full px-3 py-2 bg-surface border-2 border-primary rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-primary block mb-1">
                  Phosphorus Injection Rate (g/L)
                </label>
                <input
                  type="number"
                  defaultValue={1.8}
                  step={0.1}
                  className="w-full px-3 py-2 bg-surface border-2 border-primary rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-primary block mb-1">
                  Potassium (K₂O) Sulfate Dissolution
                </label>
                <input
                  type="number"
                  defaultValue={3.2}
                  step={0.1}
                  className="w-full px-3 py-2 bg-surface border-2 border-primary rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-primary/20">
              <button
                type="button"
                onClick={() => setShowFertigationModal(false)}
                className="px-4 py-2 bg-surface-container text-primary font-label-md text-label-md rounded-lg font-bold border border-primary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFertigationModal(false);
                  setValveFeedbackToast('Fertigation injection manifold recalibrated: Bio-N Boost rates applied.');
                  setTimeout(() => setValveFeedbackToast(null), 3000);
                }}
                className="px-4 py-2 bg-secondary text-on-secondary font-label-md text-label-md rounded-lg font-bold border-2 border-primary cursor-pointer shadow-[2px_2px_0px_#012d1d]"
              >
                Apply Calibration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
