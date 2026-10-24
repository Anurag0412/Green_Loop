import { z } from 'zod';

// --- Enums & Constants ---
export const CROP_CYCLE_STATUSES = [
  'planned',
  'active',
  'harvested',
  'completed',
  'cancelled',
] as const;

export const CROP_STAGES = [
  'land_prep',
  'sowing',
  'germination',
  'vegetative',
  'flowering',
  'fruiting',
  'maturation',
  'harvest_ready',
  'post_harvest',
] as const;

export const ACTIVITY_TYPES = [
  'irrigation',
  'fertilizer',
  'pest_management',
  'weeding',
  'observation',
  'soil_amendment',
  'pruning',
  'other',
] as const;

export const WEIGHT_UNITS = ['kg', 'quintal', 'ton', 'lb'] as const;

export const FARMER_REVIEW_STATUSES = [
  'pending_review',
  'farmer_verified',
  'farmer_adjusted',
  'rejected',
] as const;

export const FARMER_FINAL_GRADES = [
  'Grade A (Market Prime)',
  'Grade B (Standard Commercial)',
  'Grade C (Processing / Local)',
  'Rejected / Spoiled',
  'Unassigned',
] as const;

export const MARKET_ENTRY_TYPES = ['sourced_price', 'buyer_contact'] as const;

// --- Helper for optional nullable numbers that distinguishes null (missing) from 0 ---
const optionalNonNegativeNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .optional()
  .transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const parsed = typeof val === 'number' ? val : Number(val);
    return Number.isNaN(parsed) ? NaN : parsed;
  })
  .refine((val) => val === null || (!Number.isNaN(val) && val >= 0), {
    message: 'Value must be a non-negative number or left blank if unknown',
  });

const optionalPositiveNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .optional()
  .transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const parsed = typeof val === 'number' ? val : Number(val);
    return Number.isNaN(parsed) ? NaN : parsed;
  })
  .refine((val) => val === null || (!Number.isNaN(val) && val > 0), {
    message: 'Value must be greater than 0 or left blank if unknown',
  });

const requiredPositiveNumber = z
  .union([z.number(), z.string()])
  .transform((val) => (typeof val === 'number' ? val : Number(val)))
  .refine((val) => !Number.isNaN(val) && val > 0, {
    message: 'Value must be a positive number greater than 0',
  });

const requiredNonNegativeNumber = z
  .union([z.number(), z.string()])
  .transform((val) => (typeof val === 'number' ? val : Number(val)))
  .refine((val) => !Number.isNaN(val) && val >= 0, {
    message: 'Value must be zero or a positive number',
  });

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// --- 1. Farm Schema ---
export const FarmInputSchema = z.object({
  name: z.string().trim().min(1, 'Farm name is required').max(120),
  location: z.string().trim().min(1, 'Location is required').max(200),
  total_area_acres: optionalPositiveNumber,
  soil_summary: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
  water_source: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

export type FarmInput = z.infer<typeof FarmInputSchema>;

export interface Farm extends FarmInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// --- 2. Plot Schema ---
export const PlotInputSchema = z.object({
  farm_id: z.string().trim().min(1, 'Farm selection is required'),
  name: z.string().trim().min(1, 'Plot name is required').max(120),
  area_acres: requiredPositiveNumber,
  soil_type: z.string().trim().max(150).nullable().optional().transform((v) => v || null),
  soil_ph: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return null;
      const n = typeof val === 'number' ? val : Number(val);
      return Number.isNaN(n) ? NaN : n;
    })
    .refine((val) => val === null || (!Number.isNaN(val) && val >= 0 && val <= 14), {
      message: 'Soil pH must be between 0 and 14',
    }),
  irrigation_type: z.string().trim().max(150).nullable().optional().transform((v) => v || null),
  location_coordinates: z.string().trim().max(150).nullable().optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

export type PlotInput = z.infer<typeof PlotInputSchema>;

export interface Plot extends PlotInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// --- 3. Crop Cycle Schema ---
export const CropCycleInputSchema = z
  .object({
    farm_id: z.string().trim().min(1, 'Farm selection is required'),
    plot_id: z.string().trim().min(1, 'Plot selection is required'),
    crop_name: z.string().trim().min(1, 'Crop name is required').max(120),
    seed_variety: z.string().trim().max(150).nullable().optional().transform((v) => v || null),
    seed_source: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
    sowing_date: dateStringSchema,
    expected_harvest_date: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
        message: 'Expected harvest date must be YYYY-MM-DD',
      }),
    soil_details: z.string().trim().max(500).nullable().optional().transform((v) => v || null),
    location_detail: z.string().trim().max(250).nullable().optional().transform((v) => v || null),
    status: z.enum(CROP_CYCLE_STATUSES).default('active'),
    current_stage: z.enum(CROP_STAGES).default('sowing'),
    seed_cost: optionalNonNegativeNumber,
    notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  })
  .refine(
    (data) => !data.expected_harvest_date || data.expected_harvest_date >= data.sowing_date,
    {
      message: 'Expected harvest date cannot be earlier than sowing date',
      path: ['expected_harvest_date'],
    }
  );

