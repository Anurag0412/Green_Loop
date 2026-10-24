import React, { useState, useEffect, useCallback } from 'react';
import {
  CROP_CYCLE_STATUSES,
  CROP_STAGES,
  ACTIVITY_TYPES,
  WEIGHT_UNITS,
  normalizeWeightToKg,
  type Farm,
  type Plot,
  type CropCycle,
  type CropCycleInput,
  type CultivationEvent,
  type Harvest,
} from '../shared/validation';
import {
  api,
  ApiClientError,
  type CropCycleDetailPayload,
  type RecommendationsPayload,
  type CropRecommendationItem,
  type WeatherPayload,
  formatStageLabel,
  formatCurrencyOrMissing,
  formatWeightOrMissing,
} from '../lib/api';

interface Props {
  ownerId: string;
  farms: Farm[];
  plots: Plot[];
  cropCycles: CropCycle[];
  initialSelectedCycleId?: string | null;
  onClearSelectedCycle?: () => void;
  onRefresh: () => Promise<void>;
}

export function CropPlanningModule({
  ownerId,
  farms,
  plots,
  cropCycles,
  initialSelectedCycleId,
  onClearSelectedCycle,
  onRefresh,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [farmId, setFarmId] = useState<string>(farms[0]?.id || '');
  const [plotId, setPlotId] = useState<string>(plots[0]?.id || '');
  const [cropName, setCropName] = useState('');
  const [seedVariety, setSeedVariety] = useState('');
  const [seedSource, setSeedSource] = useState('');
  const [sowingDate, setSowingDate] = useState('2026-10-23');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState('');
  const [soilDetails, setSoilDetails] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [status, setStatus] = useState<CropCycle['status']>('active');
  const [currentStage, setCurrentStage] = useState<CropCycle['current_stage']>('sowing');
  const [seedCost, setSeedCost] = useState('');
  const [notes, setNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Detail View State
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(
    initialSelectedCycleId || null
  );
  const [detailData, setDetailData] = useState<CropCycleDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Quick inline cultivation log inside detail view
  const [quickEventDate, setQuickEventDate] = useState('2026-10-23');
  const [quickActivityType, setQuickActivityType] =
    useState<CultivationEvent['activity_type']>('irrigation');
  const [quickDescription, setQuickDescription] = useState('');
  const [quickInputs, setQuickInputs] = useState('');
  const [quickCost, setQuickCost] = useState('');
  const [quickEventSubmitting, setQuickEventSubmitting] = useState(false);

  // Quick inline harvest inside detail view
  const [quickHarvestDate, setQuickHarvestDate] = useState('2026-10-23');
  const [quickHarvestWeight, setQuickHarvestWeight] = useState('');
  const [quickHarvestUnit, setQuickHarvestUnit] = useState<Harvest['weight_unit']>('kg');
  const [quickHarvestBatch, setQuickHarvestBatch] = useState('');
  const [quickHarvestSubmitting, setQuickHarvestSubmitting] = useState(false);

  // Qualified AI Agronomic Advisory state inside detail view
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [advisoryResult, setAdvisoryResult] = useState<{
    experimental: boolean;
    source_mode: 'gemini_ai' | 'rule_based_fallback';
    disclaimer: string;
    advisory: {
      stage_summary: string;
      operational_priorities: string[];
      data_completeness_notes: string[];
    };
  } | null>(null);

  // Agronomic Recommendations & Weather State for Planning
  const [recommendationsData, setRecommendationsData] = useState<RecommendationsPayload | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherPayload | null>(null);

  const loadAgronomicIntelligence = useCallback(
    async (targetPlotId?: string) => {
      setRecommendationsLoading(true);
      setRecommendationsError(null);
      try {
        const rec = await api.getRecommendations(ownerId, targetPlotId ? { plot_id: targetPlotId } : undefined);
        setRecommendationsData(rec);
      } catch (err) {
        setRecommendationsError(err instanceof Error ? err.message : 'Could not fetch crop recommendations.');
      } finally {
        setRecommendationsLoading(false);
      }
    },
    [ownerId]
  );

  const loadWeatherIntelligence = useCallback(async () => {
    try {
      const w = await api.getWeather(ownerId);
      setWeatherData(w);
    } catch {
      // Non-blocking telemetry
    }
  }, [ownerId]);

  useEffect(() => {
    void loadAgronomicIntelligence(plotId);
    void loadWeatherIntelligence();
  }, [plotId, loadAgronomicIntelligence, loadWeatherIntelligence]);

  function handleAdoptRecommendation(rec: CropRecommendationItem) {
    setCropName(rec.crop_name);
    const chosenVariety = rec.recommended_varieties[0] || rec.suggested_cycle_draft?.seed_variety || '';
    setSeedVariety(chosenVariety);
    setSeedSource('Certified Breeder Seed Lot (ICAR/NSC)');
    setSoilDetails(rec.water_and_soil_considerations);
    setNotes(
      `ICAR Suitability: ${rec.suitability_score}% (${rec.suitability_grade}). Season: ${rec.recommended_planting_window}. Expected Yield: ${rec.standard_yield_range_kg_per_acre}. Guidance: ${rec.suggested_next_step}`
    );
    if (sowingDate) {
      const d = new Date(sowingDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + (rec.estimated_duration_days || 90));
        setExpectedHarvestDate(d.toISOString().split('T')[0]);
      }
    }
    setStatusNotice(`Adopted ${rec.crop_name} (${chosenVariety}) recommendation into cycle draft.`);
    const el = document.getElementById('plan-cycle-form');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  const loadCycleDetail = useCallback(
    async (cycleId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await api.getCropCycleDetail(ownerId, cycleId);
        setDetailData(res.data);
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : 'Could not load crop cycle details.'
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [ownerId]
  );

  useEffect(() => {
    if (initialSelectedCycleId) {
      setSelectedCycleId(initialSelectedCycleId);
    }
  }, [initialSelectedCycleId]);

  useEffect(() => {
    setAdvisoryResult(null);
    if (selectedCycleId) {
      void loadCycleDetail(selectedCycleId);
    } else {
      setDetailData(null);
    }
  }, [selectedCycleId, loadCycleDetail]);

  async function handleGenerateAdvisory(cycleId: string) {
    setAdvisoryLoading(true);
    setDetailError(null);
    try {
      const res = await api.getCropCycleAdvisory(ownerId, cycleId);
      setAdvisoryResult(res);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : 'Failed to generate agronomic advisory.'
      );
    } finally {
      setAdvisoryLoading(false);
    }
  }

  const selectedFarmId = farmId || farms[0]?.id || '';
  const availablePlots = plots.filter((p) => p.farm_id === selectedFarmId);

  function resetForm() {
    setEditingId(null);
    setCropName('');
    setSeedVariety('');
    setSeedSource('');
    setSowingDate('2026-10-23');
    setExpectedHarvestDate('');
    setSoilDetails('');
    setLocationDetail('');
    setStatus('active');
    setCurrentStage('sowing');
    setSeedCost('');
    setNotes('');
    setError(null);
  }

  function startEdit(cycle: CropCycle) {
    setSelectedCycleId(null);
    setEditingId(cycle.id);
    setFarmId(cycle.farm_id);
    setPlotId(cycle.plot_id);
    setCropName(cycle.crop_name);
    setSeedVariety(cycle.seed_variety || '');
    setSeedSource(cycle.seed_source || '');
    setSowingDate(cycle.sowing_date);
    setExpectedHarvestDate(cycle.expected_harvest_date || '');
    setSoilDetails(cycle.soil_details || '');
    setLocationDetail(cycle.location_detail || '');
    setStatus(cycle.status);
    setCurrentStage(cycle.current_stage);
    setSeedCost(cycle.seed_cost !== null ? String(cycle.seed_cost) : '');
    setNotes(cycle.notes || '');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusNotice(null);

    const targetFarmId = selectedFarmId;
    const targetPlotId =
      availablePlots.some((p) => p.id === plotId) ? plotId : availablePlots[0]?.id || '';

    if (!targetFarmId || !targetPlotId) {
      setError('Please select a valid Farm and Plot before creating a crop cycle.');
      return;
    }
    if (!cropName.trim() || !sowingDate.trim()) {
      setError('Crop name and sowing date are required.');
      return;
    }

    const parsedSeedCost = seedCost.trim() === '' ? null : Number(seedCost);
    if (parsedSeedCost !== null && (Number.isNaN(parsedSeedCost) || parsedSeedCost < 0)) {
      setError('Seed cost must be 0 or greater, or left blank if not yet known.');
      return;
    }

    const payload: CropCycleInput = {
      farm_id: targetFarmId,
      plot_id: targetPlotId,
      crop_name: cropName.trim(),
      seed_variety: seedVariety.trim() || null,
      seed_source: seedSource.trim() || null,
      sowing_date: sowingDate.trim(),
      expected_harvest_date: expectedHarvestDate.trim() || null,
      soil_details: soilDetails.trim() || null,
      location_detail: locationDetail.trim() || null,
      status,
      current_stage: currentStage,
      seed_cost: parsedSeedCost,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const res = await api.updateCropCycle(ownerId, editingId, payload);
        setStatusNotice(`Updated crop cycle "${res.data.crop_name}". ${res.storage_notice}`);
      } else {
        const res = await api.createCropCycle(ownerId, payload);
        setStatusNotice(`Created crop cycle "${res.data.crop_name}". ${res.storage_notice}`);
      }
      resetForm();
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to save crop cycle.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await api.deleteCropCycle(ownerId, id);
      if (editingId === id) resetForm();
      if (selectedCycleId === id) setSelectedCycleId(null);
      setStatusNotice(`Deleted crop cycle. ${res.storage_notice}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete crop cycle');
    }
  }

  async function handleStageUpdateInDetail(
    cycle: CropCycle,
    nextStage: CropCycle['current_stage'],
    nextStatus?: CropCycle['status']
  ) {
    try {
      const res = await api.updateCropCycle(ownerId, cycle.id, {
        farm_id: cycle.farm_id,
        plot_id: cycle.plot_id,
        crop_name: cycle.crop_name,
        seed_variety: cycle.seed_variety,
        seed_source: cycle.seed_source,
        sowing_date: cycle.sowing_date,
        expected_harvest_date: cycle.expected_harvest_date,
        soil_details: cycle.soil_details,
        location_detail: cycle.location_detail,
        status: nextStatus || cycle.status,
        current_stage: nextStage,
        seed_cost: cycle.seed_cost,
        notes: cycle.notes,
      });
      setStatusNotice(`Updated stage to ${formatStageLabel(nextStage)}. ${res.storage_notice}`);
      await onRefresh();
      await loadCycleDetail(cycle.id);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not update crop stage.');
    }
  }

  async function handleQuickEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!detailData || !quickDescription.trim()) return;
    setQuickEventSubmitting(true);
    setDetailError(null);
    try {
      const parsedCost = quickCost.trim() === '' ? null : Number(quickCost);
      const res = await api.createCultivationEvent(ownerId, {
        crop_cycle_id: detailData.cycle.id,
        event_date: quickEventDate,
        activity_type: quickActivityType,
        crop_stage: detailData.cycle.current_stage,
        description: quickDescription.trim(),
        inputs_applied: quickInputs.trim() || null,
        cost_amount: parsedCost,
        observations: null,
      });
      setQuickDescription('');
      setQuickInputs('');
      setQuickCost('');
      setStatusNotice(`Logged cultivation activity. ${res.storage_notice}`);
      await onRefresh();
      await loadCycleDetail(detailData.cycle.id);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to log activity.');
    } finally {
      setQuickEventSubmitting(false);
    }
  }

  async function handleQuickHarvestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!detailData || quickHarvestWeight.trim() === '') return;
    setQuickHarvestSubmitting(true);
    setDetailError(null);
    try {
      const res = await api.createHarvest(ownerId, {
        crop_cycle_id: detailData.cycle.id,
        harvest_date: quickHarvestDate,
        measured_weight: Number(quickHarvestWeight),
        weight_unit: quickHarvestUnit,
        harvest_cost: null,
        storage_location: null,
        batch_code: quickHarvestBatch.trim() || null,
        notes: null,
      });
      setQuickHarvestWeight('');
      setQuickHarvestBatch('');
      setStatusNotice(`Recorded harvest batch. ${res.storage_notice}`);
      await onRefresh();
      await loadCycleDetail(detailData.cycle.id);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to record harvest.');
    } finally {
      setQuickHarvestSubmitting(false);
    }
  }

  const filteredCycles =
    statusFilter === 'all'
      ? cropCycles
      : cropCycles.filter((c) => c.status === statusFilter);

  const farmMap = new Map(farms.map((f) => [f.id, f.name]));
  const plotMap = new Map(plots.map((p) => [p.id, p.name]));
  const featuredCycle = cropCycles[0];

  // --- If a Crop Cycle is selected for Detail Inspection, render the Detail View ---
  if (selectedCycleId) {
    return (
      <div className="space-y-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-space-md rounded-xl border-2 border-primary brutal-shadow-sm">
          <button
            type="button"
            onClick={() => {
              setSelectedCycleId(null);
              onClearSelectedCycle?.();
            }}
            className="inline-flex items-center gap-2 font-label-md text-label-md font-bold text-primary hover:text-secondary whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to All Crop Cycles</span>
          </button>

          {detailData && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => startEdit(detailData.cycle)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-label-sm text-label-sm font-bold text-primary bg-surface-container-low hover:bg-secondary-fixed border-2 border-primary rounded-lg brutal-shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                <span>Edit Cycle Metadata</span>
              </button>
            </div>
          )}
        </div>

        {statusNotice && (
          <div className="p-3.5 bg-secondary-fixed border-2 border-primary rounded-xl font-body-sm text-body-sm text-primary font-semibold brutal-shadow-sm flex items-center justify-between">
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="font-label-sm text-label-sm underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {detailLoading ? (
          <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-10 text-center font-headline-sm text-headline-sm text-primary brutal-shadow">
            Loading crop cycle lifecycle details...
          </div>
        ) : detailError ? (
          <div
            role="alert"
            className="bg-error-container border-2 border-error rounded-xl p-6 font-body-sm text-body-sm text-on-error-container brutal-shadow"
          >
            {detailError}
          </div>
        ) : detailData ? (
          <div className="space-y-space-lg">
            {/* Cycle Header & Metadata Summary (Featured Phenological Profile Style) */}
            <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-lg space-y-5 brutal-shadow relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-tertiary-fixed text-primary border-2 border-primary px-3 py-1 rounded shadow-[2px_2px_0px_#012d1d] -rotate-2 font-label-sm text-label-sm uppercase font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>PARCEL: {detailData.plot?.name || 'UNLINKED'}</span>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary pb-4 pr-36">
                <div>
                  <div className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-secondary font-bold uppercase">
                    <span>{detailData.farm?.name || 'Unlinked Farm'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{detailData.plot?.name || 'Unlinked Plot'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-primary">
                      Sown {detailData.cycle.sowing_date}
                    </span>
                    {detailData.cycle.is_demo ? (
                      <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-primary border border-primary">
                        [Demo Data]
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-secondary-fixed text-primary border border-primary">
                        [User Recorded]
                      </span>
                    )}
                  </div>
                  <h1 className="mt-1 font-headline-lg text-headline-lg text-primary">
                    {detailData.cycle.crop_name} — Lifecycle Detail View
                  </h1>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Variety: <strong className="text-primary">{detailData.cycle.seed_variety || 'Not specified'}</strong> · Seed Source:{' '}
                    <strong className="text-primary">{detailData.cycle.seed_source || 'Not recorded'}</strong> · Expected Harvest:{' '}
                    <span className="font-mono tabular-nums font-bold text-primary">
                      {detailData.cycle.expected_harvest_date || 'Not set'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Soil, Location & Cost Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-xl brutal-shadow-sm">
                  <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Seed Cost
                  </p>
                  <p className="mt-1 font-headline-sm text-headline-sm font-mono tabular-nums text-primary">
                    {formatCurrencyOrMissing(detailData.cycle.seed_cost)}
                  </p>
                </div>
                <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-xl brutal-shadow-sm">
                  <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Total Known Lifecycle Cost
                  </p>
                  <p className="mt-1 font-headline-sm text-headline-sm font-mono tabular-nums text-primary">
                    {formatCurrencyOrMissing(detailData.report.total_known_cost)}
                  </p>
                </div>
                <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-xl brutal-shadow-sm">
                  <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Measured Harvest Yield
                  </p>
                  <p className="mt-1 font-headline-sm text-headline-sm font-mono tabular-nums text-secondary">
                    {formatWeightOrMissing(detailData.report.total_measured_weight_kg, 'kg')}
                  </p>
                </div>
                <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-xl brutal-shadow-sm">
                  <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Plot Area &amp; Soil pH
                  </p>
                  <p className="mt-1 font-headline-sm text-headline-sm font-mono tabular-nums text-primary">
                    {detailData.plot ? `${detailData.plot.area_acres} ac` : 'N/A'} · pH{' '}
                    {detailData.plot?.soil_ph ?? 'Not recorded'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-body-sm text-body-sm text-on-surface-variant">
                <div>
                  <span className="font-bold text-primary">Soil Details: </span>
                  {detailData.cycle.soil_details || 'Not recorded'}
                </div>
                <div>
                  <span className="font-bold text-primary">Field Location Detail: </span>
                  {detailData.cycle.location_detail || 'Not recorded'}
                </div>
                {detailData.cycle.notes && (
                  <div className="md:col-span-2">
                    <span className="font-bold text-primary">Planning Notes: </span>
                    {detailData.cycle.notes}
                  </div>
                )}
              </div>

              {/* Phenological Stage Progression Stepper */}
              <div className="pt-3 border-t-2 border-dashed border-primary/25 space-y-2">
                <p className="font-label-sm text-label-sm uppercase font-bold text-primary">
                  Update Current Phenological Stage:
                </p>
                <div className="flex flex-wrap gap-2">
                  {CROP_STAGES.map((st) => {
                    const active = detailData.cycle.current_stage === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => void handleStageUpdateInDetail(detailData.cycle, st)}
                        className={`px-3 py-1.5 font-label-sm text-label-sm font-bold rounded-lg border-2 border-primary transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-primary-container text-on-primary shadow-[2px_2px_0px_#012d1d]'
                            : 'bg-surface-container-low text-primary hover:bg-secondary-fixed'
                        }`}
                      >
                        {formatStageLabel(st)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Qualified AI-Assisted Agronomic & Operational Insights Panel */}
            <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-lg space-y-4 brutal-shadow">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-primary pb-3">
                <div>
                  <div className="flex items-center gap-2 font-label-md text-label-md font-bold text-secondary uppercase">
                    <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                    <span>Qualified Agronomic &amp; Data Completeness Advisory</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Analyzes your recorded plot soil parameters, phenological stage, logged field
                    activities, and missing data fields without inventing measurements.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleGenerateAdvisory(detailData.cycle.id)}
                  disabled={advisoryLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 font-label-md text-label-md font-bold text-primary bg-tertiary-fixed hover:brightness-105 border-2 border-primary rounded-lg brutal-shadow-sm transition-all disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                  <span>
                    {advisoryLoading
                      ? 'Generating Qualified Insights...'
                      : advisoryResult
                        ? 'Refresh Agronomic Insights'
                        : 'Generate Agronomic Insights'}
                  </span>
                </button>
              </div>

              {advisoryResult ? (
                <div className="space-y-4 font-body-sm text-body-sm">
                  <div className="p-3 bg-tertiary-fixed/50 border-2 border-primary rounded-lg flex items-start gap-2.5 text-primary">
                    <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
                      warning
                    </span>
                    <div>
                      <span className="font-mono font-bold text-primary">
                        {advisoryResult.source_mode === 'gemini_ai'
                          ? '[Experimental AI Advisory — Unvalidated]'
                          : '[Deterministic Agronomic Audit — Rule-Based]'}
                      </span>{' '}
                      {advisoryResult.disclaimer}
                    </div>
                  </div>

                  <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-lg">
                    <p className="font-label-md text-label-md font-bold text-primary uppercase mb-1">
                      Stage &amp; Progress Summary
                    </p>
                    <p className="text-on-surface-variant">
                      {advisoryResult.advisory.stage_summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-lg space-y-1.5">
                      <p className="font-label-md text-label-md font-bold text-primary uppercase">
                        Operational Priorities for Current Stage
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                        {advisoryResult.advisory.operational_priorities.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 bg-surface-container-low border-2 border-primary rounded-lg space-y-1.5">
                      <p className="font-label-md text-label-md font-bold text-primary uppercase">
                        Record Completeness &amp; Missing Data Audit
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                        {advisoryResult.advisory.data_completeness_notes.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Click &ldquo;Generate Agronomic Insights&rdquo; above to run a qualified review of
                  this crop cycle&rsquo;s recorded activities, soil baseline, and data completeness.
                </p>
              )}
            </div>

            {/* Two-Column Quick Logging + History for this Crop Cycle */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter items-start">
              {/* Left: Cultivation Events for this Cycle */}
              <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-md lg:p-space-lg space-y-5 brutal-shadow">
                <h2 className="font-headline-sm text-headline-sm text-primary border-b-2 border-primary pb-3">
                  Cultivation Events ({detailData.cultivation_events.length})
                </h2>

                <form
                  onSubmit={handleQuickEventSubmit}
                  className="space-y-3 bg-surface-container-low p-4 rounded-xl border-2 border-primary"
                >
                  <p className="font-label-md text-label-md font-bold text-primary uppercase">
                    Log Activity for {detailData.cycle.crop_name}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="detail-ev-date"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Date *
                      </label>
                      <input
                        id="detail-ev-date"
                        type="date"
                        required
                        value={quickEventDate}
                        onChange={(e) => setQuickEventDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface-container-lowest border-2 border-primary rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="detail-ev-type"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Activity Type *
                      </label>
                      <select
                        id="detail-ev-type"
                        value={quickActivityType}
                        onChange={(e) =>
                          setQuickActivityType(e.target.value as CultivationEvent['activity_type'])
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-surface-container-lowest border-2 border-primary rounded-lg"
                      >
                        {ACTIVITY_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {formatStageLabel(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="detail-ev-desc"
                      className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                    >
                      Activity Description *
                    </label>
                    <input
                      id="detail-ev-desc"
                      type="text"
                      required
                      value={quickDescription}
                      onChange={(e) => setQuickDescription(e.target.value)}
                      placeholder="e.g., Foliar micronutrient spray"
                      className="w-full px-2.5 py-1.5 text-xs bg-surface-container-lowest border-2 border-primary rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="detail-ev-inputs"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Inputs Applied
                      </label>
                      <input
                        id="detail-ev-inputs"
                        type="text"
                        value={quickInputs}
                        onChange={(e) => setQuickInputs(e.target.value)}
                        placeholder="Optional inputs"
                        className="w-full px-2.5 py-1.5 text-xs bg-surface-container-lowest border-2 border-primary rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="detail-ev-cost"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Known Cost (INR — optional)
                      </label>
                      <input
                        id="detail-ev-cost"
                        type="number"
                        step="0.01"
                        min="0"
                        value={quickCost}
                        onChange={(e) => setQuickCost(e.target.value)}
                        placeholder="Blank if unknown"
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface-container-lowest border-2 border-primary rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={quickEventSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 font-label-sm text-label-sm font-bold text-on-secondary bg-secondary border-2 border-primary rounded-lg brutal-shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    <span>{quickEventSubmitting ? 'Logging...' : 'Add Activity to Cycle'}</span>
                  </button>
                </form>

                {detailData.cultivation_events.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No cultivation events recorded for this crop cycle yet.
                  </p>
                ) : (
                  <div className="divide-y divide-surface-container-high font-body-sm text-body-sm">
                    {detailData.cultivation_events.map((ev) => (
                      <div key={ev.id} className="py-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold">
                            {formatStageLabel(ev.activity_type)} · {formatStageLabel(ev.crop_stage)}
                          </span>
                          <span className="font-mono tabular-nums text-xs text-on-surface-variant">
                            {ev.event_date}
                          </span>
                        </div>
                        <p className="font-bold text-primary">{ev.description}</p>
                        <div className="flex items-center justify-between text-on-surface-variant text-xs">
                          <span>Inputs: {ev.inputs_applied || 'None specified'}</span>
                          <span className="font-mono tabular-nums font-bold text-primary">
                            Cost: {formatCurrencyOrMissing(ev.cost_amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Harvest Batches for this Cycle */}
              <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-md lg:p-space-lg space-y-5 brutal-shadow">
                <h2 className="font-headline-sm text-headline-sm text-primary border-b-2 border-primary pb-3">
                  Measured Harvest Batches ({detailData.harvests.length})
                </h2>

                <form
                  onSubmit={handleQuickHarvestSubmit}
                  className="space-y-3 bg-surface-container-low p-4 rounded-xl border-2 border-primary"
                >
                  <p className="font-label-md text-label-md font-bold text-primary uppercase">
                    Record Measured Harvest for {detailData.cycle.crop_name}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="detail-harv-date"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Harvest Date *
                      </label>
                      <input
                        id="detail-harv-date"
                        type="date"
                        required
                        value={quickHarvestDate}
                        onChange={(e) => setQuickHarvestDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface-container-lowest border-2 border-primary rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="detail-harv-weight"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Measured Weight *
                      </label>
                      <input
                        id="detail-harv-weight"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={quickHarvestWeight}
                        onChange={(e) => setQuickHarvestWeight(e.target.value)}
                        placeholder="e.g., 850"
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface-container-lowest border-2 border-primary rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="detail-harv-unit"
                        className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                      >
                        Unit *
                      </label>
                      <select
                        id="detail-harv-unit"
                        value={quickHarvestUnit}
                        onChange={(e) =>
                          setQuickHarvestUnit(e.target.value as Harvest['weight_unit'])
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-surface-container-lowest border-2 border-primary rounded-lg"
                      >
                        {WEIGHT_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="detail-harv-batch"
                      className="block font-label-sm text-label-sm font-bold text-primary mb-1"
                    >
                      Batch / Lot Code (Optional)
                    </label>
                    <input
                      id="detail-harv-batch"
                      type="text"
                      value={quickHarvestBatch}
                      onChange={(e) => setQuickHarvestBatch(e.target.value)}
                      placeholder="e.g., BATCH-02"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-surface-container-lowest border-2 border-primary rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={quickHarvestSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 font-label-sm text-label-sm font-bold text-on-secondary bg-secondary border-2 border-primary rounded-lg brutal-shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">task_alt</span>
                    <span>{quickHarvestSubmitting ? 'Saving...' : 'Save Harvest Batch'}</span>
                  </button>
                </form>

                {detailData.harvests.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No harvest batches recorded for this crop cycle yet (reported as &ldquo;Not
                    recorded&rdquo; in farm reports).
                  </p>
                ) : (
                  <div className="divide-y divide-surface-container-high font-body-sm text-body-sm">
                    {detailData.harvests.map((h) => (
                      <div key={h.id} className="py-3 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-primary font-mono tabular-nums">
                            {h.measured_weight} {h.weight_unit} (
                            {normalizeWeightToKg(h.measured_weight, h.weight_unit)} kg)
                          </p>
                          <p className="text-on-surface-variant text-xs">
                            Batch: {h.batch_code || 'Unassigned'} · Storage:{' '}
                            {h.storage_location || 'Not specified'}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-xs text-primary font-bold">
                          {h.harvest_date}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-space-xl">
      {/* TOP MASTHEAD & HERO ACTION BAR (CraveQuest Screen 3 Style) */}
      <div className="relative bg-surface-container-lowest p-space-md lg:p-space-lg rounded-xl border-[2.5px] border-primary brutal-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="absolute -top-3 left-8 px-4 py-1 bg-tertiary-fixed border border-primary text-primary font-label-sm text-label-sm uppercase font-bold tracking-widest shadow-[2px_2px_0px_#012d1d] -rotate-1 rounded-sm">
          BATCH TELEMETRY REEL #9942
        </div>

        <div className="space-y-space-xs pt-2 lg:pt-0">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed border border-primary text-on-secondary-fixed font-label-sm text-label-sm font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span>
              02. SEASONAL CROP PLANNING
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              Phenological Registry &amp; Seed Lot Ledger
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Crop Cycles &amp; Seed Registry
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Record crop selection, sowing date, seed variety and source, known soil details, and
            plot location. Click &ldquo;View Details&rdquo; on any cycle to inspect its full
            timeline, update phenological stage, or log activities.
          </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <a
            href="#plan-cycle-form"
            className="px-5 py-2.5 rounded-lg bg-secondary text-on-secondary border-[2.5px] border-primary font-label-lg text-label-lg font-bold brutal-shadow hover:-translate-y-0.5 active:translate-y-0.5 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[22px]">add_circle</span>
            <span>+ Plan New Crop Cycle</span>
          </a>
        </div>
      </div>

      {/* PHENOLOGICAL CROP PROGRESSION MATRIX (Featured Cycle + Sub-Batches) */}
      {featuredCycle && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
          <div className="lg:col-span-8 bg-surface-container-lowest p-space-lg rounded-xl border-[2.5px] border-primary brutal-shadow relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-4 right-4 bg-tertiary-fixed border-2 border-primary text-primary px-3 py-1 rounded shadow-[2px_2px_0px_#012d1d] -rotate-2 font-label-sm text-label-sm uppercase font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>PARCEL: {plotMap.get(featuredCycle.plot_id) || 'PRIMARY PLOT'}</span>
            </div>

            <div>
              <div className="flex items-center gap-2 text-secondary font-label-md text-label-md font-bold mb-1">
                <span className="material-symbols-outlined text-[18px]">nature</span>
                <span>FEATURED PHENOLOGICAL PROFILE</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 mb-space-md pr-32">
                <h2 className="font-headline-md text-headline-md text-primary">
                  {featuredCycle.crop_name}
                </h2>
                <span className="font-label-md text-label-md text-on-surface-variant font-mono">
                  {featuredCycle.seed_variety || 'Standard Cultivar'} • Sown{' '}
                  {featuredCycle.sowing_date}
                </span>
              </div>

              <div className="bg-surface-container-low p-space-md rounded-xl border-2 border-primary mb-space-md flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Current Phenological Stage
                  </div>
                  <div className="font-headline-sm text-headline-sm text-primary flex items-baseline gap-2">
                    <span>{formatStageLabel(featuredCycle.current_stage)}</span>
                    <span className="text-body-sm text-on-surface-variant font-normal">
                      ({formatStageLabel(featuredCycle.status)})
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="bg-surface-container-lowest px-3 py-2 rounded-lg border border-primary/40">
                    <span className="font-label-sm text-label-sm text-on-surface-variant block">
                      SEED COST
                    </span>
                    <span className="font-headline-sm text-headline-sm text-secondary font-mono">
                      {formatCurrencyOrMissing(featuredCycle.seed_cost)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCycleId(featuredCycle.id)}
                    className="bg-primary text-on-primary px-4 py-2 rounded-lg border-2 border-primary font-label-sm text-label-sm font-bold brutal-shadow-sm hover:bg-primary-container cursor-pointer"
                  >
                    Inspect Full Timeline →
                  </button>
                </div>
              </div>

              {/* Phenological Step Trackers */}
              <div className="space-y-2">
                <div className="grid grid-cols-4 sm:grid-cols-7 text-center gap-1.5 pt-1 font-label-sm text-label-sm">
                  {CROP_STAGES.map((st) => {
                    const isCurrent = featuredCycle.current_stage === st;
                    return (
                      <div
                        key={st}
                        className={`flex flex-col items-center p-1.5 rounded-lg border ${
                          isCurrent
                            ? 'bg-secondary-fixed border-primary font-bold text-primary shadow-[2px_2px_0px_#012d1d]'
                            : 'bg-surface-container-low border-primary/20 text-on-surface-variant'
                        }`}
                      >
                        <span>
                          {isCurrent ? '• ' : ''}
                          {formatStageLabel(st)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-gutter flex flex-col justify-between">
            {cropCycles.slice(1, 3).map((subCycle) => (
              <div
                key={subCycle.id}
                onClick={() => setSelectedCycleId(subCycle.id)}
                className="bg-surface-container-lowest p-space-md rounded-xl border-2 border-primary brutal-shadow relative flex flex-col justify-between cursor-pointer hover:-translate-y-0.5 transition-transform"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-label-sm text-label-sm uppercase text-secondary font-bold">
                      {plotMap.get(subCycle.plot_id) || 'PLOT SECTOR'}
                    </span>
                    <h3 className="font-headline-sm text-headline-sm text-primary">
                      {subCycle.crop_name}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {subCycle.seed_variety || 'Standard Variety'} •{' '}
                      {formatStageLabel(subCycle.current_stage)}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded bg-secondary-fixed border border-primary text-primary font-label-sm text-label-sm font-bold font-mono">
                    {subCycle.sowing_date}
                  </span>
                </div>
                <div className="flex items-center justify-between text-body-sm pt-2 border-t border-dashed border-primary/20">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Seed Cost: {formatCurrencyOrMissing(subCycle.seed_cost)}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary font-bold">
                    View Details →
                  </span>
                </div>
              </div>
            ))}

            <div className="bg-primary text-on-primary p-space-md rounded-xl border-2 border-primary brutal-shadow flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-secondary-fixed text-[32px]">
                  verified_user
                </span>
                <div>
                  <div className="font-headline-sm text-headline-sm text-on-primary">
                    {cropCycles.length} Registered Cycles
                  </div>
                  <div className="font-label-sm text-label-sm text-on-primary-container uppercase">
                    Traceable Seed-to-Harvest Ledger
                  </div>
                </div>
              </div>
              <span className="px-2 py-1 rounded bg-secondary text-on-secondary font-label-sm text-label-sm font-bold uppercase">
                GAP READY
              </span>
            </div>
          </div>
        </div>
      )}

      {statusNotice && (
        <div className="p-3.5 bg-secondary-fixed border-2 border-primary rounded-xl font-body-sm text-body-sm text-primary font-semibold brutal-shadow-sm flex items-center justify-between">
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="font-label-sm text-label-sm underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* PRE-SEEDING AGRONOMIC INTELLIGENCE & VARIETAL RECOMMENDER */}
      <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-md lg:p-space-lg space-y-5 brutal-shadow relative overflow-hidden">
        <div className="absolute top-3 right-6 px-3 py-1 bg-tertiary-fixed border border-primary text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider shadow-[2px_2px_0px_#012d1d] -rotate-1 rounded-sm">
          DISPATCH #AGRO-REC-01
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-primary pb-4 pr-32">
          <div>
            <div className="flex items-center gap-2 text-secondary font-label-md text-label-md font-bold mb-1">
              <span className="material-symbols-outlined text-[20px]">psychology_alt</span>
              <span className="uppercase">ICAR / FAO SCIENTIFIC AGRO-INTELLIGENCE</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-primary">
              Pre-Seeding Agronomic &amp; Varietal Recommender
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-3xl">
              Deterministic crop suitability modeling grounded in ICAR agronomic thresholds and FAO water productivity index.
              Select any parcel to generate calibrated variety recommendations with one-click adoption into your field plan.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadAgronomicIntelligence(plotId)}
            disabled={recommendationsLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 font-label-sm text-label-sm font-bold text-primary bg-surface-container-low hover:bg-secondary-fixed border-2 border-primary rounded-lg brutal-shadow-sm whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${recommendationsLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{recommendationsLoading ? 'Recalibrating...' : 'Refresh Suitability'}</span>
          </button>
        </div>

        {/* Microclimate live banner if available */}
        {weatherData && (
          <div className="bg-surface-container-low p-3.5 rounded-xl border-2 border-primary flex flex-wrap items-center justify-between gap-3 text-body-sm font-body-sm">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-secondary text-[22px]">thermostat</span>
              <div>
                <span className="font-bold text-primary">
                  {weatherData.location_name}: {weatherData.current?.temperature_c}°C
                </span>
                <span className="text-on-surface-variant ml-2">
                  (Humidity {weatherData.current?.relative_humidity_pct}%, Wind {weatherData.current?.wind_speed_kmh} km/h)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-secondary-fixed text-primary font-bold text-label-sm uppercase border border-primary">
                Spray: {weatherData.agronomic_risks.find(r => r.risk_type === 'spray_window')?.severity.toUpperCase() || 'OPTIMAL'}
              </span>
              <span className="text-xs text-on-surface-variant">Source: {weatherData.source}</span>
            </div>
          </div>
        )}

        {/* Active Evaluated Plot Details */}
        {recommendationsData && (
          <div className="flex flex-wrap items-center gap-3 font-label-sm text-label-sm">
            <span className="px-2.5 py-1 rounded-md bg-primary text-on-primary font-bold">
              Parcel: {recommendationsData.plot_evaluated.plot_name}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-surface-container-low border border-primary/40 font-mono text-primary">
              Soil: {recommendationsData.plot_evaluated.soil_type || 'Sandy Loam'} (pH {recommendationsData.plot_evaluated.soil_ph ?? '6.5'})
            </span>
            <span className="px-2.5 py-1 rounded-md bg-surface-container-low border border-primary/40 font-mono text-primary">
              Irrigation: {recommendationsData.plot_evaluated.irrigation_type}
            </span>
            <span className="text-on-surface-variant text-xs">
              Scientific Basis: {recommendationsData.agronomic_source}
            </span>
          </div>
        )}

        {recommendationsLoading && (
          <div className="p-8 text-center font-label-md text-label-md text-primary bg-surface-container-low rounded-xl border-2 border-dashed border-primary">
            Calculating ICAR edaphic and climatic suitability scores...
          </div>
        )}

        {recommendationsError && (
          <div className="p-4 bg-error-container border-2 border-error text-on-error-container rounded-xl text-body-sm">
            {recommendationsError}
          </div>
        )}

        {/* Recommendations Cards */}
        {recommendationsData && !recommendationsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendationsData.recommendations.map((rec) => {
              const isHigh = rec.suitability_score >= 85;
              return (
                <div
                  key={rec.crop_name}
                  className="bg-surface-container-lowest p-4 rounded-xl border-2 border-primary brutal-shadow-sm flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                          {rec.recommended_planting_window}
                        </span>
                        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
                          {rec.crop_name}
                        </h3>
                      </div>
                      <div
                        className={`px-2.5 py-1 rounded-md font-mono font-bold text-xs border border-primary ${
                          isHigh ? 'bg-secondary-fixed text-primary' : 'bg-tertiary-fixed text-primary'
                        }`}
                      >
                        {rec.suitability_score}% SCORE
                      </div>
                    </div>

                    <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                      {rec.suitability_summary}
                    </p>

                    <div className="space-y-1 text-xs">
                      <div className="flex flex-wrap gap-1">
                        <span className="font-bold text-primary">Varieties:</span>
                        {rec.recommended_varieties.map((v) => (
                          <span
                            key={v}
                            className="px-1.5 py-0.5 rounded bg-surface-container-low border border-primary/20 text-primary font-mono"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-on-surface-variant pt-1 border-t border-primary/20 font-mono">
                        <span>Duration: {rec.estimated_duration_days} days</span>
                        <span>Yield: ~{rec.standard_yield_range_kg_per_acre}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAdoptRecommendation(rec)}
                    className="w-full py-2 px-3 rounded-lg bg-secondary text-on-secondary border-2 border-primary font-label-sm text-label-sm font-bold brutal-shadow-sm hover:bg-secondary-container hover:text-primary transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
                    <span>Adopt into Cycle Plan →</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Crop Cycle Form */}
      <form
        id="plan-cycle-form"
        onSubmit={handleSubmit}
        className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-md lg:p-space-lg space-y-5 brutal-shadow"
      >
        <div className="flex items-center justify-between border-b-2 border-primary pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">
              calendar_add_on
            </span>
            <h2 className="font-headline-sm text-headline-sm text-primary">
              {editingId ? 'Edit Crop Cycle Plan' : 'Plan New Crop Cycle'}
            </h2>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="font-label-sm text-label-sm font-bold text-error hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-error-container border-2 border-error rounded-lg font-body-sm text-body-sm text-on-error-container"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="cycle-farm-select"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Farm *
            </label>
            <select
              id="cycle-farm-select"
              value={selectedFarmId}
              onChange={(e) => {
                const nextFarm = e.target.value;
                setFarmId(nextFarm);
                const firstPlot = plots.find((p) => p.farm_id === nextFarm);
                if (firstPlot) setPlotId(firstPlot.id);
              }}
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cycle-plot-select"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Plot *
            </label>
            <select
              id="cycle-plot-select"
              value={
                availablePlots.some((p) => p.id === plotId) ? plotId : availablePlots[0]?.id || ''
              }
              onChange={(e) => setPlotId(e.target.value)}
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
            >
              {availablePlots.length === 0 && <option value="">No plots on selected farm</option>}
              {availablePlots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.area_acres} ac)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cycle-crop-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Crop Name *
            </label>
            <input
              id="cycle-crop-input"
              type="text"
              required
              value={cropName}
              onChange={(e) => setCropName(e.target.value)}
              placeholder="e.g., Roma Tomato, Onion, Wheat"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-variety-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Seed Variety / Hybrid
            </label>
            <input
              id="cycle-variety-input"
              type="text"
              value={seedVariety}
              onChange={(e) => setSeedVariety(e.target.value)}
              placeholder="e.g., Arka Rakshak F1"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-seed-source-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Seed Source / Lot Number
            </label>
            <input
              id="cycle-seed-source-input"
              type="text"
              value={seedSource}
              onChange={(e) => setSeedSource(e.target.value)}
              placeholder="e.g., FPO Nursery Batch #209"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-sowing-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Sowing / Transplanting Date *
            </label>
            <input
              id="cycle-sowing-input"
              type="date"
              required
              value={sowingDate}
              onChange={(e) => setSowingDate(e.target.value)}
              className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-expected-harvest-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Expected Harvest Date
            </label>
            <input
              id="cycle-expected-harvest-input"
              type="date"
              value={expectedHarvestDate}
              onChange={(e) => setExpectedHarvestDate(e.target.value)}
              className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-seed-cost-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Seed Cost (INR — blank if unknown, 0 if own seed)
            </label>
            <input
              id="cycle-seed-cost-input"
              type="number"
              step="0.01"
              min="0"
              value={seedCost}
              onChange={(e) => setSeedCost(e.target.value)}
              placeholder="Leave blank if unrecorded"
              className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-status-select"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Cycle Status
            </label>
            <select
              id="cycle-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as CropCycle['status'])}
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
            >
              {CROP_CYCLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStageLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cycle-stage-select"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Current Phenological Stage
            </label>
            <select
              id="cycle-stage-select"
              value={currentStage}
              onChange={(e) => setCurrentStage(e.target.value as CropCycle['current_stage'])}
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
            >
              {CROP_STAGES.map((st) => (
                <option key={st} value={st}>
                  {formatStageLabel(st)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cycle-soil-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Soil Details (When Known)
            </label>
            <input
              id="cycle-soil-input"
              type="text"
              value={soilDetails}
              onChange={(e) => setSoilDetails(e.target.value)}
              placeholder="e.g., Basal FYM applied; pH 6.8"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div>
            <label
              htmlFor="cycle-location-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Specific Field Location
            </label>
            <input
              id="cycle-location-input"
              type="text"
              value={locationDetail}
              onChange={(e) => setLocationDetail(e.target.value)}
              placeholder="e.g., North Block Beds 1–18"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="cycle-notes-input"
            className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
          >
            Planning &amp; Spacing Notes
          </label>
          <input
            id="cycle-notes-input"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Row spacing, seed treatment, or intercrop notes"
            className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={submitting || availablePlots.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-label-md font-bold text-on-secondary bg-secondary hover:bg-secondary/95 border-2 border-primary rounded-lg brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>
              {submitting
                ? 'Saving...'
                : editingId
                  ? 'Update Crop Cycle'
                  : 'Record Crop Cycle'}
            </span>
          </button>
        </div>
      </form>

      {/* Filter Bar + Styled Paper Ledger Table */}
      <div className="bg-surface-container-lowest rounded-xl border-[2.5px] border-primary brutal-shadow overflow-hidden">
        <div className="p-space-md lg:p-space-lg bg-surface-container-low border-b-2 border-primary flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">menu_book</span>
            <h2 className="font-headline-md text-headline-md text-primary">
              Recorded Crop Cycles ({filteredCycles.length})
            </h2>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', ...CROP_CYCLE_STATUSES] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 font-label-sm text-label-sm font-bold rounded-full border-2 border-primary transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-primary text-on-primary shadow-[2px_2px_0px_#012d1d]'
                    : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                }`}
              >
                {st === 'all' ? 'All Cycles' : formatStageLabel(st)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredCycles.length === 0 ? (
            <div className="p-8 text-center font-body-md text-body-md text-on-surface-variant">
              No crop cycles match the current filter.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container border-b-2 border-primary text-primary font-label-sm text-label-sm uppercase tracking-wider">
                  <th className="py-3 px-4">Crop &amp; Seed Info</th>
                  <th className="py-3 px-4">Farm / Plot &amp; Soil</th>
                  <th className="py-3 px-4">Sowing &amp; Target Dates</th>
                  <th className="py-3 px-4">Status &amp; Stage</th>
                  <th className="py-3 px-4 text-right">Seed Cost</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm text-on-surface">
                {filteredCycles.map((cycle) => (
                  <tr
                    key={cycle.id}
                    className="hover:bg-surface-container-low transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-primary">
                        {cycle.crop_name}
                        {cycle.is_demo && (
                          <span className="ml-2 font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-tertiary-fixed text-primary border border-primary">
                            [Demo Data]
                          </span>
                        )}
                      </div>
                      <div className="text-on-surface-variant text-xs">
                        Variety: {cycle.seed_variety || 'Not specified'} · Source:{' '}
                        {cycle.seed_source || 'Not recorded'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-primary">
                        {farmMap.get(cycle.farm_id) || 'Unknown Farm'} /{' '}
                        {plotMap.get(cycle.plot_id) || 'Unknown Plot'}
                      </div>
                      <div className="text-on-surface-variant text-xs">
                        Soil: {cycle.soil_details || 'Not recorded'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-primary text-xs">
                      <div>Sown: {cycle.sowing_date}</div>
                      <div className="text-on-surface-variant">
                        Target: {cycle.expected_harvest_date || 'Not set'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold">
                        {formatStageLabel(cycle.status)}
                      </span>
                      <span aria-hidden="true" className="mx-1.5 text-outline">
                        ·
                      </span>
                      <span className="text-on-surface-variant font-label-sm text-label-sm">
                        {formatStageLabel(cycle.current_stage)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-primary text-xs">
                      {formatCurrencyOrMissing(cycle.seed_cost)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCycleId(cycle.id)}
                        aria-label={`View details for ${cycle.crop_name}`}
                        className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold text-secondary hover:underline cursor-pointer"
                      >
                        View Details
                      </button>
                      <span aria-hidden="true" className="text-outline">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(cycle)}
                        aria-label={`Edit crop cycle ${cycle.crop_name}`}
                        className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold text-primary hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <span aria-hidden="true" className="text-outline">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(cycle.id)}
                        aria-label={`Delete crop cycle ${cycle.crop_name}`}
                        className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold text-error hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
