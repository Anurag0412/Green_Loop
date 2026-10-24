import React, { useState } from 'react';
import type { Farm, FarmInput, Plot, PlotInput } from '../shared/validation';
import { api, ApiClientError } from '../lib/api';

interface Props {
  ownerId: string;
  farms: Farm[];
  plots: Plot[];
  onRefresh: () => Promise<void>;
}

const PLOT_SPECIMEN_PHOTOS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAMi8Hl3DImtp0DTXK2ATUYzUSntwN9F-Blhd5U2ZH2fgDHB4KMEsrnP7dq4uUIwlvi0CB3PXJPqk41drhSv5HWWtxJnFu394dhP-bJzanrCIk423F-5G5KGoJkkizi61rxmIvHvA1cEHxgZwBpT3j2YhVp_V1KATk7us8sP5TyxeT-xcgjnUxd_K-8cWx2hCqPnLo72p0tVWi-E5hRFUYoiHTytlyHdat4V_TtgvR62e7TyCRYaB_tlQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBt3Re4kEJzFfECtVOB_FO0Zc8AbcShAF5yh-fJnzGR6rWrZJG20Tj7v8dvX2fwV3099dEf7u84B4-DGfU3Oe6duEKdzF5iJBEdHP1Chh1uXLibWr4gn_Nx5uMa3Nj3Djq0pw5ISGkPHRfmVfrJQYvUtrmxX59NN04Akkfpic4rFxgJn_m3EdcBxJ5FF50xD3R-boNzCjldIAEmiNRYRJZoiJZ_l_qp-yPbAhzBr9GeU8WP6kZb_9McAQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCoOboOmFacRiFOl-zGKPqXWxBB2W3QxUCfeNrBEO07ThDqmXUAEHquzihgKAcsdyqU6MQRWcoJJwlTuiy4nnBJ49bZicWzc3rSLk5gdc-jiJKbZeuyEI6pHnUUbswmG7l1jXATH-p2mJQjz7UfpqWOWke2zwjN8RfyqHj8UUkG-Afg5719i0dcRV6B8pnsmbXBUeZ_i5Als67-F190ANDrH2daYe8MC2tiHDiSweRUeTkSwMi2i5jNog',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBDAG-p57NsbWvoQx7MK-neI0AauMyKuoXfBvpQHn7Azbj3hzSVfPjslekI_jN2MRt6Dc1kWkR74TNW0SEYN7ytdtEufX8z2jj11VCGbBJ0yfNoMA8cz_E_xqZzkAP4UxoqDbguQWxZBOsyC4PhOObZ2D6hNwlvaKjI8kU3zRrWy4Hn_pW4Pz7I1bC_M3wGBtiz5qQhkBm6LaUiok4xfOX42mOanby2LNkBZQRVPAI3erWp0zKZW8LMbQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAf1vnGC6afhe9CjOIUx1ATeFj4izaVYZjvusFocMnw6tEXhH7bhlAryywD0QwN-QR7lxBLcoCIsX5hmF12y6S2KtIq0O89h_W5RytgYa3a9jMAQkyE3h9pzqMWmvgFV_kaAlXz0givxNRRW8h3XefXl_3Lu_QC4jZj5ePHz2nrb5tycpmEtGM4X81K6J8H83ETjUiBp6WWLOrFqkg6jfBzwqarjphQ4R1uAxVzTF3r7JZyR6YG0xmPBQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCEz4jlUHU5AaEuxK4voDTKIck8azpZ-lCFDdraO_-7uncuGuGFmsT6N5JatU2Ylmi80AP8vI9P0nNp50JJh3oEQzToDk9SuqXg4EVas3WdWgnma-edErZwgG92Z0CZvao3_QlWVqNT8VidM98DJZGGyjBChG3XZrU74VqSH0JgqCqOjxtdIt5dst_w0SzBVv6q6b3zlqbDtbP9JkGIlGx0Srh-LBQ164sDu7E7-i70WCimtgaxxwoX3g',
];

