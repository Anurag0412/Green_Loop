import type {
  Farm,
  FarmInput,
  Plot,
  PlotInput,
  CropCycle,
  CropCycleInput,
  CultivationEvent,
  CultivationEventInput,
  Harvest,
  HarvestInput,
  QualityAssessment,
  QualityAssessmentInput,
  MarketEntry,
  MarketEntryInput,
  CycleReportRow,
  ActionableAlert,
} from '../shared/validation';
import type { DatabaseStatusReport } from '../server/db';

import {
  getActiveAccessToken,
  isReadOnlyDemoModeActive,
  notifySessionExpired,
  type ClientAuthUser,
} from './supabase';

export interface PersistenceMeta {
  persisted_to_postgres: boolean;
  storage_mode: 'supabase_postgres' | 'in_memory_demo_fallback';
  storage_notice: string;
}

export interface BootstrapPayload {
  owner_id: string;
  is_demo_mode?: boolean;
  authenticated_user?: ClientAuthUser | null;
  gemini_configured: boolean;
  database: DatabaseStatusReport;
  farms: Farm[];
  plots: Plot[];
  crop_cycles: CropCycle[];
  cultivation_events: CultivationEvent[];
  harvests: Harvest[];
  quality_assessments: QualityAssessment[];
  market_entries: MarketEntry[];
  cycle_reports: CycleReportRow[];
  alerts: ActionableAlert[];
}

export interface CropCycleDetailPayload {
  cycle: CropCycle;
  farm: Farm | null;
  plot: Plot | null;
  cultivation_events: CultivationEvent[];
  harvests: Harvest[];
  quality_assessments: QualityAssessment[];
  report: CycleReportRow;
}

export interface WeatherCondition {
  temperature_c: number;
  relative_humidity_pct: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
  weather_code: number;
  weather_description: string;
}

export interface DailyForecastItem {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_probability_pct: number;
  precipitation_sum_mm: number;
  weather_code: number;
  weather_description: string;
}

export interface AgronomicRiskAlert {
  risk_type: 'heavy_rainfall' | 'heat_stress' | 'frost_low_temp' | 'high_winds' | 'spray_window';
  severity: 'advisory' | 'warning' | 'favorable';
  title: string;
  description: string;
  recommended_action: string;
}

export interface WeatherPayload {
  available: boolean;
  source: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  current: WeatherCondition | null;
  daily_forecast: DailyForecastItem[];
  agronomic_risks: AgronomicRiskAlert[];
  notice?: string;
  is_demo_mode?: boolean;
}

export interface CropRecommendationItem {
  crop_name: string;
  recommended_varieties: string[];
  suitability_grade: 'highly_suitable' | 'moderately_suitable' | 'conditional';
  suitability_score: number;
  suitability_summary: string;
  supporting_factors: string[];
  limiting_factors: string[];
  recommended_planting_window: string;
  estimated_duration_days: number;
  water_and_soil_considerations: string;
  required_additional_info: string[];
  confidence_level: 'High' | 'Moderate' | 'Qualified';
  suggested_next_step: string;
  estimated_seed_rate_per_acre: string;
  standard_yield_range_kg_per_acre: string;
  suggested_cycle_draft: {
    crop_name: string;
    seed_variety: string;
    target_stage: string;
    maturity_days: number;
  };
}

export interface RecommendationsPayload {
  plot_evaluated: {
    plot_name: string;
    soil_type: string;
    soil_ph: number | null;
    irrigation_type: string;
    area_acres: number | null;
  };
  recommendations: CropRecommendationItem[];
  agronomic_source: string;
  disclaimer: string;
  evaluated_at: string;
  is_demo_mode?: boolean;
}

export class ApiClientError extends Error {
  public issues?: Array<{ path: string; message: string }>;
  public statusCode?: number;
  constructor(
    message: string,
    issues?: Array<{ path: string; message: string }>,
    statusCode?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.issues = issues;
    this.statusCode = statusCode;
  }
}