export type CropCycleInput = z.infer<typeof CropCycleInputSchema>;

export interface CropCycle extends CropCycleInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// --- 4. Cultivation Event Schema ---
export const CultivationEventInputSchema = z.object({
  crop_cycle_id: z.string().trim().min(1, 'Crop cycle is required'),
  event_date: dateStringSchema,
  activity_type: z.enum(ACTIVITY_TYPES),
  crop_stage: z.enum(CROP_STAGES),
  description: z.string().trim().min(1, 'Activity description is required').max(500),
  inputs_applied: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
  cost_amount: optionalNonNegativeNumber,
  observations: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

export type CultivationEventInput = z.infer<typeof CultivationEventInputSchema>;

export interface CultivationEvent extends CultivationEventInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// --- 5. Harvest Schema ---
export const HarvestInputSchema = z.object({
  crop_cycle_id: z.string().trim().min(1, 'Crop cycle is required'),
  harvest_date: dateStringSchema,
  measured_weight: requiredNonNegativeNumber,
  weight_unit: z.enum(WEIGHT_UNITS).default('kg'),
  harvest_cost: optionalNonNegativeNumber,
  storage_location: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  batch_code: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

export type HarvestInput = z.infer<typeof HarvestInputSchema>;

export interface Harvest extends HarvestInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// --- 6. Quality Assessment Schema ---
export const QualityAssessmentInputSchema = z.object({
  crop_cycle_id: z.string().trim().nullable().optional().transform((v) => v || null),
  harvest_id: z.string().trim().nullable().optional().transform((v) => v || null),
  crop_name: z.string().trim().min(1, 'Crop name is required').max(120),
  assessment_date: dateStringSchema,
  image_label: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  visible_ripeness: z.string().trim().min(1, 'Visible ripeness description is required').max(300),
  visible_defects: z.string().trim().min(1, 'Visible defects observation is required').max(500),
  color_uniformity: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
  surface_condition: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
  experimental_ai_summary: z.string().trim().max(1500).nullable().optional().transform((v) => v || null),
  is_ai_generated: z.boolean().default(true),
  farmer_review_status: z.enum(FARMER_REVIEW_STATUSES).default('pending_review'),
  farmer_final_grade: z
    .enum(FARMER_FINAL_GRADES)
    .nullable()
    .optional()
    .transform((v) => v || null),
  farmer_notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

export type QualityAssessmentInput = z.infer<typeof QualityAssessmentInputSchema>;

export interface QualityAssessment extends QualityAssessmentInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

// --- 7. Market Entry Schema ---
export const MarketEntryInputSchema = z.object({
  entry_type: z.enum(MARKET_ENTRY_TYPES),
  crop_name: z.string().trim().min(1, 'Crop name is required').max(120),
  market_name: z.string().trim().min(1, 'Market or hub name is required').max(150),
  region: z.string().trim().min(1, 'Region is required').max(150),
  recorded_date: dateStringSchema,
  price_per_unit: optionalNonNegativeNumber,
  price_unit: z.string().trim().max(50).nullable().optional().transform((v) => v || 'INR/quintal'),
  source_citation: z.string().trim().min(1, 'Explicit data source citation is required').max(300),
  buyer_organization: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  buyer_contact_info: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  quality_requirements: z.string().trim().max(400).nullable().optional().transform((v) => v || null),
  notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

export type MarketEntryInput = z.infer<typeof MarketEntryInputSchema>;

export interface MarketEntry extends MarketEntryInput {
  id: string;
  owner_id: string;
  is_demo: boolean;
  created_at: string;
}

// --- Gemini Image Analysis Request Schema ---
export const AnalyzeCropImageRequestSchema = z.object({
  crop_name: z.string().trim().min(1, 'Crop name is required').max(120),
  image_base64: z
    .string()
    .min(20, 'Valid base64 image data is required')
    .max(8_000_000, 'Image payload exceeds maximum size limit'),
  mime_type: z
    .string()
    .regex(/^image\/(jpeg|png|webp|gif)$/, 'Image must be JPEG, PNG, WEBP, or GIF'),
  farmer_context: z.string().trim().max(500).optional(),
});

// --- Owner Scope Validation ---
export function sanitizeOwnerId(rawHeader: string | undefined | null): string {
  if (!rawHeader || typeof rawHeader !== 'string') {
    return 'owner-default-workspace';
  }
  const cleaned = rawHeader.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned.length >= 3 ? cleaned : 'owner-default-workspace';
}

// --- Pure Domain Logic: Report Aggregation (Distinguishing Missing vs Zero) ---
export interface CycleReportRow {
  crop_cycle_id: string;
  crop_name: string;
  seed_variety: string | null;
  farm_name: string;
  plot_name: string;
  status: string;
  current_stage: string;
  sowing_date: string;
  is_demo: boolean;
  activity_count: number;
  seed_cost: number | null; // null = Not recorded, 0 = 0
  cultivation_cost_known_total: number | null; // null if no events have cost recorded
  events_with_missing_cost: number;
  harvest_cost_known_total: number | null;
  total_known_cost: number | null; // null if all cost fields are null
  has_incomplete_cost_data: boolean;
  harvest_batch_count: number;
  total_measured_weight_kg: number | null; // null if no harvests recorded; 0 if harvested 0 kg
  verified_quality_count: number;
  pending_quality_count: number;
  latest_verified_grade: string | null;
}

export function normalizeWeightToKg(weight: number, unit: string): number {
  switch (unit) {
    case 'quintal':
      return weight * 100;
    case 'ton':
      return weight * 1000;
    case 'lb':
      return Number((weight * 0.453592).toFixed(2));
    case 'kg':
    default:
      return weight;
  }
}

export function buildFarmCycleReports(params: {
  farms: Farm[];
  plots: Plot[];
  cropCycles: CropCycle[];
  cultivationEvents: CultivationEvent[];
  harvests: Harvest[];
  qualityAssessments: QualityAssessment[];
}): CycleReportRow[] {
  const farmMap = new Map(params.farms.map((f) => [f.id, f]));
  const plotMap = new Map(params.plots.map((p) => [p.id, p]));

  return params.cropCycles.map((cycle) => {
    const farm = farmMap.get(cycle.farm_id);
    const plot = plotMap.get(cycle.plot_id);
    const events = params.cultivationEvents.filter((e) => e.crop_cycle_id === cycle.id);
    const cycleHarvests = params.harvests.filter((h) => h.crop_cycle_id === cycle.id);
    const assessments = params.qualityAssessments.filter((q) => q.crop_cycle_id === cycle.id);

    // Cultivation costs: distinguish null (missing) from 0 (zero cost)
    const eventsWithCost = events.filter((e) => e.cost_amount !== null && e.cost_amount !== undefined);
    const eventsWithMissingCost = events.length - eventsWithCost.length;
    const cultivationCostKnownTotal =
      eventsWithCost.length > 0
        ? eventsWithCost.reduce((sum, e) => sum + (e.cost_amount ?? 0), 0)
        : null;

    // Harvest costs
    const harvestsWithCost = cycleHarvests.filter(
      (h) => h.harvest_cost !== null && h.harvest_cost !== undefined
    );
    const harvestCostKnownTotal =
      harvestsWithCost.length > 0
        ? harvestsWithCost.reduce((sum, h) => sum + (h.harvest_cost ?? 0), 0)
        : null;

    const anyCostRecorded =
      cycle.seed_cost !== null ||
      cultivationCostKnownTotal !== null ||
      harvestCostKnownTotal !== null;

    const totalKnownCost = anyCostRecorded
      ? (cycle.seed_cost ?? 0) +
        (cultivationCostKnownTotal ?? 0) +
        (harvestCostKnownTotal ?? 0)
      : null;

    const hasIncompleteCostData =
      cycle.seed_cost === null ||
      eventsWithMissingCost > 0 ||
      cycleHarvests.some((h) => h.harvest_cost === null);

    // Measured harvest weight: null when no harvests exist, numeric (including 0) when recorded
    const totalMeasuredWeightKg =
      cycleHarvests.length > 0
        ? Number(
            cycleHarvests
              .reduce((sum, h) => sum + normalizeWeightToKg(h.measured_weight, h.weight_unit), 0)
              .toFixed(2)
          )
        : null;

    const verifiedAssessments = assessments.filter(
      (q) =>
        q.farmer_review_status === 'farmer_verified' ||
        q.farmer_review_status === 'farmer_adjusted'
    );
    const pendingAssessments = assessments.filter(
      (q) => q.farmer_review_status === 'pending_review'
    );

    const latestVerifiedGrade =
      verifiedAssessments.length > 0
        ? verifiedAssessments[0].farmer_final_grade ?? 'Unassigned'
        : null;

    return {
      crop_cycle_id: cycle.id,
      crop_name: cycle.crop_name,
      seed_variety: cycle.seed_variety ?? null,
      farm_name: farm?.name ?? 'Unlinked Farm',
      plot_name: plot?.name ?? 'Unlinked Plot',
      status: cycle.status,
      current_stage: cycle.current_stage,
      sowing_date: cycle.sowing_date,
      is_demo: cycle.is_demo,
      activity_count: events.length,
      seed_cost: cycle.seed_cost ?? null,
      cultivation_cost_known_total: cultivationCostKnownTotal,
      events_with_missing_cost: eventsWithMissingCost,
      harvest_cost_known_total: harvestCostKnownTotal,
      total_known_cost: totalKnownCost,
      has_incomplete_cost_data: hasIncompleteCostData,
      harvest_batch_count: cycleHarvests.length,
      total_measured_weight_kg: totalMeasuredWeightKg,
      verified_quality_count: verifiedAssessments.length,
      pending_quality_count: pendingAssessments.length,
      latest_verified_grade: latestVerifiedGrade,
    };
  });
}

// --- Pure Domain Logic: Actionable Alerts ---
export interface ActionableAlert {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  detail: string;
  module_target:
    | 'farms'
    | 'planning'
    | 'cultivation'
    | 'harvests'
    | 'quality'
    | 'market'
    | 'reports';
}

export function computeActionableAlerts(params: {
  cropCycles: CropCycle[];
  cultivationEvents: CultivationEvent[];
  harvests: Harvest[];
  qualityAssessments: QualityAssessment[];
  referenceDateStr?: string;
}): ActionableAlert[] {
  const alerts: ActionableAlert[] = [];
  const today = params.referenceDateStr
    ? new Date(`${params.referenceDateStr}T00:00:00Z`)
    : new Date();

  for (const cycle of params.cropCycles) {
    if (cycle.status === 'active') {
      const cycleEvents = params.cultivationEvents.filter((e) => e.crop_cycle_id === cycle.id);
      if (cycleEvents.length === 0) {
        alerts.push({
          id: `no-events-${cycle.id}`,
          severity: 'medium',
          title: `No cultivation events logged for ${cycle.crop_name}`,
          detail: `Active cycle sown on ${cycle.sowing_date} has zero recorded field activities.`,
          module_target: 'cultivation',
        });
      }

      if (cycle.expected_harvest_date) {
        const expDate = new Date(`${cycle.expected_harvest_date}T00:00:00Z`);
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const hasHarvest = params.harvests.some((h) => h.crop_cycle_id === cycle.id);
        if (diffDays <= 7 && !hasHarvest) {
          alerts.push({
            id: `harvest-due-${cycle.id}`,
            severity: diffDays < 0 ? 'high' : 'medium',
            title:
              diffDays < 0
                ? `Harvest target window passed for ${cycle.crop_name}`
                : `Harvest window approaching for ${cycle.crop_name}`,
            detail: `Expected harvest date: ${cycle.expected_harvest_date}. Record measured harvest weight once harvested.`,
            module_target: 'harvests',
          });
        }
      }
    }
  }

  const pendingAssessments = params.qualityAssessments.filter(
    (q) => q.farmer_review_status === 'pending_review'
  );
  if (pendingAssessments.length > 0) {
    alerts.push({
      id: 'pending-quality-reviews',
      severity: 'medium',
      title: `${pendingAssessments.length} experimental quality assessment(s) awaiting farmer review`,
      detail:
        'Unvalidated visual assessments require farmer inspection and grade confirmation before inclusion in verified farm reports.',
      module_target: 'quality',
    });
  }

  return alerts;
}
