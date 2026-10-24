import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { ZodError, z } from 'zod';
import {
  FarmInputSchema,
  PlotInputSchema,
  CropCycleInputSchema,
  CultivationEventInputSchema,
  HarvestInputSchema,
  QualityAssessmentInputSchema,
  MarketEntryInputSchema,
  AnalyzeCropImageRequestSchema,
  FARMER_REVIEW_STATUSES,
  FARMER_FINAL_GRADES,
  buildFarmCycleReports,
  computeActionableAlerts,
} from './src/shared/validation';
import {
  checkDatabaseHealth,
  isDatabaseUrlConfigured,
  applySafeMigrationIfConnected,
  getMigrationSqlContent,
  listFarms,
  createFarm,
  updateFarm,
  deleteFarm,
  listPlots,
  createPlot,
  updatePlot,
  deletePlot,
  listCropCycles,
  createCropCycle,
  updateCropCycle,
  deleteCropCycle,
  listCultivationEvents,
  createCultivationEvent,
  updateCultivationEvent,
  deleteCultivationEvent,
  listHarvests,
  createHarvest,
  updateHarvest,
  deleteHarvest,
  listQualityAssessments,
  createQualityAssessment,
  updateQualityAssessment,
  updateQualityAssessmentReview,
  deleteQualityAssessment,
  listMarketEntries,
  createMarketEntry,
  updateMarketEntry,
  deleteMarketEntry,
  ParentOwnershipError,
} from './src/server/db';
import {
  AuthError,
  type AuthenticatedUser,
  getAuthConfigStatus,
  registerUser,
  signInUser,
  signOutSession,
  verifyAccessToken,
  resolveSupabaseUrl,
  resolveSupabaseAnonKey,
} from './src/server/auth';
import { fetchAgriculturalWeather } from './src/server/weather';
import { computeCropRecommendations } from './src/server/recommendations';

const PORT = Number(process.env.PORT) || 3000;

declare global {
  namespace Express {
    interface Request {
      ownerId: string;
      authUser?: AuthenticatedUser;
      isDemoMode?: boolean;
    }
  }
}

const idParamSchema = z.object({
  id: z.string().trim().min(1, 'Resource ID is required').max(100),
});

const reviewPatchSchema = z.object({
  farmer_review_status: z.enum(FARMER_REVIEW_STATUSES),
  farmer_final_grade: z
    .enum(FARMER_FINAL_GRADES)
    .nullable()
    .optional()
    .transform((v) => v || null),
  farmer_notes: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
});

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 5);
}