export function FarmsAndPlotsModule({ ownerId, farms, plots, onRefresh }: Props) {
  // Farm form state
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [farmArea, setFarmArea] = useState('');
  const [farmSoilSummary, setFarmSoilSummary] = useState('');
  const [farmWaterSource, setFarmWaterSource] = useState('');
  const [farmNotes, setFarmNotes] = useState('');
  const [farmError, setFarmError] = useState<string | null>(null);
  const [farmSubmitting, setFarmSubmitting] = useState(false);

  // Plot form state
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [plotFarmId, setPlotFarmId] = useState<string>(farms[0]?.id || '');
  const [plotName, setPlotName] = useState('');
  const [plotArea, setPlotArea] = useState('');
  const [plotSoilType, setPlotSoilType] = useState('');
  const [plotSoilPh, setPlotSoilPh] = useState('');
  const [plotIrrigation, setPlotIrrigation] = useState('');
  const [plotCoords, setPlotCoords] = useState('');
  const [plotNotes, setPlotNotes] = useState('');
  const [plotError, setPlotError] = useState<string | null>(null);
  const [plotSubmitting, setPlotSubmitting] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [selectedFarmFilter, setSelectedFarmFilter] = useState<string>('all');

  function resetFarmForm() {
    setEditingFarmId(null);
    setFarmName('');
    setFarmLocation('');
    setFarmArea('');
    setFarmSoilSummary('');
    setFarmWaterSource('');
    setFarmNotes('');
    setFarmError(null);
  }

  function startEditFarm(farm: Farm) {
    setEditingFarmId(farm.id);
    setFarmName(farm.name);
    setFarmLocation(farm.location);
    setFarmArea(farm.total_area_acres !== null ? String(farm.total_area_acres) : '');
    setFarmSoilSummary(farm.soil_summary || '');
    setFarmWaterSource(farm.water_source || '');
    setFarmNotes(farm.notes || '');
    setFarmError(null);
  }

  async function handleFarmSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFarmError(null);

    if (!farmName.trim() || !farmLocation.trim()) {
      setFarmError('Farm name and location are required.');
      return;
    }

    const payload: FarmInput = {
      name: farmName.trim(),
      location: farmLocation.trim(),
      total_area_acres: farmArea.trim() === '' ? null : Number(farmArea),
      soil_summary: farmSoilSummary.trim() || null,
      water_source: farmWaterSource.trim() || null,
      notes: farmNotes.trim() || null,
    };

    if (
      payload.total_area_acres !== null &&
      (Number.isNaN(payload.total_area_acres) || payload.total_area_acres <= 0)
    ) {
      setFarmError('Total area must be a positive number greater than 0, or left blank if unknown.');
      return;
    }

    setFarmSubmitting(true);
    try {
      if (editingFarmId) {
        const res = await api.updateFarm(ownerId, editingFarmId, payload);
        if (res.storage_notice) setStorageNotice(res.storage_notice);
      } else {
        const res = await api.createFarm(ownerId, payload);
        if (!plotFarmId) setPlotFarmId(res.data.id);
        if (res.storage_notice) setStorageNotice(res.storage_notice);
      }
      resetFarmForm();
      await onRefresh();
    } catch (err) {
      setFarmError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to save farm.'
      );
    } finally {
      setFarmSubmitting(false);
    }
  }

  async function handleDeleteFarm(farmId: string) {
    try {
      const res = await api.deleteFarm(ownerId, farmId);
      if (res.storage_notice) setStorageNotice(res.storage_notice);
      if (editingFarmId === farmId) resetFarmForm();
      await onRefresh();
    } catch (err) {
      setFarmError(err instanceof Error ? err.message : 'Could not delete farm');
    }
  }

  function resetPlotForm() {
    setEditingPlotId(null);
    setPlotName('');
    setPlotArea('');
    setPlotSoilType('');
    setPlotSoilPh('');
    setPlotIrrigation('');
    setPlotCoords('');
    setPlotNotes('');
    setPlotError(null);
  }

  function startEditPlot(plot: Plot) {
    setEditingPlotId(plot.id);
    setPlotFarmId(plot.farm_id);
    setPlotName(plot.name);
    setPlotArea(String(plot.area_acres));
    setPlotSoilType(plot.soil_type || '');
    setPlotSoilPh(plot.soil_ph !== null ? String(plot.soil_ph) : '');
    setPlotIrrigation(plot.irrigation_type || '');
    setPlotCoords(plot.location_coordinates || '');
    setPlotNotes(plot.notes || '');
    setPlotError(null);
  }

  async function handlePlotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPlotError(null);

    const targetFarmId = plotFarmId || farms[0]?.id || '';
    if (!targetFarmId) {
      setPlotError('Please create or select a parent farm first.');
      return;
    }
    if (!plotName.trim() || !plotArea.trim()) {
      setPlotError('Plot name and measured area (in acres) are required.');
      return;
    }

    const areaNum = Number(plotArea);
    if (Number.isNaN(areaNum) || areaNum <= 0) {
      setPlotError('Plot area must be a positive number greater than 0.');
      return;
    }

    const phNum = plotSoilPh.trim() === '' ? null : Number(plotSoilPh);
    if (phNum !== null && (Number.isNaN(phNum) || phNum < 0 || phNum > 14)) {
      setPlotError('Soil pH must be between 0 and 14, or left blank if untested.');
      return;
    }

    const payload: PlotInput = {
      farm_id: targetFarmId,
      name: plotName.trim(),
      area_acres: areaNum,
      soil_type: plotSoilType.trim() || null,
      soil_ph: phNum,
      irrigation_type: plotIrrigation.trim() || null,
      location_coordinates: plotCoords.trim() || null,
      notes: plotNotes.trim() || null,
    };

    setPlotSubmitting(true);
    try {
      if (editingPlotId) {
        const res = await api.updatePlot(ownerId, editingPlotId, payload);
        if (res.storage_notice) setStorageNotice(res.storage_notice);
      } else {
        const res = await api.createPlot(ownerId, payload);
        if (res.storage_notice) setStorageNotice(res.storage_notice);
      }
      resetPlotForm();
      await onRefresh();
    } catch (err) {
      setPlotError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to save plot.'
      );
    } finally {
      setPlotSubmitting(false);
    }
  }

  async function handleDeletePlot(plotId: string) {
    try {
      const res = await api.deletePlot(ownerId, plotId);
      if (res.storage_notice) setStorageNotice(res.storage_notice);
      if (editingPlotId === plotId) resetPlotForm();
      await onRefresh();
    } catch (err) {
      setPlotError(err instanceof Error ? err.message : 'Could not delete plot');
    }
  }

  const totalSubdividedAcres = plots.reduce((sum, p) => sum + p.area_acres, 0);
  const filteredPlots =
    selectedFarmFilter === 'all'
      ? plots
      : plots.filter((p) => p.farm_id === selectedFarmFilter);
  const farmMap = new Map(farms.map((f) => [f.id, f]));

  return (
    <div className="space-y-space-xl">
      {/* Top Cadastral Ledger Strip / Title Billboard (CraveQuest Screen 2 Style) */}
      <div className="relative bg-surface-container-lowest p-space-md lg:p-space-lg rounded-xl border-[2.5px] border-primary brutal-shadow">
        {/* Decorative Stationery Mask Pins / Stamp Badges */}
        <div className="absolute -top-3 left-12 washi-tape px-6 py-1 border-[1.5px] border-primary/40 rotate-[-1.5deg] shadow-sm z-10">
          <span className="font-label-sm text-label-sm text-primary tracking-widest uppercase font-bold">
            LEDGER VOL. 18 / CADASTRE SECTION 04
          </span>
        </div>
        <div className="absolute -right-3 -top-3 bg-tertiary-fixed border-2 border-primary px-4 py-1.5 rotate-[4deg] brutal-shadow-sm z-10 hidden sm:flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
          <span className="font-label-sm text-label-sm text-primary font-bold tracking-tight">
            CADASTRE SYNCHRONIZED
          </span>
        </div>

        <div className="pt-space-sm flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="space-y-space-xs max-w-2xl">
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="px-2.5 py-0.5 rounded bg-primary-fixed border border-primary font-label-sm text-label-sm text-primary font-bold">
                01. LAND REGISTRY &amp; SOIL BASELINE
              </span>
              <span className="text-outline font-label-sm text-label-sm">●</span>
              <span className="font-label-md text-label-md text-secondary font-bold tracking-wide">
                PRECISION AG-GRID MESH
              </span>
            </div>

            <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight leading-none">
              Farms &amp; Plot Management
            </h1>

            <p className="font-body-md text-body-md text-on-surface-variant">
              Register farm holdings and subdivided cultivation plots comprising{' '}
              <strong className="text-primary font-bold font-mono">
                {totalSubdividedAcres.toFixed(2)} subdivided acres
              </strong>{' '}
              across {farms.length} registered farm(s). Leave soil pH or area fields blank when not
              yet measured—never estimate unverified soil tests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            <a
              href="#farm-form-anchor"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-container border-2 border-primary font-label-md text-label-md text-primary font-bold brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px] text-secondary">
                agriculture
              </span>
              <span>+ Register Farm</span>
            </a>
            <a
              href="#plot-form-anchor"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-on-secondary border-[2.5px] border-primary font-label-lg text-label-lg font-bold brutal-shadow hover:-translate-y-0.5 active:translate-y-0.5 transition-transform"
            >
              <span className="material-symbols-outlined text-[22px]">add_circle</span>
              <span>+ Add New Plot</span>
            </a>
          </div>
        </div>

        {/* Micro Ledger Tape Ribbon */}
        <div className="mt-space-md pt-space-sm border-t-2 border-dashed border-outline-variant flex flex-wrap items-center justify-between gap-space-sm font-label-sm text-label-sm text-on-surface-variant">
          <div className="flex items-center gap-space-md">
            <span>SURVEY STAMP: #GL-CADASTRE-2026</span>
            <span>HOLDINGS: {farms.length} FARMS</span>
            <span>SUBDIVIDED PARCELS: {plots.length} PLOTS</span>
          </div>
          <div className="flex items-center gap-2 bg-secondary-fixed/70 px-2.5 py-0.5 rounded border border-primary text-on-secondary-fixed font-bold">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            <span>OWNER-SCOPED RLS LEDGER</span>
          </div>
        </div>
      </div>

      {storageNotice && (
        <div className="p-3.5 bg-secondary-fixed border-2 border-primary rounded-xl font-body-sm text-body-sm text-primary font-semibold brutal-shadow-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[20px]">task_alt</span>
            <span>{storageNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setStorageNotice(null)}
            className="font-label-sm text-label-sm font-bold text-primary underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Two-Column Forms Grid (Neo-Brutalist Field Ledger Forms) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter items-start">
        {/* Farm Form */}
        <form
          id="farm-form-anchor"
          onSubmit={handleFarmSubmit}
          className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-md lg:p-space-lg space-y-4 brutal-shadow"
        >
          <div className="flex items-center justify-between border-b-2 border-primary pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                domain_add
              </span>
              <h2 className="font-headline-sm text-headline-sm text-primary">
                {editingFarmId ? 'Edit Farm Holding' : 'Register Farm Holding'}
              </h2>
            </div>
            {editingFarmId && (
              <button
                type="button"
                onClick={resetFarmForm}
                className="font-label-sm text-label-sm font-bold text-error hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {farmError && (
            <div
              role="alert"
              className="p-3 bg-error-container border-2 border-error rounded-lg font-body-sm text-body-sm text-on-error-container"
            >
              {farmError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="farm-name-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Farm Name *
              </label>
              <input
                id="farm-name-input"
                type="text"
                required
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g., Sunrise Valley Farm"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="farm-location-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Location (Village / District / State) *
              </label>
              <input
                id="farm-location-input"
                type="text"
                required
                value={farmLocation}
                onChange={(e) => setFarmLocation(e.target.value)}
                placeholder="e.g., Niphad, Nashik, Maharashtra"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="farm-area-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Total Area (Acres — optional)
              </label>
              <input
                id="farm-area-input"
                type="number"
                step="0.01"
                min="0.01"
                value={farmArea}
                onChange={(e) => setFarmArea(e.target.value)}
                placeholder="Leave blank if unmeasured"
                className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="farm-water-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Primary Water Source
              </label>
              <input
                id="farm-water-input"
                type="text"
                value={farmWaterSource}
                onChange={(e) => setFarmWaterSource(e.target.value)}
                placeholder="e.g., Canal lift + farm pond"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="farm-soil-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Soil Summary (When Known)
            </label>
            <input
              id="farm-soil-input"
              type="text"
              value={farmSoilSummary}
              onChange={(e) => setFarmSoilSummary(e.target.value)}
              placeholder="e.g., Black calcareous clay loam, moderate drainage"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div>
            <label
              htmlFor="farm-notes-input"
              className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
            >
              Field Notes
            </label>
            <textarea
              id="farm-notes-input"
              rows={2}
              value={farmNotes}
              onChange={(e) => setFarmNotes(e.target.value)}
              placeholder="Boundaries, topography, or land history"
              className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
            />
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={farmSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-label-md font-bold text-on-secondary bg-secondary hover:bg-secondary/95 border-2 border-primary rounded-lg brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>
                {farmSubmitting
                  ? 'Saving...'
                  : editingFarmId
                    ? 'Update Farm Record'
                    : 'Save Farm Holding'}
              </span>
            </button>
          </div>
        </form>

        {/* Plot Form */}
        <form
          id="plot-form-anchor"
          onSubmit={handlePlotSubmit}
          className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-space-md lg:p-space-lg space-y-4 brutal-shadow"
        >
          <div className="flex items-center justify-between border-b-2 border-primary pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[22px]">grid_on</span>
              <h2 className="font-headline-sm text-headline-sm text-primary">
                {editingPlotId ? 'Edit Plot' : 'Add Subdivided Plot'}
              </h2>
            </div>
            {editingPlotId && (
              <button
                type="button"
                onClick={resetPlotForm}
                className="font-label-sm text-label-sm font-bold text-error hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {plotError && (
            <div
              role="alert"
              className="p-3 bg-error-container border-2 border-error rounded-lg font-body-sm text-body-sm text-on-error-container"
            >
              {plotError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="plot-farm-select"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Parent Farm *
              </label>
              <select
                id="plot-farm-select"
                value={plotFarmId || farms[0]?.id || ''}
                onChange={(e) => setPlotFarmId(e.target.value)}
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest"
              >
                {farms.length === 0 && <option value="">No farms registered yet</option>}
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="plot-name-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Plot Identifier / Name *
              </label>
              <input
                id="plot-name-input"
                type="text"
                required
                value={plotName}
                onChange={(e) => setPlotName(e.target.value)}
                placeholder="e.g., North Terrace Plot A"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="plot-area-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Measured Area (Acres) *
              </label>
              <input
                id="plot-area-input"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={plotArea}
                onChange={(e) => setPlotArea(e.target.value)}
                placeholder="e.g., 4.0"
                className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="plot-soil-type-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Soil Type (When Known)
              </label>
              <input
                id="plot-soil-type-input"
                type="text"
                value={plotSoilType}
                onChange={(e) => setPlotSoilType(e.target.value)}
                placeholder="e.g., Black Cotton Loam"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="plot-ph-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Measured Soil pH (0–14, optional)
              </label>
              <input
                id="plot-ph-input"
                type="number"
                step="0.1"
                min="0"
                max="14"
                value={plotSoilPh}
                onChange={(e) => setPlotSoilPh(e.target.value)}
                placeholder="Leave blank if untested"
                className="w-full px-3 py-2 font-mono tabular-nums font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="plot-irrigation-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Irrigation Method
              </label>
              <input
                id="plot-irrigation-input"
                type="text"
                value={plotIrrigation}
                onChange={(e) => setPlotIrrigation(e.target.value)}
                placeholder="e.g., Inline Drip 16mm / Rainfed"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="plot-coords-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Coordinates / Landmark
              </label>
              <input
                id="plot-coords-input"
                type="text"
                value={plotCoords}
                onChange={(e) => setPlotCoords(e.target.value)}
                placeholder="e.g., 20.0784° N, 74.1062° E"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>

            <div>
              <label
                htmlFor="plot-notes-input"
                className="block font-label-sm text-label-sm font-bold uppercase text-primary mb-1"
              >
                Plot Notes
              </label>
              <input
                id="plot-notes-input"
                type="text"
                value={plotNotes}
                onChange={(e) => setPlotNotes(e.target.value)}
                placeholder="Drainage, previous residue, or mulch"
                className="w-full px-3 py-2 font-body-sm text-body-sm bg-surface border-2 border-primary rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:shadow-[3px_3px_0px_#006c48]"
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={plotSubmitting || farms.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-label-md font-bold text-on-secondary bg-secondary hover:bg-secondary/95 border-2 border-primary rounded-lg brutal-shadow-sm hover:-translate-y-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>
                {plotSubmitting
                  ? 'Saving...'
                  : editingPlotId
                    ? 'Update Plot Record'
                    : 'Add Plot to Farm'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Category Filter Tabs & Status Pill Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedFarmFilter('all')}
            className={`px-4 py-2 rounded-lg font-label-md text-label-md font-bold border-2 border-primary brutal-shadow-sm flex items-center gap-2 shrink-0 cursor-pointer transition-all ${
              selectedFarmFilter === 'all'
                ? 'bg-primary-container text-on-primary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'
            }`}
          >
            <span>All Plots</span>
            <span className="px-1.5 py-0.2 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-bold">
              {plots.length}
            </span>
          </button>

          {farms.map((farm) => {
            const count = plots.filter((p) => p.farm_id === farm.id).length;
            const active = selectedFarmFilter === farm.id;
            return (
              <button
                key={farm.id}
                type="button"
                onClick={() => setSelectedFarmFilter(farm.id)}
                className={`px-4 py-2 rounded-lg font-label-md text-label-md font-bold border-2 border-primary brutal-shadow-sm flex items-center gap-2 shrink-0 cursor-pointer transition-all ${
                  active
                    ? 'bg-primary-container text-on-primary'
                    : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                }`}
              >
                <span>{farm.name}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high text-primary text-[11px] font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-tertiary-fixed border-2 border-primary font-label-sm text-label-sm text-on-tertiary-fixed font-bold brutal-shadow-sm">
            <span className="material-symbols-outlined text-[16px]">sensors</span>
            <span>CADASTRE VERIFIED</span>
          </div>
        </div>
      </div>

      {/* Detailed Plot Specimen Cards Grid (CraveQuest Screen 2 Bento) */}
      {filteredPlots.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {filteredPlots.map((plot, idx) => {
            const parentFarm = farmMap.get(plot.farm_id);
            const photo = PLOT_SPECIMEN_PHOTOS[idx % PLOT_SPECIMEN_PHOTOS.length];
            return (
              <div
                key={plot.id}
                className="group relative bg-surface-container-lowest rounded-xl border-[2.5px] border-primary p-4 brutal-shadow hover:-translate-y-1 transition-all flex flex-col justify-between"
              >
                {/* Floating Specimen Washi Tag */}
                <div className="absolute -top-3 right-4 bg-tertiary-fixed border-2 border-primary px-3 py-0.5 rotate-[2deg] brutal-shadow-sm z-10 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span className="font-label-sm text-label-sm text-primary font-black uppercase">
                    SPECIMEN #{String(idx + 1).padStart(2, '0')}
                  </span>
                </div>

                <div>
                  {/* Specimen Photo & Overlay Status Badges */}
                  <div className="relative w-full h-40 rounded-lg overflow-hidden border-2 border-primary mb-3 bg-surface-container">
                    <img
                      src={photo}
                      alt={plot.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className="px-2 py-0.5 rounded bg-surface-container-lowest/95 border border-primary font-label-sm text-label-sm text-primary font-bold shadow-sm font-mono">
                        {plot.area_acres.toFixed(2)} ACRES
                      </span>
                      <span className="px-2 py-0.5 rounded bg-secondary-fixed border border-primary font-label-sm text-label-sm text-on-secondary-fixed font-bold shadow-sm flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                        {parentFarm?.name || 'Registered Holding'}
                      </span>
                    </div>
                  </div>

                  {/* Parcel Identity & Soil */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between font-label-sm text-label-sm">
                      <span className="text-secondary font-bold uppercase tracking-wider">
                        {plot.location_coordinates || parentFarm?.location || 'SURVEYED SECTOR'}
                      </span>
                      <span className="text-outline font-mono">
                        pH {plot.soil_ph !== null ? plot.soil_ph.toFixed(1) : 'Untested'}
                      </span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm text-primary mt-0.5">
                      {plot.name}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                      Soil: {plot.soil_type || 'Not recorded'} · Irrigation:{' '}
                      {plot.irrigation_type || 'Not recorded'}
                    </p>
                  </div>

                  {/* Specimen Sensor Dials (Mini Ledgers) */}
                  <div className="grid grid-cols-3 gap-1.5 bg-surface-container-low p-2 rounded-lg border border-primary/50 mb-3 font-label-sm text-label-sm">
                    <div className="text-center p-1 bg-surface-container-lowest rounded border border-primary/20">
                      <span className="text-outline text-[10px] block uppercase">Area</span>
                      <span className="font-bold text-primary text-[13px] font-mono">
                        {plot.area_acres.toFixed(2)} ac
                      </span>
                    </div>
                    <div className="text-center p-1 bg-surface-container-lowest rounded border border-primary/20">
                      <span className="text-outline text-[10px] block uppercase">Soil pH</span>
                      <span className="font-bold text-primary text-[13px] font-mono">
                        {plot.soil_ph !== null ? plot.soil_ph.toFixed(1) : 'N/A'}
                      </span>
                    </div>
                    <div className="text-center p-1 bg-surface-container-lowest rounded border border-primary/20">
                      <span className="text-outline text-[10px] block uppercase">Status</span>
                      <span className="font-bold text-secondary text-[13px]"> Active</span>
                    </div>
                  </div>
                </div>

                {/* Card Footprint & Edit/Delete */}
                <div className="pt-2 border-t-2 border-dashed border-primary/20 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => startEditPlot(plot)}
                    className="px-3 py-1 rounded bg-surface-container-low hover:bg-secondary-fixed text-primary border border-primary font-label-sm text-label-sm font-bold cursor-pointer"
                  >
                    Edit Plot
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePlot(plot.id)}
                    className="px-3 py-1 rounded bg-error-container hover:bg-error hover:text-on-error text-on-error-container border border-primary font-label-sm text-label-sm font-bold cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Registered Farms & Nested Plots Cadastral Directory */}
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-surface-container-lowest px-space-md py-3 rounded-xl border-2 border-primary brutal-shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">
              folder_managed
            </span>
            <h2 className="font-headline-sm text-headline-sm text-primary">
              Registered Holdings ({farms.length} Farms · {plots.length} Plots)
            </h2>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold">
            CADASTRAL DIRECTORY
          </span>
        </div>

        {farms.length === 0 ? (
          <div className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl p-8 text-center brutal-shadow">
            <p className="font-body-md text-body-md text-on-surface-variant">
              No farms registered for this workspace yet. Use the form above to add your first farm
              holding.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {farms.map((farm) => {
              const farmPlots = plots.filter((p) => p.farm_id === farm.id);
              return (
                <div
                  key={farm.id}
                  className="bg-surface-container-lowest border-[2.5px] border-primary rounded-xl overflow-hidden brutal-shadow"
                >
                  <div className="p-6 bg-surface-container-low border-b-2 border-primary flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary-fixed border border-primary text-primary font-bold">
                          <span className="material-symbols-outlined text-[14px]">location_on</span>
                          {farm.location}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums font-bold text-primary">
                          {farm.total_area_acres !== null
                            ? `${farm.total_area_acres} acres total`
                            : 'Total area not recorded'}
                        </span>
                        {farm.is_demo && (
                          <span className="px-2 py-0.5 rounded bg-tertiary-fixed border border-primary font-bold text-primary">
                            [Demo Data]
                          </span>
                        )}
                      </div>
                      <h3 className="font-headline-md text-headline-md text-primary pt-1">
                        {farm.name}
                      </h3>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Soil: <strong className="text-primary">{farm.soil_summary || 'Not recorded'}</strong> · Water:{' '}
                        <strong className="text-primary">{farm.water_source || 'Not recorded'}</strong>
                      </p>
                      {farm.notes && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant pt-1">
                          {farm.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditFarm(farm)}
                        aria-label={`Edit ${farm.name}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 font-label-sm text-label-sm font-bold text-primary bg-surface-container-lowest hover:bg-secondary-fixed border-2 border-primary rounded-lg brutal-shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Edit Farm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFarm(farm.id)}
                        aria-label={`Delete ${farm.name}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 font-label-sm text-label-sm font-bold text-on-error-container bg-error-container hover:bg-error hover:text-on-error border-2 border-primary rounded-lg brutal-shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Plots Table inside Farm */}
                  <div className="overflow-x-auto">
                    {farmPlots.length === 0 ? (
                      <div className="p-4 font-body-sm text-body-sm text-on-surface-variant bg-surface-container-lowest">
                        No plots subdivided under {farm.name} yet.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b-2 border-primary bg-surface-container font-label-sm text-label-sm font-bold text-primary uppercase tracking-wider">
                            <th className="py-2.5 px-4">Plot Name</th>
                            <th className="py-2.5 px-4 text-right">Area (Acres)</th>
                            <th className="py-2.5 px-4">Soil Type</th>
                            <th className="py-2.5 px-4 text-right">Soil pH</th>
                            <th className="py-2.5 px-4">Irrigation</th>
                            <th className="py-2.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm">
                          {farmPlots.map((plot) => (
                            <tr
                              key={plot.id}
                              className="hover:bg-surface-container-low transition-colors"
                            >
                              <td className="py-3 px-4 font-bold text-primary">
                                {plot.name}
                                {plot.is_demo && (
                                  <span className="ml-2 font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-tertiary-fixed text-primary border border-primary">
                                    [Demo Data]
                                  </span>
                                )}
                                {plot.location_coordinates && (
                                  <div className="text-[11px] text-on-surface-variant font-mono tabular-nums font-normal">
                                    {plot.location_coordinates}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-primary">
                                {plot.area_acres.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-on-surface-variant">
                                {plot.soil_type || 'Not recorded'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-primary font-bold">
                                {plot.soil_ph !== null ? plot.soil_ph.toFixed(1) : 'Not recorded'}
                              </td>
                              <td className="py-3 px-4 text-on-surface-variant">
                                {plot.irrigation_type || 'Not recorded'}
                              </td>
                              <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => startEditPlot(plot)}
                                  aria-label={`Edit plot ${plot.name}`}
                                  className="font-label-sm text-label-sm font-bold text-secondary hover:underline cursor-pointer"
                                >
                                  Edit
                                </button>
                                <span aria-hidden="true" className="text-outline">
                                  ·
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePlot(plot.id)}
                                  aria-label={`Delete plot ${plot.name}`}
                                  className="font-label-sm text-label-sm font-bold text-error hover:underline cursor-pointer"
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
