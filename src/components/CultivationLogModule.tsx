import React, { useState } from 'react';
import {
  ACTIVITY_TYPES,
  CROP_STAGES,
  type CropCycle,
  type CultivationEvent,
  type CultivationEventInput,
} from '../shared/validation';
import { api, ApiClientError, formatStageLabel, formatCurrencyOrMissing } from '../lib/api';

interface Props {
  ownerId: string;
  cropCycles: CropCycle[];
  cultivationEvents: CultivationEvent[];
  onRefresh: () => Promise<void>;
}

const QUICK_CATEGORIES: Array<{
  type: CultivationEvent['activity_type'];
  label: string;
  icon: string;
}> = [
  { type: 'irrigation', label: 'Drip Water', icon: 'waves' },
  { type: 'fertilizer', label: 'Fertigate', icon: 'water_ph' },
  { type: 'pest_management', label: 'IPM Scout', icon: 'pest_control' },
  { type: 'weeding', label: 'Weeding', icon: 'grass' },
];

export function CultivationLogModule({
  ownerId,
  cropCycles,
  cultivationEvents,
  onRefresh,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cropCycleId, setCropCycleId] = useState<string>(cropCycles[0]?.id || '');
  const [eventDate, setEventDate] = useState('2026-10-23');
  const [activityType, setActivityType] = useState<CultivationEvent['activity_type']>('irrigation');
  const [cropStage, setCropStage] = useState<CultivationEvent['crop_stage']>('vegetative');
  const [description, setDescription] = useState('');
  const [inputsApplied, setInputsApplied] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [observations, setObservations] = useState('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const targetCycleId = cropCycleId || cropCycles[0]?.id || '';

  function resetForm() {
    setEditingId(null);
    setDescription('');
    setInputsApplied('');
    setCostAmount('');
    setObservations('');
    setError(null);
  }

  function startEdit(ev: CultivationEvent) {
    setEditingId(ev.id);
    setCropCycleId(ev.crop_cycle_id);
    setEventDate(ev.event_date);
    setActivityType(ev.activity_type);
    setCropStage(ev.crop_stage);
    setDescription(ev.description);
    setInputsApplied(ev.inputs_applied || '');
    setCostAmount(ev.cost_amount !== null ? String(ev.cost_amount) : '');
    setObservations(ev.observations || '');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusNotice(null);

    if (!targetCycleId) {
      setError('Please create a crop cycle before logging cultivation activities.');
      return;
    }
    if (!description.trim() || !eventDate.trim()) {
      setError('Activity date and description are required.');
      return;
    }

    const parsedCost = costAmount.trim() === '' ? null : Number(costAmount);
    if (parsedCost !== null && (Number.isNaN(parsedCost) || parsedCost < 0)) {
      setError('Cost amount must be 0 or greater, or left blank when cost is not yet known.');
      return;
    }

    const payload: CultivationEventInput = {
      crop_cycle_id: targetCycleId,
      event_date: eventDate.trim(),
      activity_type: activityType,
      crop_stage: cropStage,
      description: description.trim(),
      inputs_applied: inputsApplied.trim() || null,
      cost_amount: parsedCost,
      observations: observations.trim() || null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const res = await api.updateCultivationEvent(ownerId, editingId, payload);
        setStatusNotice(`Updated cultivation event. ${res.storage_notice}`);
      } else {
        const res = await api.createCultivationEvent(ownerId, payload);
        setStatusNotice(`Logged cultivation event. ${res.storage_notice}`);
      }
      resetForm();
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to log cultivation activity.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await api.deleteCultivationEvent(ownerId, id);
      if (editingId === id) resetForm();
      setStatusNotice(`Deleted cultivation event. ${res.storage_notice}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cultivation event');
    }
  }

  const cycleMap = new Map(cropCycles.map((c) => [c.id, c]));

  const filteredEvents = cultivationEvents.filter((ev) => {
    if (cycleFilter !== 'all' && ev.crop_cycle_id !== cycleFilter) return false;
    if (typeFilter !== 'all' && ev.activity_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-space-xl">
      {/* Masthead */}
      <div className="relative bg-surface-container-lowest p-space-md lg:p-space-lg rounded-xl border-[2.5px] border-primary brutal-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="absolute -top-3 left-8 px-4 py-1 bg-tertiary-fixed border border-primary text-primary font-label-sm text-label-sm uppercase font-bold tracking-widest shadow-[2px_2px_0px_#012d1d] -rotate-1 rounded-sm">
          FIELD OPERATIONS LEDGER #GL-03
        </div>

        <div className="space-y-space-xs pt-2 lg:pt-0">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed border border-primary text-on-secondary-fixed font-label-sm text-label-sm font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              03. FIELD OPERATIONS &amp; OBSERVATIONS
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Cultivation Activity Log
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Record dated irrigation, fertilizer applications, pest management, and field
            observations. Only record actual observed details and known costs—leave cost blank if
            an invoice or utility bill is still pending.
          </p>
        </div>
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

      {/* FIELD-OPTIMIZED QUICK-LOG & COMPLIANCE DUAL WORKSPACE (CraveQuest Screen 3 Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
        {/* Field Touch Logging Console (8 cols) */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-8 bg-surface-container-lowest p-space-md lg:p-space-lg rounded-xl border-[2.5px] border-primary brutal-shadow space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b-2 border-primary pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[24px]">
                    touch_app
                  </span>
                  <h2 className="font-headline-md text-headline-md text-primary">
                    {editingId
                      ? 'Edit Cultivation Activity'
                      : 'Record Dated Cultivation Activity'}
                  </h2>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  High-contrast controls calibrated for in-field tablets &amp; gloved operations.
                </p>
              </div>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="font-label-sm text-label-sm font-bold text-error hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cancel Edit
                </button>
              ) : (
                <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-secondary-fixed border border-primary text-primary font-label-sm text-label-sm font-bold uppercase shadow-[2px_2px_0px_#012d1d]">
                  Touch Target: 48px+
                </span>
              )}
            </div>

            {/* 4 Large Touch Buttons for Quick Intervention Category */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
              {QUICK_CATEGORIES.map((cat) => {
                const isSelected = activityType === cat.type;
                return (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() => setActivityType(cat.type)}
                    className={`p-3 rounded-xl border-2 border-primary flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'bg-secondary text-on-secondary brutal-shadow-sm -translate-y-0.5'
                        : 'bg-surface-container-low text-primary hover:bg-surface-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[26px]">{cat.icon}</span>
                    <span className="font-label-md text-label-md font-bold uppercase">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 bg-error-container border-2 border-error rounded-lg font-body-sm text-body-sm text-on-error-container"
              >
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-surface-container-low p-4 rounded-xl border-2 border-primary">
              <div>
                <label
                  htmlFor="log-cycle-select"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Crop Cycle *
                </label>
                <select
                  id="log-cycle-select"
                  value={targetCycleId}
                  onChange={(e) => setCropCycleId(e.target.value)}
                  className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface-container-lowest border-2 border-primary rounded-lg focus:outline-none"
                >
                  {cropCycles.length === 0 && <option value="">No crop cycles available</option>}
                  {cropCycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.crop_name} ({c.sowing_date})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="log-date-input"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Activity Date *
                </label>
                <input
                  id="log-date-input"
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface-container-lowest border-2 border-primary rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="log-type-select"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Activity Type *
                </label>
                <select
                  id="log-type-select"
                  value={activityType}
                  onChange={(e) =>
                    setActivityType(e.target.value as CultivationEvent['activity_type'])
                  }
                  className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface-container-lowest border-2 border-primary rounded-lg focus:outline-none"
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {formatStageLabel(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="log-stage-select"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Crop Stage at Activity *
                </label>
                <select
                  id="log-stage-select"
                  value={cropStage}
                  onChange={(e) =>
                    setCropStage(e.target.value as CultivationEvent['crop_stage'])
                  }
                  className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface-container-lowest border-2 border-primary rounded-lg focus:outline-none"
                >
                  {CROP_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {formatStageLabel(st)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="log-description-input"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Activity Description *
                </label>
                <input
                  id="log-description-input"
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Drip irrigation for 3 hours on North Terrace beds"
                  className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
                />
              </div>

              <div>
                <label
                  htmlFor="log-cost-input"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Known Cost (INR — blank if unknown, 0 if free)
                </label>
                <input
                  id="log-cost-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  placeholder="Leave blank if unknown"
                  className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="log-inputs-input"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Inputs Applied (Fertilizer / Water / Labor — optional)
                </label>
                <input
                  id="log-inputs-input"
                  type="text"
                  value={inputsApplied}
                  onChange={(e) => setInputsApplied(e.target.value)}
                  placeholder="e.g., 19:19:19 NPK (15 kg)"
                  className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
                />
              </div>

              <div>
                <label
                  htmlFor="log-obs-input"
                  className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
                >
                  Field Observations (Optional)
                </label>
                <input
                  id="log-obs-input"
                  type="text"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="e.g., Soil moisture uniform; no leaf curl"
                  className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || cropCycles.length === 0}
              className="w-full py-3.5 px-5 rounded-xl bg-secondary text-on-secondary border-[2.5px] border-primary font-headline-sm text-headline-sm brutal-shadow hover:-translate-y-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[24px]">draw</span>
              <span>
                {submitting
                  ? 'Recording...'
                  : editingId
                    ? 'Update Cultivation Event'
                    : 'Log Cultivation Event'}
              </span>
            </button>
          </div>
        </form>

        {/* Field Log Compliance & Cost Integrity Checklist (4 cols) */}
        <div className="lg:col-span-4 bg-surface-container-lowest p-space-md lg:p-space-lg rounded-xl border-[2.5px] border-primary brutal-shadow flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between border-b-2 border-primary pb-3">
              <div>
                <span className="font-label-sm text-label-sm text-secondary font-bold uppercase block">
                  GAP Audit Protocol
                </span>
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  Field Log Integrity
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-tertiary-fixed border border-primary text-primary font-label-sm text-label-sm font-bold">
                VERIFIED
              </span>
            </div>

            <div className="bg-surface-container-low p-space-md rounded-xl border-2 border-primary text-center space-y-2">
              <div className="font-display-lg text-[40px] font-black text-primary leading-none font-mono">
                {cultivationEvents.length}
              </div>
              <p className="font-label-md text-label-md font-bold text-primary uppercase">
                Total Logged Interventions
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Every field event is timestamped and linked to its parent crop cycle and phenological
                stage.
              </p>
            </div>

            <div className="space-y-2">
              <span className="font-label-sm text-label-sm font-bold uppercase text-primary block">
                Data Honesty &amp; GAP Checklist
              </span>
              <div className="space-y-2 font-label-md text-label-md">
                <div className="flex items-center gap-2 text-primary bg-surface-container-low p-2.5 rounded-lg border border-primary/40">
                  <span className="material-symbols-outlined text-secondary text-[18px]">
                    check_box
                  </span>
                  <span>Unrecorded bills saved as NULL (not 0)</span>
                </div>
                <div className="flex items-center gap-2 text-primary bg-surface-container-low p-2.5 rounded-lg border border-primary/40">
                  <span className="material-symbols-outlined text-secondary text-[18px]">
                    check_box
                  </span>
                  <span>Farm-saved zero-cost inputs saved as 0</span>
                </div>
                <div className="flex items-center gap-2 text-primary bg-surface-container-low p-2.5 rounded-lg border border-primary/40">
                  <span className="material-symbols-outlined text-secondary text-[18px]">
                    check_box
                  </span>
                  <span>Stage-bound activity traceability</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t-2 border-dashed border-primary/25 flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-secondary-fixed border-2 border-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[24px]">
                verified_user
              </span>
            </div>
            <div>
              <div className="font-label-md text-label-md font-bold text-primary">
                PostgreSQL RLS Protected
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Logs are strictly scoped to your verified account.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CULTIVATION ACTIVITY LEDGER TABLE */}
      <div className="bg-surface-container-lowest rounded-xl border-[2.5px] border-primary brutal-shadow overflow-hidden">
        <div className="p-space-md lg:p-space-lg bg-surface-container-low border-b-2 border-primary flex flex-col gap-space-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  menu_book
                </span>
                <h2 className="font-headline-md text-headline-md text-primary">
                  Chronological Field Log ({filteredEvents.length})
                </h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Chronological field intervention stream for seasonal crop accounting.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Filter by crop cycle"
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
                className="px-3 py-2 font-label-md text-label-md font-bold bg-surface-container-lowest border-2 border-primary rounded-lg text-primary shadow-[2px_2px_0px_#012d1d]"
              >
                <option value="all">All Crop Cycles</option>
                {cropCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.crop_name} ({c.sowing_date})
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by activity type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 font-label-md text-label-md font-bold bg-surface-container-lowest border-2 border-primary rounded-lg text-primary shadow-[2px_2px_0px_#012d1d]"
              >
                <option value="all">All Activity Types</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatStageLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center font-body-md text-body-md text-on-surface-variant">
              No cultivation activities recorded matching the current filter.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container border-b-2 border-primary text-primary font-label-sm text-label-sm uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Crop Cycle</th>
                  <th className="py-3 px-4">Activity &amp; Stage</th>
                  <th className="py-3 px-4">Description, Inputs &amp; Observations</th>
                  <th className="py-3 px-4 text-right">Known Cost</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm text-on-surface">
                {filteredEvents.map((ev) => {
                  const cycle = cycleMap.get(ev.crop_cycle_id);
                  return (
                    <tr
                      key={ev.id}
                      className="hover:bg-surface-container-low transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-primary whitespace-nowrap">
                        {ev.event_date}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-primary">
                        {cycle ? cycle.crop_name : 'Unlinked Cycle'}
                        {ev.is_demo && (
                          <span className="ml-1.5 font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-tertiary-fixed text-primary border border-primary">
                            [Demo Data]
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed border border-primary font-label-sm text-label-sm font-bold">
                          {formatStageLabel(ev.activity_type)}
                        </span>
                        <span aria-hidden="true" className="mx-1.5 text-outline">
                          ·
                        </span>
                        <span className="text-on-surface-variant font-label-sm text-label-sm">
                          {formatStageLabel(ev.crop_stage)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 space-y-1 max-w-md">
                        <div className="text-primary font-semibold">{ev.description}</div>
                        {ev.inputs_applied && (
                          <div className="text-on-surface-variant text-xs">
                            Inputs: <strong className="text-primary">{ev.inputs_applied}</strong>
                          </div>
                        )}
                        {ev.observations && (
                          <div className="text-on-surface-variant text-xs">
                            Observation: {ev.observations}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-primary whitespace-nowrap">
                        {formatCurrencyOrMissing(ev.cost_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => startEdit(ev)}
                          aria-label={`Edit activity on ${ev.event_date}`}
                          className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold text-secondary hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <span aria-hidden="true" className="text-outline">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(ev.id)}
                          aria-label={`Delete activity on ${ev.event_date}`}
                          className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold text-error hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