function getGeminiClient(): GoogleGenAI | null {
  if (!isGeminiConfigured()) return null;
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getPersistenceMeta() {
  const configured = isDatabaseUrlConfigured();
  return {
    persisted_to_postgres: configured,
    storage_mode: configured ? 'supabase_postgres' : 'in_memory_demo_fallback',
    storage_notice: configured
      ? 'Saved to Supabase PostgreSQL database.'
      : 'Saved to temporary in-memory session store (Demo Mode — DATABASE_URL is not configured).',
  };
}

async function startServer() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigin = process.env.CORS_ORIGIN || process.env.APP_URL || true;
  app.use(
    cors({
      origin: allowedOrigin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Demo-Mode', 'X-Owner-Id'],
    })
  );

  app.use(express.json({ limit: '10mb' }));

  // Apply safe migrations (001_initial_schema.sql + 002_rls_and_auth.sql) on startup if connected
  if (isDatabaseUrlConfigured()) {
    await applySafeMigrationIfConnected().catch((err) => {
      console.warn('Startup migration check warning:', err instanceof Error ? err.message : err);
    });
  }

  function extractBearerToken(req: Request): string | null {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  const signUpSchema = z.object({
    email: z.string().trim().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters'),
    full_name: z.string().trim().max(120).optional().nullable(),
  });

  const signInSchema = z.object({
    email: z.string().trim().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required').max(128),
  });

  // --- Public Health & Honest Database Connectivity Endpoints ---
  app.get('/api/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [dbStatus, authConfig] = await Promise.all([
        checkDatabaseHealth(),
        getAuthConfigStatus(),
      ]);
      res.json({
        status: 'ok',
        service: 'green-loop-api',
        timestamp: new Date().toISOString(),
        auth: {
          mode: authConfig.active_auth_mode,
          rls_enabled: authConfig.rls_enabled,
          supabase_pg_auth_available: authConfig.supabase_pg_auth_available,
          supabase_anon_key_configured: authConfig.supabase_anon_key_configured,
          client_owner_header_trusted: false,
        },
        gemini_configured: isGeminiConfigured(),
        database: dbStatus,
      });
    } catch (err) {
      next(err);
    }
  });

  const handleDbHealth = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dbStatus = await checkDatabaseHealth();
      const httpCode = dbStatus.connected && dbStatus.schema_verified ? 200 : 503;
      res.status(httpCode).json(dbStatus);
    } catch (err) {
      next(err);
    }
  };

  app.get('/api/health/db', handleDbHealth);
  app.get('/api/db/health', handleDbHealth);

  app.get('/api/db/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dbStatus = await checkDatabaseHealth();
      res.json(dbStatus);
    } catch (err) {
      next(err);
    }
  });

  // --- Public Authentication Endpoints (Supabase Auth) ---
  app.get('/api/auth/config', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await getAuthConfigStatus();
      res.json({
        ...status,
        // Public anon key is safe for client use when configured; service_role or DB URI is NEVER exposed
        supabase_anon_key: resolveSupabaseAnonKey(),
        supabase_url: resolveSupabaseUrl(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/signup', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = signUpSchema.parse(req.body);
      const session = await registerUser(parsed);
      res.status(201).json({ data: session });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/signin', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = signInSchema.parse(req.body);
      const session = await signInUser(parsed);
      res.status(200).json({ data: session });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/signout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      await signOutSession(token);
      res.status(200).json({ signed_out: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      const user = await verifyAccessToken(token);
      res.status(200).json({ data: user });
    } catch (err) {
      next(err);
    }
  });

  // --- Protected API Authentication Middleware ---
  // CRITICAL SECURITY INVARIANT:
  // 1. `X-Owner-Id` or `req.query.owner_id` is NEVER trusted to establish or override user identity.
  // 2. Every protected endpoint derives `req.ownerId` exclusively from a verified Bearer token.
  // 3. Read-only Demo Mode (`X-Demo-Mode: true`) is permitted ONLY for unauthenticated GET requests
  //    to the isolated demo dataset (`owner-kisan-cooperative-01`) and never allows writes or access
  //    to any real user's records.
  app.use('/api', async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      if (token) {
        const verifiedUser = await verifyAccessToken(token);
        req.authUser = verifiedUser;
        req.ownerId = verifiedUser.id;
        req.isDemoMode = false;
        next();
        return;
      }

      const demoHeader = req.header('x-demo-mode') || req.header('X-Demo-Mode');
      if (demoHeader === 'true' && req.method === 'GET') {
        req.ownerId = 'owner-kisan-cooperative-01';
        req.isDemoMode = true;
        next();
        return;
      }

      if (demoHeader === 'true' && req.method !== 'GET') {
        throw new AuthError(
          'Read-Only Demo Mode does not permit creating, modifying, or deleting records. Please sign in to your account.',
          403,
          'DEMO_READ_ONLY'
        );
      }

      throw new AuthError(
        'Authentication required. Please sign in and include a valid Authorization: Bearer token.',
        401,
        'UNAUTHORIZED'
      );
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/db/apply-migration', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await applySafeMigrationIfConnected();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/migrations/sql', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sql = getMigrationSqlContent();
      res.json({
        filename: 'migrations/001_initial_schema.sql + migrations/002_rls_and_auth.sql',
        sql,
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Bootstrap Endpoint ---
  app.get('/api/bootstrap', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        dbStatus,
        farms,
        plots,
        cropCycles,
        cultivationEvents,
        harvests,
        qualityAssessments,
        marketEntries,
      ] = await Promise.all([
        checkDatabaseHealth(),
        listFarms(req.ownerId),
        listPlots(req.ownerId),
        listCropCycles(req.ownerId),
        listCultivationEvents(req.ownerId),
        listHarvests(req.ownerId),
        listQualityAssessments(req.ownerId),
        listMarketEntries(req.ownerId),
      ]);

      const cycleReports = buildFarmCycleReports({
        farms,
        plots,
        cropCycles,
        cultivationEvents,
        harvests,
        qualityAssessments,
      });

      const alerts = computeActionableAlerts({
        cropCycles,
        cultivationEvents,
        harvests,
        qualityAssessments,
      });

      res.json({
        owner_id: req.ownerId,
        is_demo_mode: Boolean(req.isDemoMode),
        authenticated_user: req.authUser || null,
        gemini_configured: isGeminiConfigured(),
        database: dbStatus,
        farms,
        plots,
        crop_cycles: cropCycles,
        cultivation_events: cultivationEvents,
        harvests,
        quality_assessments: qualityAssessments,
        market_entries: marketEntries,
        cycle_reports: cycleReports,
        alerts,
      });
    } catch (err) {
      next(err);
    }
  });

  // --- 1. Farms CRUD ---
  app.get('/api/farms', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const farms = await listFarms(req.ownerId);
      res.json({ data: farms, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/farms/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const farms = await listFarms(req.ownerId);
      const farm = farms.find((f) => f.id === id);
      if (!farm) {
        res.status(404).json({ error: 'Farm not found for current owner scope' });
        return;
      }
      res.json({ data: farm, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/farms', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = FarmInputSchema.parse(req.body);
      const created = await createFarm(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/farms/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = FarmInputSchema.parse(req.body);
      const updated = await updateFarm(req.ownerId, id, parsed);
      if (!updated) {
        res.status(404).json({ error: 'Farm not found for current owner scope' });
        return;
      }
      res.json({ data: updated, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/farms/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteFarm(req.ownerId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Farm not found for current owner scope' });
        return;
      }
      res.json({ deleted: true, id, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  // --- 2. Plots CRUD ---
  app.get('/api/plots', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plots = await listPlots(req.ownerId);
      res.json({ data: plots, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/plots/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const plots = await listPlots(req.ownerId);
      const plot = plots.find((p) => p.id === id);
      if (!plot) {
        res.status(404).json({ error: 'Plot not found for current owner scope' });
        return;
      }
      res.json({ data: plot, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plots', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PlotInputSchema.parse(req.body);
      const created = await createPlot(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/plots/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = PlotInputSchema.parse(req.body);
      const updated = await updatePlot(req.ownerId, id, parsed);
      if (!updated) {
        res.status(404).json({ error: 'Plot not found for current owner scope' });
        return;
      }
      res.json({ data: updated, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/plots/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deletePlot(req.ownerId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Plot not found for current owner scope' });
        return;
      }
      res.json({ deleted: true, id, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  // --- 3. Crop Cycles CRUD & Detail Endpoint ---
  app.get('/api/crop-cycles', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cycles = await listCropCycles(req.ownerId);
      res.json({ data: cycles, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/crop-cycles/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const [farms, plots, cropCycles, cultivationEvents, harvests, qualityAssessments] =
        await Promise.all([
          listFarms(req.ownerId),
          listPlots(req.ownerId),
          listCropCycles(req.ownerId),
          listCultivationEvents(req.ownerId),
          listHarvests(req.ownerId),
          listQualityAssessments(req.ownerId),
        ]);

      const cycle = cropCycles.find((c) => c.id === id);
      if (!cycle) {
        res.status(404).json({ error: 'Crop cycle not found for current owner scope' });
        return;
      }

      const farm = farms.find((f) => f.id === cycle.farm_id) || null;
      const plot = plots.find((p) => p.id === cycle.plot_id) || null;
      const events = cultivationEvents.filter((e) => e.crop_cycle_id === cycle.id);
      const cycleHarvests = harvests.filter((h) => h.crop_cycle_id === cycle.id);
      const assessments = qualityAssessments.filter((q) => q.crop_cycle_id === cycle.id);
      const [cycleReport] = buildFarmCycleReports({
        farms,
        plots,
        cropCycles: [cycle],
        cultivationEvents: events,
        harvests: cycleHarvests,
        qualityAssessments: assessments,
      });

      res.json({
        data: {
          cycle,
          farm,
          plot,
          cultivation_events: events,
          harvests: cycleHarvests,
          quality_assessments: assessments,
          report: cycleReport,
        },
        ...getPersistenceMeta(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/crop-cycles', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CropCycleInputSchema.parse(req.body);
      const created = await createCropCycle(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/crop-cycles/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = CropCycleInputSchema.parse(req.body);
      const updated = await updateCropCycle(req.ownerId, id, parsed);
      if (!updated) {
        res.status(404).json({ error: 'Crop cycle not found for current owner scope' });
        return;
      }
      res.json({ data: updated, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/crop-cycles/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteCropCycle(req.ownerId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Crop cycle not found for current owner scope' });
        return;
      }
      res.json({ deleted: true, id, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/crop-cycles/:id/ai-advisory',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = idParamSchema.parse(req.params);
        const [farms, plots, cropCycles, cultivationEvents, harvests, qualityAssessments] =
          await Promise.all([
            listFarms(req.ownerId),
            listPlots(req.ownerId),
            listCropCycles(req.ownerId),
            listCultivationEvents(req.ownerId),
            listHarvests(req.ownerId),
            listQualityAssessments(req.ownerId),
          ]);

        const cycle = cropCycles.find((c) => c.id === id);
        if (!cycle) {
          res.status(404).json({ error: 'Crop cycle not found for current owner scope' });
          return;
        }

        const farm = farms.find((f) => f.id === cycle.farm_id) || null;
        const plot = plots.find((p) => p.id === cycle.plot_id) || null;
        const events = cultivationEvents.filter((e) => e.crop_cycle_id === cycle.id);
        const cycleHarvests = harvests.filter((h) => h.crop_cycle_id === cycle.id);
        const assessments = qualityAssessments.filter((q) => q.crop_cycle_id === cycle.id);
        const [report] = buildFarmCycleReports({
          farms,
          plots,
          cropCycles: [cycle],
          cultivationEvents: events,
          harvests: cycleHarvests,
          qualityAssessments: assessments,
        });

        // Build deterministic data-completeness observations from actual recorded rows
        const dataGaps: string[] = [];
        if (!plot?.soil_ph) {
          dataGaps.push('Plot soil pH is not recorded — consider laboratory soil testing before adjusting fertilizer pH buffs.');
        }
        if (cycle.seed_cost === null) {
          dataGaps.push('Seed cost is unrecorded (null) — enter actual seed invoice or 0 if farm-saved seed.');
        }
        if (report.events_with_missing_cost > 0) {
          dataGaps.push(`${report.events_with_missing_cost} logged cultivation event(s) have unrecorded cost (null).`);
        }
        if (events.length === 0) {
          dataGaps.push('No cultivation events logged yet for this cycle.');
        }
        if (report.pending_quality_count > 0) {
          dataGaps.push(`${report.pending_quality_count} quality assessment(s) are still pending farmer physical verification.`);
        }

        const ai = getGeminiClient();
        if (!ai) {
          res.json({
            experimental: true,
            source_mode: 'rule_based_fallback',
            disclaimer:
              'Rule-Based Agronomic Audit (Server-Side GEMINI_API_KEY not configured): Derived strictly from your recorded Supabase database fields. Verify all agronomic decisions with a local extension officer.',
            advisory: {
              stage_summary: `${cycle.crop_name} (${cycle.seed_variety || 'variety unspecified'}) on ${plot?.name || 'plot'} is currently in the "${cycle.current_stage.replace(/_/g, ' ')}" stage (${cycle.status}) with ${events.length} logged field activity(ies) and ${cycleHarvests.length} harvest batch(es).`,
              operational_priorities: [
                events.length === 0
                  ? `Log baseline ${cycle.current_stage.replace(/_/g, ' ')} field operations (irrigation, weeding, or observations) with actual dates.`
                  : `Review recent activity (${events[0].activity_type.replace(/_/g, ' ')} on ${events[0].event_date}) and monitor crop progression toward the next phenological stage.`,
                plot?.irrigation_type
                  ? `Inspect ${plot.irrigation_type} lines and soil moisture uniformity across ${plot.area_acres} acres.`
                  : 'Record plot irrigation method to track water management.',
                cycle.expected_harvest_date
                  ? `Target harvest window is ${cycle.expected_harvest_date}; prepare clean crates/weighbridge tickets ahead of harvest.`
                  : 'Set an expected harvest date based on seed variety maturity days.',
              ],
              data_completeness_notes:
                dataGaps.length > 0
                  ? dataGaps
                  : ['All core cost, soil pH, activity, and quality verification fields are recorded for this cycle.'],
            },
          });
          return;
        }

        const prompt = `You are an agricultural decision-support assistant reviewing a farmer's recorded crop cycle in Green Loop.
 Strictly base your analysis ONLY on the recorded data below. Do NOT invent weather forecasts, soil lab numbers, live market prices, or numerical probability scores. Clearly distinguish missing/unrecorded values (null) from zero (0).

Recorded Crop Cycle Data:
- Crop: ${cycle.crop_name} (Variety: ${cycle.seed_variety || 'Not recorded'}, Seed Source: ${cycle.seed_source || 'Not recorded'})
- Farm & Plot: ${farm?.name || 'Unknown'} (${farm?.location || ''}) / ${plot?.name || 'Unknown'} (${plot?.area_acres ?? 'Unknown'} acres, Soil: ${plot?.soil_type || 'Not recorded'}, pH: ${plot?.soil_ph ?? 'Not recorded'}, Irrigation: ${plot?.irrigation_type || 'Not recorded'})
- Sowing Date: ${cycle.sowing_date}, Expected Harvest: ${cycle.expected_harvest_date || 'Not set'}
- Status: ${cycle.status}, Current Stage: ${cycle.current_stage}
- Seed Cost: ${cycle.seed_cost !== null ? `INR ${cycle.seed_cost}` : 'Not recorded (null)'}
- Logged Cultivation Activities (${events.length}): ${events.map((e) => `[${e.event_date}] ${e.activity_type} (${e.crop_stage}): ${e.description} | Inputs: ${e.inputs_applied || 'None'} | Cost: ${e.cost_amount !== null ? `INR ${e.cost_amount}` : 'Not recorded'}`).join('; ') || 'None'}
- Recorded Harvests (${cycleHarvests.length}): Total ${report.total_measured_weight_kg !== null ? `${report.total_measured_weight_kg} kg` : 'Not recorded'}
- Farmer-Verified Quality Grade: ${report.latest_verified_grade || 'None verified yet'} (${report.pending_quality_count} pending review)`;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                stage_summary: {
                  type: Type.STRING,
                  description:
                    'Concise 1-2 sentence summary of current crop stage and recorded field progress without inventing metrics.',
                },
                operational_priorities: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    '2 to 4 practical, qualified agronomic checks or field actions appropriate for the current stage and recorded plot conditions.',
                },
                data_completeness_notes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'Notes on any unrecorded (null) soil, cost, or quality verification fields that the farmer could record next.',
                },
              },
              required: ['stage_summary', 'operational_priorities', 'data_completeness_notes'],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        res.json({
          experimental: true,
          source_mode: 'gemini_ai',
          disclaimer:
            'Experimental AI Agronomic Advisory (Unvalidated): Generated from your recorded cycle logs only. Consult a local agronomist or KVK extension officer before applying chemical inputs.',
          advisory: {
            stage_summary:
              parsed.stage_summary ||
              `${cycle.crop_name} is currently at ${cycle.current_stage} stage.`,
            operational_priorities: Array.isArray(parsed.operational_priorities)
              ? parsed.operational_priorities
              : ['Monitor field moisture and log dated observations.'],
            data_completeness_notes:
              Array.isArray(parsed.data_completeness_notes) &&
              parsed.data_completeness_notes.length > 0
                ? parsed.data_completeness_notes
                : dataGaps.length > 0
                  ? dataGaps
                  : ['Core cycle records are up to date.'],
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // --- 4. Cultivation Events CRUD ---
  app.get('/api/cultivation-events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const events = await listCultivationEvents(req.ownerId);
      res.json({ data: events, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/cultivation-events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const events = await listCultivationEvents(req.ownerId);
      const event = events.find((e) => e.id === id);
      if (!event) {
        res.status(404).json({ error: 'Cultivation event not found for current owner scope' });
        return;
      }
      res.json({ data: event, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cultivation-events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CultivationEventInputSchema.parse(req.body);
      const created = await createCultivationEvent(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/cultivation-events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = CultivationEventInputSchema.parse(req.body);
      const updated = await updateCultivationEvent(req.ownerId, id, parsed);
      if (!updated) {
        res.status(404).json({ error: 'Cultivation event not found for current owner scope' });
        return;
      }
      res.json({ data: updated, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/cultivation-events/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteCultivationEvent(req.ownerId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Cultivation event not found for current owner scope' });
        return;
      }
      res.json({ deleted: true, id, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  // --- 5. Harvests CRUD ---
  app.get('/api/harvests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const harvests = await listHarvests(req.ownerId);
      res.json({ data: harvests, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/harvests/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const harvests = await listHarvests(req.ownerId);
      const harvest = harvests.find((h) => h.id === id);
      if (!harvest) {
        res.status(404).json({ error: 'Harvest record not found for current owner scope' });
        return;
      }
      res.json({ data: harvest, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/harvests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = HarvestInputSchema.parse(req.body);
      const created = await createHarvest(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/harvests/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = HarvestInputSchema.parse(req.body);
      const updated = await updateHarvest(req.ownerId, id, parsed);
      if (!updated) {
        res.status(404).json({ error: 'Harvest record not found for current owner scope' });
        return;
      }
      res.json({ data: updated, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/harvests/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteHarvest(req.ownerId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Harvest record not found for current owner scope' });
        return;
      }
      res.json({ deleted: true, id, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  // --- 6. Quality Assessments CRUD & Server-Side Gemini Vision Analysis ---
  app.get('/api/quality-assessments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await listQualityAssessments(req.ownerId);
      res.json({ data: items, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/quality-assessments/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const items = await listQualityAssessments(req.ownerId);
      const item = items.find((q) => q.id === id);
      if (!item) {
        res.status(404).json({ error: 'Quality assessment not found for current owner scope' });
        return;
      }
      res.json({ data: item, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/quality-assessments/analyze-image',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = AnalyzeCropImageRequestSchema.parse(req.body);
        const cleanBase64 = parsed.image_base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

        const ai = getGeminiClient();
        if (!ai) {
          res.status(503).json({
            error:
              'Server-side GEMINI_API_KEY is not configured. You can still record manual visual observations below.',
            experimental: true,
          });
          return;
        }

        const promptText = `You are an agricultural visual observation assistant inspecting an uploaded crop image for: "${parsed.crop_name}".
${parsed.farmer_context ? `Farmer notes / context: "${parsed.farmer_context}".` : ''}

STRICT SCIENTIFIC & HONESTY RULES:
1. Describe ONLY visible surface characteristics observable in the image (e.g., visible ripeness coloration, visible surface blemishes/cracks/spots, color uniformity, and outer surface condition).
2. NEVER invent laboratory measurements (do not claim Brix, moisture percentage, pesticide residue, internal rot, or weight).
3. NEVER fabricate numeric confidence probabilities or percentage certainty scores.
4. Clearly frame the summary as an unvalidated, experimental visual observation requiring physical inspection by the farmer.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: parsed.mime_type,
                  data: cleanBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                visible_ripeness: {
                  type: Type.STRING,
                  description:
                    'Qualitative description of visible coloration and maturity stage only.',
                },
                visible_defects: {
                  type: Type.STRING,
                  description:
                    'Visible exterior blemishes, cracks, bruising, discoloration, or "No prominent surface defects visible in frame".',
                },
                color_uniformity: {
                  type: Type.STRING,
                  description: 'Qualitative description of color consistency across visible units.',
                },
                surface_condition: {
                  type: Type.STRING,
                  description: 'Visible skin/hull/leaf texture and cleanliness.',
                },
                experimental_ai_summary: {
                  type: Type.STRING,
                  description:
                    'Concise experimental summary noting visible traits and reminding the farmer to physically verify moisture, internal quality, and grading.',
                },
              },
              required: [
                'visible_ripeness',
                'visible_defects',
                'color_uniformity',
                'surface_condition',
                'experimental_ai_summary',
              ],
            },
          },
        });

        const rawText = response.text || '{}';
        const analysis = JSON.parse(rawText);

        res.json({
          experimental: true,
          disclaimer:
            'Experimental AI Visual Output (Unvalidated): Describes visible surface traits only. Not a substitute for physical grading or laboratory testing.',
          analysis: {
            visible_ripeness:
              analysis.visible_ripeness || 'Visible coloration observed in sample frame',
            visible_defects:
              analysis.visible_defects || 'Requires manual physical sorting to confirm defects',
            color_uniformity: analysis.color_uniformity || 'Moderate visible uniformity',
            surface_condition: analysis.surface_condition || 'Inspect surface physically',
            experimental_ai_summary: `[Experimental Unvalidated Output] ${
              analysis.experimental_ai_summary ||
              'Visual inspection completed. Physical verification required.'
            }`,
          },
        });
      } catch (err) {
        if (err instanceof ZodError) {
          next(err);
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Experimental Gemini image analysis request failed';
        res.status(502).json({
          error: `Experimental AI analysis unavailable (${message}). You may enter your visual observations directly in the form below.`,
          experimental: true,
        });
      }
    }
  );

  app.post('/api/quality-assessments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = QualityAssessmentInputSchema.parse(req.body);
      const created = await createQualityAssessment(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put(
    '/api/quality-assessments/:id',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = idParamSchema.parse(req.params);
        const parsed = QualityAssessmentInputSchema.parse(req.body);
        const updated = await updateQualityAssessment(req.ownerId, id, parsed);
        if (!updated) {
          res.status(404).json({ error: 'Quality assessment not found for current owner scope' });
          return;
        }
        res.json({ data: updated, ...getPersistenceMeta() });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/quality-assessments/:id/review',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = idParamSchema.parse(req.params);
        const parsedReview = reviewPatchSchema.parse(req.body);
        const updated = await updateQualityAssessmentReview(req.ownerId, id, parsedReview);
        if (!updated) {
          res.status(404).json({ error: 'Quality assessment not found for current owner scope' });
          return;
        }
        res.json({ data: updated, ...getPersistenceMeta() });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    '/api/quality-assessments/:id',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = idParamSchema.parse(req.params);
        const deleted = await deleteQualityAssessment(req.ownerId, id);
        if (!deleted) {
          res.status(404).json({ error: 'Quality assessment not found for current owner scope' });
          return;
        }
        res.json({ deleted: true, id, ...getPersistenceMeta() });
      } catch (err) {
        next(err);
      }
    }
  );

  // --- 7. Market Entries CRUD ---
  app.get('/api/market-entries', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entries = await listMarketEntries(req.ownerId);
      res.json({ data: entries, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/market-entries/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const entries = await listMarketEntries(req.ownerId);
      const entry = entries.find((m) => m.id === id);
      if (!entry) {
        res.status(404).json({ error: 'Market entry not found for current owner scope' });
        return;
      }
      res.json({ data: entry, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/market-entries', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = MarketEntryInputSchema.parse(req.body);
      const created = await createMarketEntry(req.ownerId, parsed);
      res.status(201).json({ data: created, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/market-entries/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const parsed = MarketEntryInputSchema.parse(req.body);
      const updated = await updateMarketEntry(req.ownerId, id, parsed);
      if (!updated) {
        res.status(404).json({ error: 'Market entry not found for current owner scope' });
        return;
      }
      res.json({ data: updated, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/market-entries/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteMarketEntry(req.ownerId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Market entry not found for current owner scope' });
        return;
      }
      res.json({ deleted: true, id, ...getPersistenceMeta() });
    } catch (err) {
      next(err);
    }
  });

  // --- 8. Farm & Crop-Cycle Report Summary Endpoints ---
  const handleCycleReportsSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [farms, plots, cropCycles, cultivationEvents, harvests, qualityAssessments] =
        await Promise.all([
          listFarms(req.ownerId),
          listPlots(req.ownerId),
          listCropCycles(req.ownerId),
          listCultivationEvents(req.ownerId),
          listHarvests(req.ownerId),
          listQualityAssessments(req.ownerId),
        ]);

      const cycleReports = buildFarmCycleReports({
        farms,
        plots,
        cropCycles,
        cultivationEvents,
        harvests,
        qualityAssessments,
      });

      res.json({
        owner_id: req.ownerId,
        generated_at: new Date().toISOString(),
        cycle_reports: cycleReports,
        ...getPersistenceMeta(),
      });
    } catch (err) {
      next(err);
    }
  };

  app.get('/api/reports/summary', handleCycleReportsSummary);
  app.get('/api/reports/crop-cycles', handleCycleReportsSummary);

  app.get('/api/crop-cycles/:id/report', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const [farms, plots, cropCycles, cultivationEvents, harvests, qualityAssessments] =
        await Promise.all([
          listFarms(req.ownerId),
          listPlots(req.ownerId),
          listCropCycles(req.ownerId),
          listCultivationEvents(req.ownerId),
          listHarvests(req.ownerId),
          listQualityAssessments(req.ownerId),
        ]);

      const cycle = cropCycles.find((c) => c.id === id);
      if (!cycle) {
        res.status(404).json({ error: 'Crop cycle not found for current owner scope' });
        return;
      }

      const [report] = buildFarmCycleReports({
        farms,
        plots,
        cropCycles: [cycle],
        cultivationEvents: cultivationEvents.filter((e) => e.crop_cycle_id === cycle.id),
        harvests: harvests.filter((h) => h.crop_cycle_id === cycle.id),
        qualityAssessments: qualityAssessments.filter((q) => q.crop_cycle_id === cycle.id),
      });

      res.json({
        data: report,
        ...getPersistenceMeta(),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- 9. Agricultural Weather & Risk Analysis Endpoint ---
  app.get('/api/weather', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let lat: number | undefined;
      let lon: number | undefined;
      let locationName: string | undefined;

      if (req.query.lat && req.query.lon) {
        lat = Number(req.query.lat);
        lon = Number(req.query.lon);
      }
      if (typeof req.query.location === 'string') {
        locationName = req.query.location;
      }

      // If coordinates not provided, check the authenticated owner's primary farm
      if ((!lat || !lon) && req.ownerId) {
        const farms = await listFarms(req.ownerId);
        const primary = farms[0];
        if (primary?.location) {
          locationName = primary.location;
        }
      }

      const weather = await fetchAgriculturalWeather({
        latitude: lat,
        longitude: lon,
        locationName,
      });

      res.json({
        ...weather,
        owner_id: req.ownerId,
        is_demo_mode: Boolean(req.isDemoMode),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- 10. Agricultural Crop Planning & Recommendations Endpoint ---
  app.get('/api/recommendations', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let plotId = typeof req.query.plot_id === 'string' ? req.query.plot_id : undefined;
      let plotName = typeof req.query.plot_name === 'string' ? req.query.plot_name : undefined;
      let soilType = typeof req.query.soil_type === 'string' ? req.query.soil_type : undefined;
      let soilPh = req.query.soil_ph !== undefined ? Number(req.query.soil_ph) : undefined;
      let irrigation = typeof req.query.irrigation === 'string' ? req.query.irrigation : undefined;
      let area = req.query.area_acres !== undefined ? Number(req.query.area_acres) : undefined;

      if (plotId && req.ownerId) {
        const plots = await listPlots(req.ownerId);
        const plot = plots.find((p) => p.id === plotId);
        if (plot) {
          plotName = plot.name;
          soilType = plot.soil_type || soilType;
          soilPh = plot.soil_ph !== null ? plot.soil_ph : soilPh;
          irrigation = plot.irrigation_type || irrigation;
          area = plot.area_acres;
        }
      } else if (!plotId && req.ownerId) {
        const plots = await listPlots(req.ownerId);
        if (plots.length > 0) {
          const plot = plots[0];
          plotId = plot.id;
          plotName = plot.name;
          soilType = plot.soil_type || soilType;
          soilPh = plot.soil_ph !== null ? plot.soil_ph : soilPh;
          irrigation = plot.irrigation_type || irrigation;
          area = plot.area_acres;
        }
      }

      const recommendations = computeCropRecommendations({
        plot_id: plotId,
        plot_name: plotName,
        soil_type: soilType,
        soil_ph: soilPh,
        irrigation_type: irrigation,
        area_acres: area,
      });

      res.json({
        ...recommendations,
        owner_id: req.ownerId,
        is_demo_mode: Boolean(req.isDemoMode),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/recommendations/evaluate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        plot_id,
        plot_name,
        soil_type,
        soil_ph,
        irrigation_type,
        area_acres,
        current_season,
        previous_crop,
      } = req.body || {};

      let evaluatedSoilType = soil_type;
      let evaluatedSoilPh = soil_ph !== undefined && soil_ph !== null ? Number(soil_ph) : null;
      let evaluatedIrrigation = irrigation_type;
      let evaluatedArea = area_acres !== undefined && area_acres !== null ? Number(area_acres) : null;
      let evaluatedPlotName = plot_name || 'Target Parcel';

      if (plot_id && req.ownerId) {
        const plots = await listPlots(req.ownerId);
        const plot = plots.find((p) => p.id === plot_id);
        if (plot) {
          evaluatedPlotName = plot.name;
          if (!evaluatedSoilType) evaluatedSoilType = plot.soil_type;
          if (evaluatedSoilPh === null) evaluatedSoilPh = plot.soil_ph;
          if (!evaluatedIrrigation) evaluatedIrrigation = plot.irrigation_type;
          if (evaluatedArea === null) evaluatedArea = plot.area_acres;
        }
      }

      const recommendations = computeCropRecommendations({
        plot_id,
        plot_name: evaluatedPlotName,
        soil_type: evaluatedSoilType,
        soil_ph: evaluatedSoilPh,
        irrigation_type: evaluatedIrrigation,
        area_acres: evaluatedArea,
        current_season,
        previous_crop,
      });

      res.json({
        ...recommendations,
        owner_id: req.ownerId,
        is_demo_mode: Boolean(req.isDemoMode),
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Centralized API Error Handler ---
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    if (err instanceof ParentOwnershipError) {
      res.status(403).json({
        error: err.message,
        code: 'FORBIDDEN_PARENT_OWNERSHIP',
      });
      return;
    }

    const pgCode =
      err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
        ? err.code
        : null;

    if (pgCode === '42501') {
      res.status(403).json({
        error: 'Access denied by PostgreSQL Row-Level Security (RLS) policy.',
        code: pgCode,
      });
      return;
    }

    if (pgCode === '23503') {
      res.status(400).json({
        error: 'Referenced parent record (farm, plot, or crop cycle) does not exist.',
        code: pgCode,
      });
      return;
    }

    if (pgCode === '22P02' || pgCode === '23514') {
      res.status(400).json({
        error: 'Invalid resource identifier or constraint violation.',
        code: pgCode,
      });
      return;
    }

    const rawMessage = err instanceof Error ? err.message : 'Internal server error';
    const safeMessage = rawMessage.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DB_URI]');
    res.status(500).json({
      error: safeMessage,
      detail: safeMessage,
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Green Loop server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Green Loop server:', err);
  process.exit(1);
});
