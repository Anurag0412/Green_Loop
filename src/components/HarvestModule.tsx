import React, { useState } from 'react';
import { Plus, Trash2, Edit3, Scale, QrCode, PackageCheck } from 'lucide-react';
import {
  WEIGHT_UNITS,
  normalizeWeightToKg,
  type CropCycle,
  type Harvest,
  type HarvestInput,
} from '../shared/validation';
import { api, ApiClientError, formatCurrencyOrMissing } from '../lib/api';

interface Props {
  ownerId: string;
  cropCycles: CropCycle[];
  harvests: Harvest[];
  onRefresh: () => Promise<void>;
}

export function HarvestModule({ ownerId, cropCycles, harvests, onRefresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cropCycleId, setCropCycleId] = useState<string>(cropCycles[0]?.id || '');
  const [harvestDate, setHarvestDate] = useState('2026-10-23');
  const [measuredWeight, setMeasuredWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<Harvest['weight_unit']>('kg');
  const [harvestCost, setHarvestCost] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const targetCycleId = cropCycleId || cropCycles[0]?.id || '';

  function resetForm() {
    setEditingId(null);
    setMeasuredWeight('');
    setHarvestCost('');
    setStorageLocation('');
    setBatchCode('');
    setNotes('');
    setError(null);
  }

  function startEdit(h: Harvest) {
    setEditingId(h.id);
    setCropCycleId(h.crop_cycle_id);
    setHarvestDate(h.harvest_date);
    setMeasuredWeight(String(h.measured_weight));
    setWeightUnit(h.weight_unit);
    setHarvestCost(h.harvest_cost !== null ? String(h.harvest_cost) : '');
    setStorageLocation(h.storage_location || '');
    setBatchCode(h.batch_code || '');
    setNotes(h.notes || '');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusNotice(null);

    if (!targetCycleId) {
      setError('Please select a crop cycle.');
      return;
    }
    if (!harvestDate.trim() || measuredWeight.trim() === '') {
      setError('Harvest date and actual measured weight are required.');
      return;
    }

    const weightNum = Number(measuredWeight);
    if (Number.isNaN(weightNum) || weightNum < 0) {
      setError('Measured weight must be 0 or a positive number.');
      return;
    }

    const costNum = harvestCost.trim() === '' ? null : Number(harvestCost);
    if (costNum !== null && (Number.isNaN(costNum) || costNum < 0)) {
      setError('Harvest cost must be 0 or greater, or left blank if unknown.');
      return;
    }

    const payload: HarvestInput = {
      crop_cycle_id: targetCycleId,
      harvest_date: harvestDate.trim(),
      measured_weight: weightNum,
      weight_unit: weightUnit,
      harvest_cost: costNum,
      storage_location: storageLocation.trim() || null,
      batch_code: batchCode.trim() || null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const res = await api.updateHarvest(ownerId, editingId, payload);
        setStatusNotice(`Updated harvest batch. ${res.storage_notice}`);
      } else {
        const res = await api.createHarvest(ownerId, payload);
        setStatusNotice(`Recorded harvest batch. ${res.storage_notice}`);
      }
      resetForm();
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to save harvest record.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await api.deleteHarvest(ownerId, id);
      if (editingId === id) resetForm();
      setStatusNotice(`Deleted harvest record. ${res.storage_notice}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete harvest record');
    }
  }

  const cycleMap = new Map(cropCycles.map((c) => [c.id, c]));
  const totalNormalizedKg = harvests.reduce(
    (sum, h) => sum + normalizeWeightToKg(h.measured_weight, h.weight_unit),
    0
  );
  const activePassportHarvest =
    harvests.find((h) => h.id === selectedBatchId) || harvests[0] || null;
  const activePassportCycle = activePassportHarvest
    ? cycleMap.get(activePassportHarvest.crop_cycle_id)
    : null;

  return (
    <div className="space-y-8">
      {/* Screen 4 Top Washi Tape Accent Stripe */}
      <div className="w-full h-3 bg-tertiary-fixed border-y-2 border-primary flex items-center justify-around overflow-hidden select-none">
        <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-on-tertiary-fixed uppercase">
          /// HARVEST LEDGER WEIGHBRIDGE LOG · SPECIMEN PACKHOUSE BENCH ///
        </span>
        <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-on-tertiary-fixed uppercase hidden md:inline">
          /// ZERO UNMEASURED ESTIMATES · PLATFORM SCALE VERIFIED ///
        </span>
      </div>

      {/* Screen 4 Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b-[2.5px] border-primary pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2">
            <span className="washi-tape bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md font-bold px-2.5 py-0.5 border-[1.5px] border-primary uppercase tracking-wider inline-block">
              HARVEST ARCHIVE · SEC 04
            </span>
            <span className="font-mono text-xs text-on-surface-variant font-bold">
              // WEIGHBRIDGE &amp; PACKHOUSE LEDGER
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight uppercase">
            Harvest Management &amp; Batch Provenance
          </h1>
          <p className="text-body-md text-on-surface-variant max-w-2xl font-medium">
            Record harvest dates, actual measured weights from platform scales or weighbridges,
            batch codes, and storage locations. Enter 0 only if a crop cycle produced zero
            marketable yield.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface-container-lowest border-[2px] border-primary px-4 py-2.5 shadow-[3px_3px_0px_#012d1d]">
            <div className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">
              CUMULATIVE MEASURED YIELD
            </div>
            <div className="font-mono text-xl font-bold text-primary tabular-nums">
              {totalNormalizedKg.toLocaleString('en-IN')} kg{' '}
              <span className="text-xs text-secondary font-bold">({harvests.length} LOTS)</span>
            </div>
          </div>
        </div>
      </div>

      {statusNotice && (
        <div
          role="status"
          className="p-4 bg-secondary-container border-2 border-primary brutal-shadow-sm text-xs font-bold text-on-secondary-container flex items-center justify-between"
        >
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-xs font-mono uppercase underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Harvest Registration Form + Provenance Passport Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 cols: Weighbridge Batch Entry Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-8 bg-surface-container-lowest border-[2.5px] border-primary p-6 shadow-[5px_5px_0px_#012d1d] space-y-5 relative"
        >
          <div className="flex items-center justify-between border-b-2 border-primary pb-3">
            <div className="flex items-center gap-2.5">
              <Scale className="w-5 h-5 text-primary" />
              <h2 className="font-headline-sm text-lg font-bold text-primary uppercase">
                {editingId ? 'Edit Measured Harvest Batch' : 'Record Measured Harvest Batch'}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1 bg-surface-container-low border border-primary font-label-md text-xs font-bold text-primary uppercase hover:bg-tertiary-fixed cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-error-container border-2 border-error text-xs font-bold text-on-error-container"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="harvest-cycle-select"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Crop Cycle *
              </label>
              <select
                id="harvest-cycle-select"
                value={targetCycleId}
                onChange={(e) => setCropCycleId(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
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
                htmlFor="harvest-date-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Harvest Date *
              </label>
              <input
                id="harvest-date-input"
                type="date"
                required
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="harvest-weight-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Actual Measured Weight *
              </label>
              <input
                id="harvest-weight-input"
                type="number"
                step="0.01"
                min="0"
                required
                value={measuredWeight}
                onChange={(e) => setMeasuredWeight(e.target.value)}
                placeholder="e.g., 1420"
                className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="harvest-unit-select"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Weight Unit *
              </label>
              <select
                id="harvest-unit-select"
                value={weightUnit}
                onChange={(e) => setWeightUnit(e.target.value as Harvest['weight_unit'])}
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              >
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="harvest-batch-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Batch / Lot Code
              </label>
              <input
                id="harvest-batch-input"
                type="text"
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                placeholder="e.g., TOM-A1-PICK2"
                className="w-full px-3 py-2 text-sm font-mono font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="harvest-storage-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Storage / Packhouse Location
              </label>
              <input
                id="harvest-storage-input"
                type="text"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="e.g., On-farm shaded packhouse"
                className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="harvest-cost-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
              >
                Harvest Labor/Transport Cost (INR)
              </label>
              <input
                id="harvest-cost-input"
                type="number"
                step="0.01"
                min="0"
                value={harvestCost}
                onChange={(e) => setHarvestCost(e.target.value)}
                placeholder="Leave blank if unrecorded"
                className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="harvest-notes-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
            >
              Weighing &amp; Handling Notes
            </label>
            <input
              id="harvest-notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Weighed across 71 crates (20 kg net each)"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting || cropCycles.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-xs font-bold uppercase tracking-wider text-on-primary bg-primary border-2 border-primary brutal-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-transform disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {submitting
                ? 'Saving...'
                : editingId
                  ? 'Update Harvest Batch'
                  : 'Record Harvest Batch'}
            </button>
          </div>
        </form>

        {/* Right 4 cols: Screen 4 Batch Provenance Passport Card */}
        <div className="lg:col-span-4 bg-surface-container-lowest border-[2.5px] border-primary p-5 shadow-[5px_5px_0px_#012d1d] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-primary pb-3">
            <div>
              <span className="font-mono text-[10px] font-bold text-secondary uppercase block">
                GS1 / PACKHOUSE TRACEABILITY
              </span>
              <h3 className="font-headline-sm text-base font-bold text-primary uppercase">
                Batch Provenance Passport
              </h3>
            </div>
            <QrCode className="w-6 h-6 text-primary" />
          </div>

          {activePassportHarvest ? (
            <>
              <div className="bg-surface-container-low border-2 border-primary p-3 flex items-center gap-3">
                {/* Deterministic Vector QR Matrix */}
                <svg
                  viewBox="0 0 60 60"
                  className="w-14 h-14 border border-primary bg-white p-1 shrink-0"
                  aria-label="Batch Traceability Matrix"
                >
                  <rect x="4" y="4" width="16" height="16" fill="#012d1d" />
                  <rect x="7" y="7" width="10" height="10" fill="#ffffff" />
                  <rect x="9" y="9" width="6" height="6" fill="#012d1d" />
                  <rect x="40" y="4" width="16" height="16" fill="#012d1d" />
                  <rect x="43" y="7" width="10" height="10" fill="#ffffff" />
                  <rect x="45" y="9" width="6" height="6" fill="#012d1d" />
                  <rect x="4" y="40" width="16" height="16" fill="#012d1d" />
                  <rect x="7" y="43" width="10" height="10" fill="#ffffff" />
                  <rect x="9" y="45" width="6" height="6" fill="#012d1d" />
                  <rect x="24" y="8" width="4" height="4" fill="#012d1d" />
                  <rect x="30" y="12" width="4" height="8" fill="#012d1d" />
                  <rect x="24" y="24" width="12" height="12" fill="#006c49" />
                  <rect x="40" y="26" width="6" height="6" fill="#012d1d" />
                  <rect x="24" y="42" width="8" height="4" fill="#012d1d" />
                  <rect x="36" y="40" width="16" height="6" fill="#012d1d" />
                  <rect x="44" y="50" width="10" height="6" fill="#012d1d" />
                </svg>
                <div className="min-w-0">
                  <span className="inline-block px-2 py-0.5 bg-secondary-container border border-primary font-mono text-[10px] font-bold text-primary uppercase">
                    WEIGHBRIDGE VERIFIED
                  </span>
                  <div className="font-mono text-sm font-bold text-primary truncate mt-1">
                    {activePassportHarvest.batch_code || 'LOT-UNASSIGNED'}
                  </div>
                  <div className="font-mono text-[11px] text-on-surface-variant">
                    Harvested {activePassportHarvest.harvest_date}
                  </div>
                </div>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between border-b border-dashed border-primary/40 pb-1">
                  <span className="text-on-surface-variant">CROP SPECIMEN</span>
                  <span className="font-bold text-primary">
                    {activePassportCycle?.crop_name || 'Linked Cycle'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-dashed border-primary/40 pb-1">
                  <span className="text-on-surface-variant">MEASURED WEIGHT</span>
                  <span className="font-bold text-secondary">
                    {activePassportHarvest.measured_weight.toLocaleString('en-IN')}{' '}
                    {activePassportHarvest.weight_unit}
                  </span>
                </div>
                <div className="flex justify-between border-b border-dashed border-primary/40 pb-1">
                  <span className="text-on-surface-variant">NORMALIZED MASS</span>
                  <span className="font-bold text-primary">
                    {normalizeWeightToKg(
                      activePassportHarvest.measured_weight,
                      activePassportHarvest.weight_unit
                    ).toLocaleString('en-IN')}{' '}
                    kg
                  </span>
                </div>
                <div className="flex justify-between border-b border-dashed border-primary/40 pb-1">
                  <span className="text-on-surface-variant">STORAGE BAY</span>
                  <span className="font-bold text-primary truncate max-w-[180px]">
                    {activePassportHarvest.storage_location || 'Not recorded'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">HARVEST COST</span>
                  <span className="font-bold text-primary">
                    {formatCurrencyOrMissing(activePassportHarvest.harvest_cost)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center font-mono text-xs text-on-surface-variant">
              Record a harvest batch to generate its traceability passport.
            </div>
          )}
        </div>
      </div>

      {/* Harvest Specimen Cards + Ledger Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-primary" />
            <h2 className="font-headline-md text-xl font-bold text-primary uppercase">
              Measured Harvest Batches ({harvests.length})
            </h2>
          </div>
          <span className="font-mono text-xs font-bold text-on-surface-variant">
            CLICK ANY BATCH ROW TO INSPECT PASSPORT
          </span>
        </div>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary shadow-[5px_5px_0px_#012d1d] overflow-x-auto">
          {harvests.length === 0 ? (
            <div className="p-8 text-center font-mono text-sm text-on-surface-variant">
              No harvest records logged yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-primary bg-surface-container-low font-label-md text-xs font-bold text-primary uppercase">
                  <th className="py-3.5 px-4">Harvest Date</th>
                  <th className="py-3.5 px-4">Crop &amp; Batch Code</th>
                  <th className="py-3.5 px-4 text-right">Measured Weight</th>
                  <th className="py-3.5 px-4 text-right">Normalized (kg)</th>
                  <th className="py-3.5 px-4">Storage &amp; Notes</th>
                  <th className="py-3.5 px-4 text-right">Harvest Cost</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-primary/20 text-xs">
                {harvests.map((h) => {
                  const cycle = cycleMap.get(h.crop_cycle_id);
                  const normalizedKg = normalizeWeightToKg(h.measured_weight, h.weight_unit);
                  const isSelected = activePassportHarvest?.id === h.id;
                  return (
                    <tr
                      key={h.id}
                      onClick={() => setSelectedBatchId(h.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-secondary-container/40'
                          : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-primary whitespace-nowrap">
                        {h.harvest_date}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-primary text-sm">
                          {cycle ? cycle.crop_name : 'Unlinked Crop'}
                          {h.is_demo && (
                            <span className="ml-2 px-1.5 py-0.5 bg-tertiary-fixed border border-primary font-mono text-[10px] font-bold text-on-tertiary-fixed uppercase">
                              Demo Data
                            </span>
                          )}
                        </div>
                        <div className="text-on-surface-variant font-mono font-bold tabular-nums">
                          Batch: {h.batch_code || 'Unassigned'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-primary whitespace-nowrap">
                        {h.measured_weight.toLocaleString('en-IN')} {h.weight_unit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-secondary whitespace-nowrap">
                        {normalizedKg.toLocaleString('en-IN')} kg
                      </td>
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="font-bold text-primary">
                          {h.storage_location || 'Not recorded'}
                        </div>
                        {h.notes && <div className="text-on-surface-variant mt-0.5">{h.notes}</div>}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-primary whitespace-nowrap">
                        {formatCurrencyOrMissing(h.harvest_cost)}
                      </td>
                      <td
                        className="py-3.5 px-4 text-right whitespace-nowrap space-x-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => startEdit(h)}
                          aria-label={`Edit harvest on ${h.harvest_date}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-container-low border border-primary font-label-md text-xs font-bold text-primary hover:bg-tertiary-fixed cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(h.id)}
                          aria-label={`Delete harvest on ${h.harvest_date}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-error-container border border-primary font-label-md text-xs font-bold text-on-error-container hover:opacity-90 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
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