async function requestJson<T>(
  path: string,
  _ownerId: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getActiveAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else if (isReadOnlyDemoModeActive()) {
    headers.set('X-Demo-Mode', 'true');
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      notifySessionExpired(
        data.error || 'Your authentication session has expired. Please sign in again.'
      );
    }
    const errMsg =
      data.error ||
      data.detail ||
      `Request to ${path} failed with status ${res.status}`;
    throw new ApiClientError(errMsg, data.issues, res.status);
  }
  return data as T;
}

export const api = {
  getBootstrap(ownerId: string): Promise<BootstrapPayload> {
    return requestJson<BootstrapPayload>('/api/bootstrap', ownerId);
  },

  async checkDbHealth(
    _ownerId: string
  ): Promise<{ httpStatus: number; report: DatabaseStatusReport }> {
    const res = await fetch('/api/health/db');
    const report = (await res.json()) as DatabaseStatusReport;
    return { httpStatus: res.status, report };
  },

  getMigrationSql(ownerId: string): Promise<{ filename: string; sql: string }> {
    return requestJson<{ filename: string; sql: string }>('/api/migrations/sql', ownerId);
  },

  applyMigration(
    ownerId: string
  ): Promise<{ applied: boolean; status: DatabaseStatusReport }> {
    return requestJson('/api/db/apply-migration', ownerId, { method: 'POST' });
  },

  // Farms
  createFarm(ownerId: string, input: FarmInput): Promise<{ data: Farm } & PersistenceMeta> {
    return requestJson('/api/farms', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateFarm(
    ownerId: string,
    id: string,
    input: FarmInput
  ): Promise<{ data: Farm } & PersistenceMeta> {
    return requestJson(`/api/farms/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteFarm(ownerId: string, id: string): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/farms/${id}`, ownerId, { method: 'DELETE' });
  },

  // Plots
  createPlot(ownerId: string, input: PlotInput): Promise<{ data: Plot } & PersistenceMeta> {
    return requestJson('/api/plots', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updatePlot(
    ownerId: string,
    id: string,
    input: PlotInput
  ): Promise<{ data: Plot } & PersistenceMeta> {
    return requestJson(`/api/plots/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deletePlot(ownerId: string, id: string): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/plots/${id}`, ownerId, { method: 'DELETE' });
  },

  // Crop Cycles & Detail View
  getCropCycleDetail(
    ownerId: string,
    id: string
  ): Promise<{ data: CropCycleDetailPayload } & PersistenceMeta> {
    return requestJson(`/api/crop-cycles/${id}`, ownerId);
  },
  getCropCycleAdvisory(
    ownerId: string,
    id: string
  ): Promise<{
    experimental: boolean;
    source_mode: 'gemini_ai' | 'rule_based_fallback';
    disclaimer: string;
    advisory: {
      stage_summary: string;
      operational_priorities: string[];
      data_completeness_notes: string[];
    };
  }> {
    return requestJson(`/api/crop-cycles/${id}/ai-advisory`, ownerId, {
      method: 'POST',
    });
  },
  createCropCycle(
    ownerId: string,
    input: CropCycleInput
  ): Promise<{ data: CropCycle } & PersistenceMeta> {
    return requestJson('/api/crop-cycles', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateCropCycle(
    ownerId: string,
    id: string,
    input: CropCycleInput
  ): Promise<{ data: CropCycle } & PersistenceMeta> {
    return requestJson(`/api/crop-cycles/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteCropCycle(
    ownerId: string,
    id: string
  ): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/crop-cycles/${id}`, ownerId, { method: 'DELETE' });
  },

  // Cultivation Events
  createCultivationEvent(
    ownerId: string,
    input: CultivationEventInput
  ): Promise<{ data: CultivationEvent } & PersistenceMeta> {
    return requestJson('/api/cultivation-events', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateCultivationEvent(
    ownerId: string,
    id: string,
    input: CultivationEventInput
  ): Promise<{ data: CultivationEvent } & PersistenceMeta> {
    return requestJson(`/api/cultivation-events/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteCultivationEvent(
    ownerId: string,
    id: string
  ): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/cultivation-events/${id}`, ownerId, { method: 'DELETE' });
  },

  // Harvests
  createHarvest(
    ownerId: string,
    input: HarvestInput
  ): Promise<{ data: Harvest } & PersistenceMeta> {
    return requestJson('/api/harvests', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateHarvest(
    ownerId: string,
    id: string,
    input: HarvestInput
  ): Promise<{ data: Harvest } & PersistenceMeta> {
    return requestJson(`/api/harvests/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteHarvest(ownerId: string, id: string): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/harvests/${id}`, ownerId, { method: 'DELETE' });
  },

  // Quality Assessments
  analyzeCropImage(
    ownerId: string,
    payload: {
      crop_name: string;
      image_base64: string;
      mime_type: string;
      farmer_context?: string;
    }
  ): Promise<{
    experimental: boolean;
    disclaimer: string;
    analysis: {
      visible_ripeness: string;
      visible_defects: string;
      color_uniformity: string;
      surface_condition: string;
      experimental_ai_summary: string;
    };
  }> {
    return requestJson('/api/quality-assessments/analyze-image', ownerId, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createQualityAssessment(
    ownerId: string,
    input: QualityAssessmentInput
  ): Promise<{ data: QualityAssessment } & PersistenceMeta> {
    return requestJson('/api/quality-assessments', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateQualityAssessment(
    ownerId: string,
    id: string,
    input: QualityAssessmentInput
  ): Promise<{ data: QualityAssessment } & PersistenceMeta> {
    return requestJson(`/api/quality-assessments/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  reviewQualityAssessment(
    ownerId: string,
    id: string,
    review: {
      farmer_review_status: QualityAssessment['farmer_review_status'];
      farmer_final_grade: QualityAssessment['farmer_final_grade'];
      farmer_notes: string | null;
    }
  ): Promise<{ data: QualityAssessment } & PersistenceMeta> {
    return requestJson(`/api/quality-assessments/${id}/review`, ownerId, {
      method: 'PATCH',
      body: JSON.stringify(review),
    });
  },

  deleteQualityAssessment(
    ownerId: string,
    id: string
  ): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/quality-assessments/${id}`, ownerId, { method: 'DELETE' });
  },

  // Market Entries
  createMarketEntry(
    ownerId: string,
    input: MarketEntryInput
  ): Promise<{ data: MarketEntry } & PersistenceMeta> {
    return requestJson('/api/market-entries', ownerId, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateMarketEntry(
    ownerId: string,
    id: string,
    input: MarketEntryInput
  ): Promise<{ data: MarketEntry } & PersistenceMeta> {
    return requestJson(`/api/market-entries/${id}`, ownerId, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  deleteMarketEntry(
    ownerId: string,
    id: string
  ): Promise<{ deleted: boolean } & PersistenceMeta> {
    return requestJson(`/api/market-entries/${id}`, ownerId, { method: 'DELETE' });
  },

  // Agricultural Weather & Forecasts
  getWeather(
    ownerId: string,
    params?: { lat?: number; lon?: number; location?: string }
  ): Promise<WeatherPayload> {
    const q = new URLSearchParams();
    if (params?.lat !== undefined) q.set('lat', String(params.lat));
    if (params?.lon !== undefined) q.set('lon', String(params.lon));
    if (params?.location) q.set('location', params.location);
    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return requestJson(`/api/weather${queryStr}`, ownerId);
  },

  // Agricultural Crop Planning & Recommendations
  getRecommendations(
    ownerId: string,
    params?: {
      plot_id?: string;
      soil_ph?: number;
      soil_type?: string;
      irrigation?: string;
      area_acres?: number;
    }
  ): Promise<RecommendationsPayload> {
    const q = new URLSearchParams();
    if (params?.plot_id) q.set('plot_id', params.plot_id);
    if (params?.soil_ph !== undefined) q.set('soil_ph', String(params.soil_ph));
    if (params?.soil_type) q.set('soil_type', params.soil_type);
    if (params?.irrigation) q.set('irrigation', params.irrigation);
    if (params?.area_acres !== undefined) q.set('area_acres', String(params.area_acres));
    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return requestJson(`/api/recommendations${queryStr}`, ownerId);
  },

  evaluateRecommendations(
    ownerId: string,
    payload: {
      plot_id?: string;
      plot_name?: string;
      soil_type?: string;
      soil_ph?: number | null;
      irrigation_type?: string;
      area_acres?: number | null;
      current_season?: string;
      previous_crop?: string;
    }
  ): Promise<RecommendationsPayload> {
    return requestJson('/api/recommendations/evaluate', ownerId, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export function generateSampleCropSpecimenDataUrl(preset: 'tomato' | 'soybean'): {
  dataUrl: string;
  mimeType: string;
  label: string;
  cropName: string;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      dataUrl: '',
      mimeType: 'image/png',
      label: 'Sample Specimen',
      cropName: 'Roma Tomato',
    };
  }

  ctx.fillStyle = '#EFECE4';
  ctx.fillRect(0, 0, 480, 320);
  ctx.strokeStyle = '#D5CFC0';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 456, 296);

  if (preset === 'tomato') {
    const positions = [
      { x: 110, y: 125, color: '#C83E2B', shoulder: false, crack: false },
      { x: 240, y: 115, color: '#D14532', shoulder: false, crack: false },
      { x: 365, y: 130, color: '#BA3725', shoulder: true, crack: true },
      { x: 165, y: 220, color: '#C83E2B', shoulder: false, crack: false },
      { x: 305, y: 215, color: '#C4492D', shoulder: true, crack: false },
    ];

    for (const pos of positions) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.beginPath();
      ctx.ellipse(0, 0, 42, 52, 0.15, 0, Math.PI * 2);
      ctx.fillStyle = pos.color;
      ctx.fill();

      if (pos.shoulder) {
        ctx.beginPath();
        ctx.ellipse(-6, -32, 24, 15, 0.1, 0, Math.PI * 2);
        ctx.fillStyle = '#6D8C49';
        ctx.fill();
      }

      if (pos.crack) {
        ctx.strokeStyle = '#5C4033';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(8, -15, 16, 0.2, 2.1);
        ctx.stroke();
      }

      ctx.strokeStyle = '#2D5A27';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, -45);
      ctx.lineTo(12, -42);
      ctx.moveTo(0, -52);
      ctx.lineTo(0, -35);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = '#3A322B';
    ctx.font = '600 13px sans-serif';
    ctx.fillText('Specimen: Roma Tomato Crate Sample (4 ripe red, 1 growth crack)', 24, 294);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      mimeType: 'image/png',
      label: 'Roma Tomato Crate Specimen (Sample Canvas)',
      cropName: 'Roma Tomato',
    };
  } else {
    for (let i = 0; i < 28; i++) {
      const x = 55 + ((i * 53) % 370);
      const y = 55 + Math.floor(i / 7) * 55 + ((i * 17) % 20);
      const isSplit = i === 6 || i === 19;
      ctx.beginPath();
      ctx.ellipse(x, y, isSplit ? 14 : 18, 13, (i % 5) * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = isSplit ? '#A88948' : '#E0C078';
      ctx.fill();
      ctx.strokeStyle = '#9E7B3B';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#5C4938';
      ctx.fillRect(x - 2, y - 2, 4, 2);
    }

    ctx.fillStyle = '#3A322B';
    ctx.font = '600 13px sans-serif';
    ctx.fillText('Specimen: Harvested Soybean Seed Tray (Mature buff, 2 split seeds)', 24, 294);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      mimeType: 'image/png',
      label: 'Soybean Seed Tray Specimen (Sample Canvas)',
      cropName: 'Soybean',
    };
  }
}

export function formatStageLabel(stage: string): string {
  return stage
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatCurrencyOrMissing(val: number | null | undefined): string {
  if (val === null || val === undefined) {
    return 'Not recorded';
  }
  return `INR ${val.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatWeightOrMissing(
  val: number | null | undefined,
  unit = 'kg'
): string {
  if (val === null || val === undefined) {
    return 'Not recorded';
  }
  return `${val.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${unit}`;
}
