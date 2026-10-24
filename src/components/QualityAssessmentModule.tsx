import React, { useState, useEffect } from 'react';
import { Upload, Sparkles, CheckCircle2, AlertTriangle, Trash2, Edit2, Eye } from 'lucide-react';
import {
  FARMER_REVIEW_STATUSES,
  FARMER_FINAL_GRADES,
  type CropCycle,
  type Harvest,
  type QualityAssessment,
  type QualityAssessmentInput,
} from '../shared/validation';
import {
  api,
  ApiClientError,
  generateSampleCropSpecimenDataUrl,
  formatStageLabel,
} from '../lib/api';

interface Props {
  ownerId: string;
  geminiConfigured: boolean;
  cropCycles: CropCycle[];
  harvests: Harvest[];
  qualityAssessments: QualityAssessment[];
  onRefresh: () => Promise<void>;
}

export function QualityAssessmentModule({
  ownerId,
  geminiConfigured,
  cropCycles,
  harvests,
  qualityAssessments,
  onRefresh,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cropCycleId, setCropCycleId] = useState<string>(cropCycles[0]?.id || '');
  const [harvestId, setHarvestId] = useState<string>('');
  const [cropName, setCropName] = useState<string>(cropCycles[0]?.crop_name || 'Roma Tomato');
  const [assessmentDate, setAssessmentDate] = useState<string>('2026-10-23');
  const [imageLabel, setImageLabel] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imageMimeType, setImageMimeType] = useState<string>('image/png');
  const [farmerContext, setFarmerContext] = useState<string>('');

  // Assessment characteristics
  const [visibleRipeness, setVisibleRipeness] = useState<string>('');
  const [visibleDefects, setVisibleDefects] = useState<string>('');
  const [colorUniformity, setColorUniformity] = useState<string>('');
  const [surfaceCondition, setSurfaceCondition] = useState<string>('');
  const [experimentalSummary, setExperimentalSummary] = useState<string>('');
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(false);

  // Farmer review before saving
  const [reviewStatus, setReviewStatus] =
    useState<QualityAssessment['farmer_review_status']>('pending_review');
  const [finalGrade, setFinalGrade] = useState<QualityAssessment['farmer_final_grade']>(null);
  const [farmerNotes, setFarmerNotes] = useState<string>('');

  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId && cropCycles.length > 0 && !cropCycleId) {
      setCropCycleId(cropCycles[0].id);
      setCropName(cropCycles[0].crop_name);
    }
  }, [cropCycles, cropCycleId, editingId]);

  const filteredHarvests = cropCycleId
    ? harvests.filter((h) => h.crop_cycle_id === cropCycleId)
    : harvests;

  function handleCycleChange(nextCycleId: string) {
    setCropCycleId(nextCycleId);
    const matchedCycle = cropCycles.find((c) => c.id === nextCycleId);
    if (matchedCycle) {
      setCropName(matchedCycle.crop_name);
      const matchingHarvests = harvests.filter((h) => h.crop_cycle_id === nextCycleId);
      setHarvestId(matchingHarvests[0]?.id || '');
    } else {
      setHarvestId('');
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError('Please upload a valid JPEG, PNG, WEBP, or GIF crop image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
        setImageMimeType(file.type);
        setImageLabel(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleLoadSpecimen(preset: 'tomato' | 'soybean') {
    setError(null);
    const specimen = generateSampleCropSpecimenDataUrl(preset);
    setImageDataUrl(specimen.dataUrl);
    setImageMimeType(specimen.mimeType);
    setImageLabel(specimen.label);
    const matchedCycle = cropCycles.find((c) => c.id === cropCycleId);
    if (!matchedCycle) {
      setCropName(specimen.cropName);
    }
  }

  async function handleRunExperimentalAnalysis() {
    setError(null);
    setAiNotice(null);
    if (!imageDataUrl) {
      setError('Please upload a crop image or load a sample specimen first.');
      return;
    }
    if (!cropName.trim()) {
      setError('Please enter the crop name before analyzing.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await api.analyzeCropImage(ownerId, {
        crop_name: cropName.trim(),
        image_base64: imageDataUrl,
        mime_type: imageMimeType,
        farmer_context: farmerContext.trim() || undefined,
      });
      setVisibleRipeness(res.analysis.visible_ripeness);
      setVisibleDefects(res.analysis.visible_defects);
      setColorUniformity(res.analysis.color_uniformity);
      setSurfaceCondition(res.analysis.surface_condition);
      setExperimentalSummary(res.analysis.experimental_ai_summary);
      setIsAiGenerated(true);
      setReviewStatus('pending_review');
      setAiNotice(res.disclaimer);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Experimental AI analysis failed. You can enter visible observations manually below.'
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function startEditAssessment(qa: QualityAssessment) {
    setEditingId(qa.id);
    setCropCycleId(qa.crop_cycle_id || '');
    setHarvestId(qa.harvest_id || '');
    setCropName(qa.crop_name);
    setAssessmentDate(qa.assessment_date);
    setImageLabel(qa.image_label || '');
    setVisibleRipeness(qa.visible_ripeness);
    setVisibleDefects(qa.visible_defects);
    setColorUniformity(qa.color_uniformity || '');
    setSurfaceCondition(qa.surface_condition || '');
    setExperimentalSummary(qa.experimental_ai_summary || '');
    setIsAiGenerated(qa.is_ai_generated);
    setReviewStatus(qa.farmer_review_status);
    setFinalGrade(qa.farmer_final_grade);
    setFarmerNotes(qa.farmer_notes || '');
    setError(null);
    setStorageNotice(null);
  }

  function cancelEditAssessment() {
    setEditingId(null);
    setVisibleRipeness('');
    setVisibleDefects('');
    setColorUniformity('');
    setSurfaceCondition('');
    setExperimentalSummary('');
    setFarmerNotes('');
    setFinalGrade(null);
    setReviewStatus('pending_review');
    setIsAiGenerated(false);
    setError(null);
  }

  async function handleSaveAssessment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStorageNotice(null);

    if (!cropName.trim() || !visibleRipeness.trim() || !visibleDefects.trim()) {
      setError('Crop name, visible ripeness, and visible defects observations are required.');
      return;
    }

    const payload: QualityAssessmentInput = {
      crop_cycle_id: cropCycleId || null,
      harvest_id: harvestId || null,
      crop_name: cropName.trim(),
      assessment_date: assessmentDate,
      image_label: imageLabel.trim() || 'Farmer Field Inspection',
      visible_ripeness: visibleRipeness.trim(),
      visible_defects: visibleDefects.trim(),
      color_uniformity: colorUniformity.trim() || null,
      surface_condition: surfaceCondition.trim() || null,
      experimental_ai_summary: experimentalSummary.trim() || null,
      is_ai_generated: isAiGenerated,
      farmer_review_status: reviewStatus,
      farmer_final_grade: finalGrade || null,
      farmer_notes: farmerNotes.trim() || null,
    };

    setSubmitting(true);
    try {
      const res = editingId
        ? await api.updateQualityAssessment(ownerId, editingId, payload)
        : await api.createQualityAssessment(ownerId, payload);
      setStorageNotice(
        `${editingId ? 'Updated' : 'Saved'} quality assessment for "${res.data.crop_name}". ${res.storage_notice}`
      );
      setEditingId(null);
      setVisibleRipeness('');
      setVisibleDefects('');
      setColorUniformity('');
      setSurfaceCondition('');
      setExperimentalSummary('');
      setFarmerNotes('');
      setFinalGrade(null);
      setReviewStatus('pending_review');
      setIsAiGenerated(false);
      setAiNotice(null);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to save quality assessment.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickVerify(
    assessment: QualityAssessment,
    nextStatus: QualityAssessment['farmer_review_status'],
    nextGrade: QualityAssessment['farmer_final_grade']
  ) {
    setError(null);
    setStorageNotice(null);
    try {
      const res = await api.reviewQualityAssessment(ownerId, assessment.id, {
        farmer_review_status: nextStatus,
        farmer_final_grade: nextGrade,
        farmer_notes: assessment.farmer_notes,
      });
      setStorageNotice(
        `Verified "${res.data.crop_name}" as ${nextGrade}. ${res.storage_notice}`
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review status');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setStorageNotice(null);
    try {
      const res = await api.deleteQualityAssessment(ownerId, id);
      setStorageNotice(`Deleted quality assessment record. ${res.storage_notice}`);
      if (editingId === id) {
        cancelEditAssessment();
      }
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete quality assessment');
    }
  }

  const verifiedCount = qualityAssessments.filter(
    (q) => q.farmer_review_status === 'farmer_verified' || q.farmer_review_status === 'farmer_adjusted'
  ).length;
  const pendingCount = qualityAssessments.filter(
    (q) => q.farmer_review_status === 'pending_review'
  ).length;

  return (
    <div className="space-y-8">
      {/* Screen 4 Top Washi Tape Accent Stripe */}
      <div className="w-full h-3 bg-tertiary-fixed border-y-2 border-primary flex items-center justify-around overflow-hidden select-none">
        <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-on-tertiary-fixed uppercase">
          /// HARVEST LEDGER QUALITY LOG · SPECIMEN INSPECTION BENCH ///
        </span>
        <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-on-tertiary-fixed uppercase hidden md:inline">
          /// SURFACE TRAITS ONLY · NO LABORATORY OR PROBABILITY CLAIMS ///
        </span>
      </div>

      {/* Screen 4 Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b-[2.5px] border-primary pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2">
            <span className="washi-tape bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md font-bold px-2.5 py-0.5 border-[1.5px] border-primary uppercase tracking-wider inline-block">
              SPECIMEN BENCH · SEC 05
            </span>
            <span className="font-mono text-xs text-on-surface-variant font-bold">
              // SURFACE INSPECTION &amp; FARMER VERIFICATION
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight uppercase">
            Crop Quality Assessment
          </h1>
          <p className="text-body-md text-on-surface-variant max-w-2xl font-medium">
            Inspect visible characteristics such as exterior ripeness coloration and surface
            defects. AI model outputs are strictly experimental, describe visible traits only, and
            never claim laboratory-grade metrics or numerical probabilities.
          </p>
        </div>

        {/* Summary KPI Strip */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface-container-lowest border-2 border-primary px-4 py-2 shadow-[3px_3px_0px_#012d1d]">
            <div className="font-mono text-[10px] font-bold text-on-surface-variant uppercase">
              FARMER-VERIFIED LOTS
            </div>
            <div className="font-mono text-lg font-bold text-secondary tabular-nums">
              {verifiedCount} / {qualityAssessments.length}
            </div>
          </div>
          <div className="bg-surface-container-lowest border-2 border-primary px-4 py-2 shadow-[3px_3px_0px_#012d1d]">
            <div className="font-mono text-[10px] font-bold text-on-surface-variant uppercase">
              PENDING PHYSICAL REVIEW
            </div>
            <div className="font-mono text-lg font-bold text-tertiary tabular-nums">
              {pendingCount}
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Experimental Transparency Notice */}
      <div className="bg-tertiary-fixed/70 border-2 border-primary p-4 brutal-shadow-sm flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-primary space-y-1">
          <p className="font-headline-sm font-bold uppercase tracking-wide">
            Experimental Visual Assessment Policy — No Laboratory or Probability Claims
          </p>
          <p className="font-medium text-on-surface">
            Server-side Gemini Vision inspects only visible surface coloration and exterior
            blemishes in the uploaded frame. It cannot measure internal rot, moisture percentage,
            Brix sugar levels, or chemical residues. All AI outputs are marked{' '}
            <span className="font-mono font-bold bg-tertiary-fixed px-1 border border-primary">
              [Experimental Unvalidated]
            </span>{' '}
            until physically verified and graded by the farmer.
          </p>
        </div>
      </div>

      {storageNotice && (
        <div
          role="status"
          className="p-4 bg-secondary-container border-2 border-primary brutal-shadow-sm text-xs font-bold text-on-secondary-container flex items-center justify-between gap-4"
        >
          <span>{storageNotice}</span>
          <button
            type="button"
            onClick={() => setStorageNotice(null)}
            className="text-xs font-mono uppercase underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Image Upload + Agronomic Inspector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 5 cols: Image Specimen Selector & Edge-AI Check */}
        <div className="lg:col-span-5 bg-surface-container-lowest border-[2.5px] border-primary p-6 shadow-[5px_5px_0px_#012d1d] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-primary pb-3">
            <h2 className="font-headline-sm text-base font-bold text-primary uppercase">
              1. Crop Image Specimen
            </h2>
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-surface-container-high border border-primary uppercase">
              OPTICAL BENCH
            </span>
          </div>

          <div>
            <label
              htmlFor="crop-image-upload"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1.5"
            >
              Upload Crop Photo (JPEG, PNG, WEBP)
            </label>
            <input
              id="crop-image-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileUpload}
              className="w-full text-xs text-on-surface file:mr-3 file:py-1.5 file:px-3 file:border-2 file:border-primary file:text-xs file:font-bold file:bg-tertiary-fixed file:text-on-tertiary-fixed hover:file:bg-tertiary-fixed-dim cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block font-mono text-[11px] font-bold text-on-surface-variant uppercase">
              Or load a deterministic field specimen for instant testing:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLoadSpecimen('tomato')}
                className="px-3 py-1.5 font-label-md text-xs font-bold text-primary bg-surface-container-low hover:bg-tertiary-fixed border-2 border-primary transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Load Roma Tomato Specimen
              </button>
              <button
                type="button"
                onClick={() => handleLoadSpecimen('soybean')}
                className="px-3 py-1.5 font-label-md text-xs font-bold text-primary bg-surface-container-low hover:bg-tertiary-fixed border-2 border-primary transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Load Soybean Tray Specimen
              </button>
            </div>
          </div>

          {/* Specimen Optical Frame */}
          <div className="border-2 border-primary bg-surface-container-low overflow-hidden min-h-[200px] flex items-center justify-center relative">
            {imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt={imageLabel || 'Uploaded crop specimen'}
                referrerPolicy="no-referrer"
                className="w-full h-52 object-contain"
              />
            ) : (
              <div className="p-6 text-center text-xs text-on-surface-variant space-y-1 font-mono">
                <Upload className="w-6 h-6 mx-auto text-primary" />
                <p className="font-bold text-primary uppercase">No crop image selected yet</p>
                <p className="text-[11px]">Upload a photo or load a sample specimen above.</p>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="qa-context-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Optional Farmer Context for Visual Check
            </label>
            <input
              id="qa-context-input"
              type="text"
              value={farmerContext}
              onChange={(e) => setFarmerContext(e.target.value)}
              placeholder="e.g., Picked after 2 days of light rain"
              className="w-full px-3 py-2 text-sm bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <button
            type="button"
            onClick={handleRunExperimentalAnalysis}
            disabled={analyzing || !imageDataUrl}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 font-label-md text-xs font-bold uppercase tracking-wider text-on-primary bg-primary border-2 border-primary brutal-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-transform disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {analyzing
              ? 'Running Server-Side Experimental Vision...'
              : 'Run Experimental Gemini Visual Check'}
          </button>

          {!geminiConfigured && (
            <p className="font-mono text-[11px] text-on-surface-variant">
              Note: Server-side GEMINI_API_KEY is not detected in environment; manual observation
              entry remains fully functional.
            </p>
          )}
        </div>

        {/* Right 7 cols: Agronomic Inspector & Farmer Verification Form */}
        <form
          onSubmit={handleSaveAssessment}
          className="lg:col-span-7 bg-surface-container-lowest border-[2.5px] border-primary p-6 shadow-[5px_5px_0px_#012d1d] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-primary pb-3">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <h2 className="font-headline-sm text-base font-bold text-primary uppercase">
                {editingId
                  ? '2. Edit Quality Assessment & Farmer Review'
                  : '2. Visible Characteristics & Farmer Review'}
              </h2>
            </div>
            {isAiGenerated && (
              <span className="px-2 py-0.5 bg-tertiary-fixed border border-primary font-mono text-xs font-bold text-on-tertiary-fixed">
                [Experimental AI Pre-fill — Verify Below]
              </span>
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

          {aiNotice && (
            <div className="p-3 bg-tertiary-fixed/60 border-2 border-primary text-xs font-medium text-primary">
              {aiNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="qa-crop-name-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Crop Name *
              </label>
              <input
                id="qa-crop-name-input"
                type="text"
                required
                value={cropName}
                onChange={(e) => setCropName(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="qa-cycle-select"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Linked Crop Cycle
              </label>
              <select
                id="qa-cycle-select"
                value={cropCycleId}
                onChange={(e) => handleCycleChange(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              >
                <option value="">Unlinked / General Inspection</option>
                {cropCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.crop_name} ({c.sowing_date})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="qa-harvest-select"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Linked Harvest Batch
              </label>
              <select
                id="qa-harvest-select"
                value={harvestId}
                onChange={(e) => setHarvestId(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              >
                <option value="">None / Pre-harvest Check</option>
                {filteredHarvests.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.harvest_date} ({h.measured_weight} {h.weight_unit}
                    {h.batch_code ? ` · ${h.batch_code}` : ''})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="qa-ripeness-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Visible Ripeness &amp; Maturity *
              </label>
              <input
                id="qa-ripeness-input"
                type="text"
                required
                value={visibleRipeness}
                onChange={(e) => setVisibleRipeness(e.target.value)}
                placeholder="e.g., Breaker to red ripe stage; 2 fruits have green shoulders"
                className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="qa-defects-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Visible Exterior Defects *
              </label>
              <input
                id="qa-defects-input"
                type="text"
                required
                value={visibleDefects}
                onChange={(e) => setVisibleDefects(e.target.value)}
                placeholder="e.g., 1 fruit has concentric stem crack; no visible borer holes"
                className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="qa-color-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Color Uniformity
              </label>
              <input
                id="qa-color-input"
                type="text"
                value={colorUniformity}
                onChange={(e) => setColorUniformity(e.target.value)}
                placeholder="e.g., Uniform red coloration across 80% of crate"
                className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>

            <div>
              <label
                htmlFor="qa-surface-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Surface Condition
              </label>
              <input
                id="qa-surface-input"
                type="text"
                value={surfaceCondition}
                onChange={(e) => setSurfaceCondition(e.target.value)}
                placeholder="e.g., Clean dry skin, intact calyx"
                className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t-2 border-primary">
            <div>
              <label
                htmlFor="qa-review-status-select"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Farmer Verification Status *
              </label>
              <select
                id="qa-review-status-select"
                value={reviewStatus}
                onChange={(e) =>
                  setReviewStatus(e.target.value as QualityAssessment['farmer_review_status'])
                }
                className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              >
                {FARMER_REVIEW_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {formatStageLabel(st)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="qa-grade-select"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Farmer-Assigned Grade
              </label>
              <select
                id="qa-grade-select"
                value={finalGrade || ''}
                onChange={(e) =>
                  setFinalGrade(
                    (e.target.value || null) as QualityAssessment['farmer_final_grade']
                  )
                }
                className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              >
                <option value="">Unassigned / Pending Sorting</option>
                {FARMER_FINAL_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="qa-date-input"
                className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
              >
                Inspection Date *
              </label>
              <input
                id="qa-date-input"
                type="date"
                required
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="qa-farmer-notes-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Farmer Physical Inspection Notes
            </label>
            <input
              id="qa-farmer-notes-input"
              type="text"
              value={farmerNotes}
              onChange={(e) => setFarmerNotes(e.target.value)}
              placeholder="e.g., Sorted out 15 kg cracked tomatoes; remaining crates verified Grade A"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-xs font-bold uppercase tracking-wider text-on-primary bg-primary border-2 border-primary brutal-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-transform disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting
                ? 'Saving Record...'
                : editingId
                  ? 'Save Assessment Changes'
                  : 'Save Quality Assessment Record'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEditAssessment}
                className="px-4 py-2.5 font-label-md text-xs font-bold uppercase text-primary bg-surface-container-low border-2 border-primary hover:bg-tertiary-fixed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Recorded Assessments List (Screen 4 Specimen Inspection Cards) */}
      <div className="space-y-4">
        <h2 className="font-headline-md text-xl font-bold text-primary uppercase">
          Recorded Quality Assessments ({qualityAssessments.length})
        </h2>

        <div className="grid grid-cols-1 gap-5">
          {qualityAssessments.map((qa) => (
            <div
              key={qa.id}
              className="bg-surface-container-lowest border-[2.5px] border-primary p-5 shadow-[5px_5px_0px_#012d1d] space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold text-on-surface-variant">
                    <span className="tabular-nums text-primary">{qa.assessment_date}</span>
                    <span aria-hidden="true">·</span>
                    <span>{qa.image_label || 'Field Sample'}</span>
                    {qa.is_ai_generated && (
                      <span className="px-2 py-0.5 bg-tertiary-fixed border border-primary text-[11px] font-bold text-on-tertiary-fixed">
                        [Experimental AI Output — Unvalidated]
                      </span>
                    )}
                    {qa.is_demo && (
                      <span className="px-2 py-0.5 bg-surface-container-high border border-primary text-[11px] font-bold text-primary">
                        [Demo Data]
                      </span>
                    )}
                  </div>
                  <h3 className="font-headline-sm text-lg font-bold text-primary uppercase mt-1">
                    {qa.crop_name}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-2.5 py-1 bg-secondary-container border-2 border-primary font-mono text-xs font-bold text-on-secondary-container uppercase">
                    Status: {formatStageLabel(qa.farmer_review_status)}
                  </span>
                  <span className="px-2.5 py-1 bg-surface-container-low border-2 border-primary font-mono text-xs font-bold text-primary">
                    Farmer Grade: {qa.farmer_final_grade || 'Pending Farmer Assignment'}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditAssessment(qa)}
                    aria-label={`Edit quality assessment for ${qa.crop_name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-container-low border border-primary font-label-md text-xs font-bold text-primary hover:bg-tertiary-fixed cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(qa.id)}
                    aria-label={`Delete quality assessment for ${qa.crop_name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-error-container border border-primary font-label-md text-xs font-bold text-on-error-container hover:opacity-90 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-surface-container-low border border-primary/40 p-3 space-y-1.5">
                  <p>
                    <span className="font-mono font-bold text-primary uppercase">
                      Visible Ripeness:
                    </span>{' '}
                    <span className="text-on-surface font-medium">{qa.visible_ripeness}</span>
                  </p>
                  <p>
                    <span className="font-mono font-bold text-primary uppercase">
                      Visible Defects:
                    </span>{' '}
                    <span className="text-on-surface font-medium">{qa.visible_defects}</span>
                  </p>
                </div>
                <div className="bg-surface-container-low border border-primary/40 p-3 space-y-1.5">
                  <p>
                    <span className="font-mono font-bold text-primary uppercase">
                      Color Uniformity:
                    </span>{' '}
                    <span className="text-on-surface font-medium">
                      {qa.color_uniformity || 'Not recorded'}
                    </span>
                  </p>
                  <p>
                    <span className="font-mono font-bold text-primary uppercase">
                      Surface Condition:
                    </span>{' '}
                    <span className="text-on-surface font-medium">
                      {qa.surface_condition || 'Not recorded'}
                    </span>
                  </p>
                </div>
              </div>

              {qa.experimental_ai_summary && (
                <div className="p-3 bg-tertiary-fixed/40 border-2 border-primary text-xs font-medium text-primary">
                  <span className="font-mono font-bold uppercase mr-1.5">
                    [Experimental AI Visual Note]:
                  </span>
                  {qa.experimental_ai_summary}
                </div>
              )}

              {qa.farmer_notes && (
                <p className="text-xs text-primary font-medium">
                  <span className="font-mono font-bold uppercase">Farmer Notes:</span>{' '}
                  {qa.farmer_notes}
                </p>
              )}

              {qa.farmer_review_status === 'pending_review' && (
                <div className="pt-3 flex flex-wrap items-center gap-2 border-t-2 border-primary">
                  <span className="font-mono text-xs font-bold text-primary uppercase mr-1">
                    Farmer Action — Confirm physical grade:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickVerify(qa, 'farmer_verified', 'Grade A (Market Prime)')
                    }
                    className="px-3 py-1.5 font-label-md text-xs font-bold uppercase text-on-primary bg-primary border-2 border-primary brutal-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-transform whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Verify as Grade A
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickVerify(qa, 'farmer_verified', 'Grade B (Standard Commercial)')
                    }
                    className="px-3 py-1.5 font-label-md text-xs font-bold uppercase text-primary bg-secondary-container border-2 border-primary hover:bg-tertiary-fixed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Verify as Grade B
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickVerify(qa, 'farmer_adjusted', 'Grade C (Processing / Local)')
                    }
                    className="px-3 py-1.5 font-label-md text-xs font-bold uppercase text-primary bg-surface-container-low border-2 border-primary hover:bg-tertiary-fixed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Mark Grade C
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
