import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import crypto from 'node:crypto';
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
} from '../shared/validation';

const { Pool } = pg;

export const REQUIRED_TABLES = [
  'farms',
  'plots',
  'crop_cycles',
  'cultivation_events',
  'harvests',
  'quality_assessments',
] as const;

export const OPTIONAL_TABLES = ['market_entries'] as const;

export interface DatabaseStatusReport {
  configured: boolean;
  connected: boolean;
  select_one: number | null;
  schema_verified: boolean;
  persisted_to_postgres: boolean;
  database_name: string | null;
  server_time: string | null;
  latency_ms: number | null;
  existing_tables: string[];
  missing_tables: string[];
  active_storage_mode: 'supabase_postgres' | 'in_memory_demo_fallback' | 'database_error';
  rls_verified?: boolean;
  error_code: string | null;
  message: string;
  checked_at: string;
}

let pool: pg.Pool | null = null;
let cachedPoolUrl: string | null = null;
let cachedSchemaVerified = false;
let cachedRlsVerified = false;

export function isDatabaseUrlConfigured(): boolean {
  const url = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
  if (
    !url ||
    url === 'MY_DATABASE_URL' ||
    url.includes('[PASSWORD]') ||
    url.includes('[PROJECT-REF]')
  ) {
    return false;
  }
  return true;
}

function getDatabaseUrl(): string | null {
  if (!isDatabaseUrlConfigured()) return null;
  return (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
}

export function sanitizeDbError(err: unknown): { message: string; code: string | null } {
  if (!err || typeof err !== 'object') {
    return { message: 'Unknown database error', code: null };
  }
  const rawMsg = 'message' in err && typeof err.message === 'string' ? err.message : 'Database query failed';
  const code = 'code' in err && typeof err.code === 'string' ? err.code : null;
  const safeMsg = rawMsg.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@');
  return { message: safeMsg, code };
}

/**
 * Loads the official Supabase Root 2021 CA certificate (prod-ca-2021.crt) from
 * `./prod-ca-2021.crt` or `./certs/prod-ca-2021.crt` alongside Node's built-in
 * root certificates so `rejectUnauthorized: true` verifies Supabase session/transaction
 * poolers (`*.pooler.supabase.com`) without requiring a separate DB_SSL_CA secret.
 */
function loadTrustedCaBundle(): string[] {
  const certs: string[] = [...tls.rootCertificates];
  const candidatePaths = [
    path.resolve(process.cwd(), 'prod-ca-2021.crt'),
    path.resolve(process.cwd(), 'certs', 'prod-ca-2021.crt'),
  ];

  for (const certPath of candidatePaths) {
    if (fs.existsSync(certPath)) {
      const pem = fs.readFileSync(certPath, 'utf-8').trim();
      if (pem.includes('BEGIN CERTIFICATE')) {
        certs.unshift(pem);
      }
    }
  }

  if (process.env.DB_SSL_CA && process.env.DB_SSL_CA.includes('BEGIN CERTIFICATE')) {
    certs.unshift(process.env.DB_SSL_CA.replace(/\\n/g, '\n').trim());
  }

  return certs;
}

/**
 * Strips `sslmode` query parameters from the URI when present so `pg-connection-string`
 * does not overwrite the explicit `ssl: { rejectUnauthorized: true, ca }` configuration.
 */
function normalizeConnectionStringForSsl(dbUrl: string): string {
  try {
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return dbUrl;
  }
}

export function getPool(): pg.Pool | null {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return null;

  if (pool && cachedPoolUrl !== dbUrl) {
    void pool.end().catch(() => {});
    pool = null;
    cachedSchemaVerified = false;
  }

  if (!pool) {
    cachedPoolUrl = dbUrl;
    const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    const cleanConnectionString = isLocalhost ? dbUrl : normalizeConnectionStringForSsl(dbUrl);

    pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: isLocalhost
        ? false
        : {
            rejectUnauthorized: true,
            ca: loadTrustedCaBundle(),
          },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', () => {
      cachedSchemaVerified = false;
    });
  }
  return pool;
}

/**
 * Executes a real SELECT 1 query against the configured PostgreSQL database and
 * reports connection/schema status honestly. Never claims a connection succeeded
 * when DATABASE_URL is unset or unreachable.
 */
export async function checkDatabaseHealth(): Promise<DatabaseStatusReport> {
  const checkedAt = new Date().toISOString();
  const dbPool = getPool();

  if (!dbPool) {
    cachedSchemaVerified = false;
    return {
      configured: false,
      connected: false,
      select_one: null,
      schema_verified: false,
      persisted_to_postgres: false,
      database_name: null,
      server_time: null,
      latency_ms: null,
      existing_tables: [],
      missing_tables: [...REQUIRED_TABLES],
      active_storage_mode: 'in_memory_demo_fallback',
      error_code: 'DATABASE_URL_NOT_CONFIGURED',
      message:
        'DATABASE_URL is not configured in server environment. Operating in temporary in-memory session mode with labelled demo records (not persisted to Supabase PostgreSQL).',
      checked_at: checkedAt,
    };
  }

  const startMs = Date.now();
  try {
    const pingRes = await dbPool.query<{
      select_one: number;
      server_time: Date | string;
      database_name: string;
    }>(`SELECT 1 AS select_one, NOW() AS server_time, current_database() AS database_name`);
    const latencyMs = Date.now() - startMs;
    const row = pingRes.rows[0];
    const selectOne = Number(row?.select_one ?? 1);
    const serverTime =
      row?.server_time instanceof Date
        ? row.server_time.toISOString()
        : String(row?.server_time || checkedAt);
    const databaseName = row?.database_name || 'postgres';

    const tableRes = await dbPool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name ASC`,
      [[...REQUIRED_TABLES, ...OPTIONAL_TABLES]]
    );
    const existingTables = tableRes.rows.map((r) => r.table_name);
    const existingSet = new Set(existingTables);
    const missingRequired = REQUIRED_TABLES.filter((t) => !existingSet.has(t));
    cachedSchemaVerified = missingRequired.length === 0;

    let rlsVerified = false;
    if (cachedSchemaVerified) {
      const rlsRes = await dbPool.query<{ all_rls: boolean }>(
        `SELECT COALESCE(bool_and(rowsecurity), FALSE) AS all_rls
         FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename = ANY($1::text[])`,
        [[...REQUIRED_TABLES]]
      );
      rlsVerified = Boolean(rlsRes.rows[0]?.all_rls);
    }
    cachedRlsVerified = rlsVerified;

    return {
      configured: true,
      connected: true,
      select_one: selectOne,
      schema_verified: cachedSchemaVerified,
      rls_verified: rlsVerified,
      persisted_to_postgres: cachedSchemaVerified,
      database_name: databaseName,
      server_time: serverTime,
      latency_ms: latencyMs,
      existing_tables: existingTables,
      missing_tables: missingRequired,
      active_storage_mode: cachedSchemaVerified ? 'supabase_postgres' : 'database_error',
      error_code: cachedSchemaVerified ? null : 'SCHEMA_MIGRATION_REQUIRED',
      message: cachedSchemaVerified
        ? `Connected to PostgreSQL database "${databaseName}" (SELECT 1 = ${selectOne}, ${latencyMs}ms). All 6 core lifecycle tables verified${rlsVerified ? ' with Row-Level Security (RLS) active' : ''}.`
        : `Connected to PostgreSQL database "${databaseName}" (${latencyMs}ms), but required table(s) are missing: ${missingRequired.join(', ')}. Apply migrations/001_initial_schema.sql.`,
      checked_at: checkedAt,
    };
  } catch (err) {
    const { message, code } = sanitizeDbError(err);
    cachedSchemaVerified = false;
    cachedRlsVerified = false;
    return {
      configured: true,
      connected: false,
      select_one: null,
      schema_verified: false,
      rls_verified: false,
      persisted_to_postgres: false,
      database_name: null,
      server_time: null,
      latency_ms: Date.now() - startMs,
      existing_tables: [],
      missing_tables: [...REQUIRED_TABLES],
      active_storage_mode: 'database_error',
      error_code: code || 'CONNECTION_FAILED',
      message: `PostgreSQL connection failed: ${message}`,
      checked_at: checkedAt,
    };
  }
}

export async function applySafeMigrationIfConnected(): Promise<{
  applied: boolean;
  existing_tables_before: string[];
  missing_tables_before: string[];
  existing_tables_after: string[];
  missing_tables_after: string[];
  status: DatabaseStatusReport;
}> {
  const dbPool = getPool();
  if (!dbPool) {
    await checkDatabaseHealth();
    throw new Error(
      'Cannot apply SQL migration because DATABASE_URL is not configured on the server.'
    );
  }

  // 1. Check which tables already exist before applying migration
  const beforeStatus = await checkDatabaseHealth();
  if (!beforeStatus.connected) {
    throw new Error(beforeStatus.message);
  }

  // 2. Apply non-destructive SQL migrations (001_initial_schema.sql + 002_rls_and_auth.sql)
  const migration001Path = path.resolve(process.cwd(), 'migrations', '001_initial_schema.sql');
  const sql001 = fs.readFileSync(migration001Path, 'utf-8');
  await dbPool.query(sql001);

  const migration002Path = path.resolve(process.cwd(), 'migrations', '002_rls_and_auth.sql');
  if (fs.existsSync(migration002Path)) {
    const sql002 = fs.readFileSync(migration002Path, 'utf-8');
    await dbPool.query(sql002);
  }

  // 3. Re-query information_schema.tables & pg_tables to verify all required tables and RLS exist
  const afterStatus = await checkDatabaseHealth();
  return {
    applied: afterStatus.schema_verified,
    existing_tables_before: beforeStatus.existing_tables,
    missing_tables_before: beforeStatus.missing_tables,
    existing_tables_after: afterStatus.existing_tables,
    missing_tables_after: afterStatus.missing_tables,
    status: afterStatus,
  };
}

export function getMigrationSqlContent(): string {
  const migration001Path = path.resolve(process.cwd(), 'migrations', '001_initial_schema.sql');
  const migration002Path = path.resolve(process.cwd(), 'migrations', '002_rls_and_auth.sql');
  const sql001 = fs.readFileSync(migration001Path, 'utf-8');
  const sql002 = fs.existsSync(migration002Path)
    ? fs.readFileSync(migration002Path, 'utf-8')
    : '';
  return `${sql001}\n\n${sql002}`.trim();
}

// --- Deterministic Seed Demo Store (Explicitly Labelled is_demo: true) ---
interface InMemoryWorkspace {
  farms: Farm[];
  plots: Plot[];
  cropCycles: CropCycle[];
  cultivationEvents: CultivationEvent[];
  harvests: Harvest[];
  qualityAssessments: QualityAssessment[];
  marketEntries: MarketEntry[];
}

const memoryStoreByOwner = new Map<string, InMemoryWorkspace>();

function createInitialDemoWorkspace(ownerId: string): InMemoryWorkspace {
  const f1Id = '11111111-1111-4111-8111-111111111101';
  const f2Id = '11111111-1111-4111-8111-111111111102';
  const p1Id = '22222222-2222-4222-8222-222222222201';
  const p2Id = '22222222-2222-4222-8222-222222222202';
  const p3Id = '22222222-2222-4222-8222-222222222203';
  const c1Id = '33333333-3333-4333-8333-333333333301';
  const c2Id = '33333333-3333-4333-8333-333333333302';
  const c3Id = '33333333-3333-4333-8333-333333333303';
  const h1Id = '55555555-5555-4555-8555-555555555501';

  return {
    farms: [
      {
        id: f1Id,
        owner_id: ownerId,
        name: 'Sahyadri Riverbend Farm (Demo)',
        location: 'Niphad Taluka, Nashik, Maharashtra',
        total_area_acres: 11.5,
        soil_summary: 'Deep black calcareous clay loam, moderate drainage',
        water_source: 'Godavari canal lift + farm pond storage',
        notes: 'Demo farm record illustrating multi-plot vegetable and pulse rotation.',
        is_demo: true,
        created_at: '2026-07-01T08:00:00Z',
        updated_at: '2026-07-01T08:00:00Z',
      },
      {
        id: f2Id,
        owner_id: ownerId,
        name: 'Deccan Rainfed Block (Demo)',
        location: 'Baramati, Pune District, Maharashtra',
        total_area_acres: 6.0,
        soil_summary: 'Medium red sandy loam, low organic carbon',
        water_source: 'Seasonal borewell + rainwater harvesting trench',
        notes: 'Demo rainfed pulse and millet block; soil pH test pending on south strip.',
        is_demo: true,
        created_at: '2026-07-10T09:30:00Z',
        updated_at: '2026-07-10T09:30:00Z',
      },
    ],
    plots: [
      {
        id: p1Id,
        owner_id: ownerId,
        farm_id: f1Id,
        name: 'Plot A1 — North Drip Terrace',
        area_acres: 4.5,
        soil_type: 'Black Cotton Clay Loam',
        soil_ph: 6.8,
        irrigation_type: 'Inline Drip (16mm)',
        location_coordinates: '20.0784° N, 74.1062° E',
        notes: 'Raised beds prepared in June; mulched with 25-micron silver-black film.',
        is_demo: true,
        created_at: '2026-07-02T08:00:00Z',
        updated_at: '2026-07-02T08:00:00Z',
      },
      {
        id: p2Id,
        owner_id: ownerId,
        farm_id: f1Id,
        name: 'Plot A2 — Lower Alluvial Strip',
        area_acres: 3.75,
        soil_type: 'Silty Clay Loam',
        soil_ph: 7.2,
        irrigation_type: 'Sprinkler + Furrow',
        location_coordinates: '20.0771° N, 74.1055° E',
        notes: 'Previous crop: summer green gram residue incorporated.',
        is_demo: true,
        created_at: '2026-07-02T08:15:00Z',
        updated_at: '2026-07-02T08:15:00Z',
      },
      {
        id: p3Id,
        owner_id: ownerId,
        farm_id: f2Id,
        name: 'Plot B1 — East Contour Field',
        area_acres: 6.0,
        soil_type: 'Red Sandy Loam',
        soil_ph: null,
        irrigation_type: 'Rainfed with supplemental mobile sprinkler',
        location_coordinates: '18.1516° N, 74.5777° E',
        notes: 'Soil pH laboratory report not yet recorded.',
        is_demo: true,
        created_at: '2026-07-11T10:00:00Z',
        updated_at: '2026-07-11T10:00:00Z',
      },
    ],
    cropCycles: [
      {
        id: c1Id,
        owner_id: ownerId,
        farm_id: f1Id,
        plot_id: p1Id,
        crop_name: 'Roma Tomato',
        seed_variety: 'Arka Rakshak F1 Hybrid',
        seed_source: 'IIHR Certified Nursery Batch #KL-209',
        sowing_date: '2026-07-18',
        expected_harvest_date: '2026-10-26',
        soil_details: 'pH 6.8, basal FYM 8 tons/acre applied pre-transplanting',
        location_detail: 'Sahyadri Riverbend — Plot A1 North Drip Terrace',
        status: 'active',
        current_stage: 'harvest_ready',
        seed_cost: 6400,
        notes: 'First picking completed; second picking approaching within 3 days.',
        is_demo: true,
        created_at: '2026-07-18T08:00:00Z',
        updated_at: '2026-10-20T08:00:00Z',
      },
      {
        id: c2Id,
        owner_id: ownerId,
        farm_id: f1Id,
        plot_id: p2Id,
        crop_name: 'Soybean',
        seed_variety: 'JS-20-34 (Early Maturing)',
        seed_source: 'State Seed Corporation Lot #MH-882',
        sowing_date: '2026-07-05',
        expected_harvest_date: '2026-10-12',
        soil_details: 'pH 7.2, Rhizobium + PSB seed treatment applied',
        location_detail: 'Sahyadri Riverbend — Plot A2 Lower Alluvial Strip',
        status: 'harvested',
        current_stage: 'post_harvest',
        seed_cost: 4200,
        notes: 'Harvested and threshed at 12% moisture content.',
        is_demo: true,
        created_at: '2026-07-05T08:00:00Z',
        updated_at: '2026-10-14T08:00:00Z',
      },
      {
        id: c3Id,
        owner_id: ownerId,
        farm_id: f2Id,
        plot_id: p3Id,
        crop_name: 'Chickpea (Desi Gram)',
        seed_variety: 'Digvijay (Wilt Resistant)',
        seed_source: 'Farm Saved Seed (Cleaned & Graded)',
        sowing_date: '2026-10-15',
        expected_harvest_date: '2027-02-10',
        soil_details: 'Red sandy loam; laboratory NPK & pH test not recorded',
        location_detail: 'Deccan Rainfed Block — Plot B1',
        status: 'active',
        current_stage: 'germination',
        seed_cost: 0,
        notes: 'Zero seed purchase cost (own saved seed). Pre-sowing moisture conserved.',
        is_demo: true,
        created_at: '2026-10-15T08:00:00Z',
        updated_at: '2026-10-18T08:00:00Z',
      },
    ],
    cultivationEvents: [
      {
        id: '44444444-4444-4444-8444-444444444401',
        owner_id: ownerId,
        crop_cycle_id: c1Id,
        event_date: '2026-08-12',
        activity_type: 'fertilizer',
        crop_stage: 'vegetative',
        description: 'Fertigation with water-soluble 19:19:19 and micronutrient chelate',
        inputs_applied: '19:19:19 NPK (15 kg) + Zn-EDTA (1.5 kg)',
        cost_amount: 3450,
        observations: 'Uniform vegetative canopy growth; no leaf curl observed.',
        is_demo: true,
        created_at: '2026-08-12T11:00:00Z',
        updated_at: '2026-08-12T11:00:00Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        owner_id: ownerId,
        crop_cycle_id: c1Id,
        event_date: '2026-09-18',
        activity_type: 'pest_management',
        crop_stage: 'fruiting',
        description: 'Installed pheromone traps for fruit borer and sprayed neem oil 10000 ppm',
        inputs_applied: '18 funnel traps + Azadirachtin 1% EC (900 ml)',
        cost_amount: 2100,
        observations: 'Low moth catch (2-3 per trap/week); fruit set healthy.',
        is_demo: true,
        created_at: '2026-09-18T15:30:00Z',
        updated_at: '2026-09-18T15:30:00Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444403',
        owner_id: ownerId,
        crop_cycle_id: c1Id,
        event_date: '2026-10-16',
        activity_type: 'irrigation',
        crop_stage: 'maturation',
        description: 'Controlled drip irrigation cycle during fruit coloration phase',
        inputs_applied: 'Canal pond water via drip inline',
        cost_amount: null,
        observations: 'Maintained moderate root-zone moisture to prevent fruit cracking.',
        is_demo: true,
        created_at: '2026-10-16T09:00:00Z',
        updated_at: '2026-10-16T09:00:00Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444404',
        owner_id: ownerId,
        crop_cycle_id: c2Id,
        event_date: '2026-08-22',
        activity_type: 'weeding',
        crop_stage: 'flowering',
        description: 'Inter-row wheel hoeing and manual removal of broadleaf weeds',
        inputs_applied: 'Manual labor (6 person-days)',
        cost_amount: 2400,
        observations: 'Nodulation inspected on uprooted sample border plant; pink active nodules.',
        is_demo: true,
        created_at: '2026-08-22T17:00:00Z',
        updated_at: '2026-08-22T17:00:00Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444405',
        owner_id: ownerId,
        crop_cycle_id: c3Id,
        event_date: '2026-10-20',
        activity_type: 'observation',
        crop_stage: 'germination',
        description: 'Emergence count across 5 diagonal 1m row segments',
        inputs_applied: null,
        cost_amount: 0,
        observations: 'Uniform seedling emergence observed 5 days after sowing.',
        is_demo: true,
        created_at: '2026-10-20T08:30:00Z',
        updated_at: '2026-10-20T08:30:00Z',
      },
    ],
    harvests: [
      {
        id: h1Id,
        owner_id: ownerId,
        crop_cycle_id: c1Id,
        harvest_date: '2026-10-19',
        measured_weight: 1840,
        weight_unit: 'kg',
        harvest_cost: 3200,
        storage_location: 'On-farm shaded packhouse — Ventilated plastic crates',
        batch_code: 'TOM-A1-PICK1',
        notes: 'First picking measured on calibrated platform scale (92 crates x 20 kg net).',
        is_demo: true,
        created_at: '2026-10-19T16:45:00Z',
        updated_at: '2026-10-19T16:45:00Z',
      },
      {
        id: '55555555-5555-4555-8555-555555555502',
        owner_id: ownerId,
        crop_cycle_id: c2Id,
        harvest_date: '2026-10-12',
        measured_weight: 28.5,
        weight_unit: 'quintal',
        harvest_cost: 5500,
        storage_location: 'Niphad FPO Warehouse — Lot Bay 4',
        batch_code: 'SOY-A2-2026',
        notes: 'Combine threshed and weighed at FPO weighbridge (28.5 quintals = 2,850 kg).',
        is_demo: true,
        created_at: '2026-10-12T18:00:00Z',
        updated_at: '2026-10-12T18:00:00Z',
      },
    ],
    qualityAssessments: [
      {
        id: '66666666-6666-4666-8666-666666666601',
        owner_id: ownerId,
        crop_cycle_id: c1Id,
        harvest_id: h1Id,
        crop_name: 'Roma Tomato',
        assessment_date: '2026-10-19',
        image_label: 'Crate Sample #TOM-A1-PICK1 (Demo)',
        visible_ripeness:
          'Breaker to turning red stage across most visible fruits; 2 fruits show green shoulders',
        visible_defects:
          'Minor concentric growth crack near stem scar on 1 fruit; no visible rot or borer holes',
        color_uniformity: 'Mostly uniform red-orange commercial table coloration',
        surface_condition: 'Firm epidermis, clean skin, intact calyx on 70% of fruits',
        experimental_ai_summary:
          '[Experimental Unvalidated Output] Visual inspection suggests breaker-to-ripe plum tomatoes suitable for short-to-medium transit after sorting out the single growth-cracked fruit. Cannot assess internal Brix, pesticide residue, or shelf-life.',
        is_ai_generated: true,
        farmer_review_status: 'farmer_verified',
        farmer_final_grade: 'Grade A (Market Prime)',
        farmer_notes:
          'Sorted out 18 kg of cracked fruit for local sale; remaining 1,822 kg packed as Grade A.',
        is_demo: true,
        created_at: '2026-10-19T17:15:00Z',
        updated_at: '2026-10-19T17:30:00Z',
      },
      {
        id: '66666666-6666-4666-8666-666666666602',
        owner_id: ownerId,
        crop_cycle_id: c2Id,
        harvest_id: '55555555-5555-4555-8555-555555555502',
        crop_name: 'Soybean',
        assessment_date: '2026-10-13',
        image_label: 'Threshed Grain Tray Sample #SOY-A2 (Demo)',
        visible_ripeness: 'Fully mature yellow-buff seed coats; pods dry and dehiscent',
        visible_defects:
          'Small proportion of shriveled seeds and split cotyledons from threshing drum speed',
        color_uniformity: 'Consistent pale yellow seed coat with minimal purple stain',
        surface_condition: 'Dry exterior; requires mechanical sieve cleaning for pod chaff',
        experimental_ai_summary:
          '[Experimental Unvalidated Output] Visible grain sample shows mature soybean seeds with minor mechanical splits and chaff. Moisture percentage and oil content require physical meter/lab measurement.',
        is_ai_generated: true,
        farmer_review_status: 'pending_review',
        farmer_final_grade: null,
        farmer_notes: 'Awaiting moisture meter reading at FPO center before confirming grade.',
        is_demo: true,
        created_at: '2026-10-13T11:00:00Z',
        updated_at: '2026-10-13T11:00:00Z',
      },
    ],
    marketEntries: [
      {
        id: '77777777-7777-4777-8777-777777777701',
        owner_id: ownerId,
        entry_type: 'sourced_price',
        crop_name: 'Roma Tomato',
        market_name: 'Pimpalgaon Baswant APMC Mandi',
        region: 'Nashik, Maharashtra',
        recorded_date: '2026-10-21',
        price_per_unit: 2350,
        price_unit: 'INR/quintal',
        source_citation: 'Agmarknet Daily Bulletin — Pimpalgaon APMC Modal Price (21 Oct 2026)',
        buyer_organization: null,
        buyer_contact_info: null,
        quality_requirements: 'Firm breaker-red, 20 kg crate packing, zero borer damage',
        notes: 'Historical sourced reference record (Demo). Not a live price feed.',
        is_demo: true,
        created_at: '2026-10-21T18:00:00Z',
      },
      {
        id: '77777777-7777-4777-8777-777777777702',
        owner_id: ownerId,
        entry_type: 'sourced_price',
        crop_name: 'Soybean',
        market_name: 'Lasalgaon APMC Grain Yard',
        region: 'Nashik, Maharashtra',
        recorded_date: '2026-10-18',
        price_per_unit: 4680,
        price_unit: 'INR/quintal',
        source_citation: 'MSAMB Mandi Arrival & Modal Price Register (18 Oct 2026)',
        buyer_organization: null,
        buyer_contact_info: null,
        quality_requirements: 'Moisture <= 12%, foreign matter <= 2%, damaged seed <= 3%',
        notes: 'Sourced auction benchmark record (Demo).',
        is_demo: true,
        created_at: '2026-10-18T18:00:00Z',
      },
      {
        id: '77777777-7777-4777-8777-777777777703',
        owner_id: ownerId,
        entry_type: 'buyer_contact',
        crop_name: 'Roma Tomato & Vegetables',
        market_name: 'Sahyadri Farmers Producer Co. Collection Center',
        region: 'Mohadi, Nashik',
        recorded_date: '2026-10-01',
        price_per_unit: null,
        price_unit: 'INR/quintal',
        source_citation: 'FPO Member Procurement Handbook 2026 (Farmer-Entered Directory)',
        buyer_organization: 'Sahyadri FPO Packhouse Intake Desk (Demo Entry)',
        buyer_contact_info:
          'Intake Desk Gate #2, Mohadi Road (Verify current intake schedule before dispatch)',
        quality_requirements: 'Residue-free logbook required, uniform crate grading',
        notes: 'Directory template entry. Does not represent a guaranteed purchase commitment.',
        is_demo: true,
        created_at: '2026-10-01T10:00:00Z',
      },
    ],
  };
}

function getWorkspace(ownerId: string): InMemoryWorkspace {
  let ws = memoryStoreByOwner.get(ownerId);
  if (!ws) {
    ws = createInitialDemoWorkspace(ownerId);
    memoryStoreByOwner.set(ownerId, ws);
  }
  return ws;
}

const seedPromises = new Map<string, Promise<void>>();

async function ensureDemoSeedInPostgres(ownerId: string): Promise<void> {
  if (ownerId !== 'owner-kisan-cooperative-01') {
    return;
  }
  const existing = seedPromises.get(ownerId);
  if (existing) {
    await existing;
    return;
  }
  const promise = (async () => {
    const dbPool = getPool();
    if (!dbPool) return;

    const countRes = await dbPool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM public.farms WHERE owner_id = $1`,
      [ownerId]
    );
    if ((countRes.rows[0]?.cnt ?? 0) > 0) {
      return;
    }

  const demo = createInitialDemoWorkspace(ownerId);
  for (const f of demo.farms) {
    await dbPool.query(
      `INSERT INTO public.farms (id, owner_id, name, location, total_area_acres, soil_summary, water_source, notes, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [f.id, ownerId, f.name, f.location, f.total_area_acres, f.soil_summary, f.water_source, f.notes, f.created_at, f.updated_at]
    );
  }
  for (const p of demo.plots) {
    await dbPool.query(
      `INSERT INTO public.plots (id, owner_id, farm_id, name, area_acres, soil_type, soil_ph, irrigation_type, location_coordinates, notes, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, ownerId, p.farm_id, p.name, p.area_acres, p.soil_type, p.soil_ph, p.irrigation_type, p.location_coordinates, p.notes, p.created_at, p.updated_at]
    );
  }
  for (const c of demo.cropCycles) {
    await dbPool.query(
      `INSERT INTO public.crop_cycles (id, owner_id, farm_id, plot_id, crop_name, seed_variety, seed_source, sowing_date, expected_harvest_date, soil_details, location_detail, status, current_stage, seed_cost, notes, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE, $16, $17)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, ownerId, c.farm_id, c.plot_id, c.crop_name, c.seed_variety, c.seed_source, c.sowing_date, c.expected_harvest_date, c.soil_details, c.location_detail, c.status, c.current_stage, c.seed_cost, c.notes, c.created_at, c.updated_at]
    );
  }
  for (const ev of demo.cultivationEvents) {
    await dbPool.query(
      `INSERT INTO public.cultivation_events (id, owner_id, crop_cycle_id, event_date, activity_type, crop_stage, description, inputs_applied, cost_amount, observations, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [ev.id, ownerId, ev.crop_cycle_id, ev.event_date, ev.activity_type, ev.crop_stage, ev.description, ev.inputs_applied, ev.cost_amount, ev.observations, ev.created_at, ev.updated_at]
    );
  }
  for (const h of demo.harvests) {
    await dbPool.query(
      `INSERT INTO public.harvests (id, owner_id, crop_cycle_id, harvest_date, measured_weight, weight_unit, harvest_cost, storage_location, batch_code, notes, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [h.id, ownerId, h.crop_cycle_id, h.harvest_date, h.measured_weight, h.weight_unit, h.harvest_cost, h.storage_location, h.batch_code, h.notes, h.created_at, h.updated_at]
    );
  }
  for (const qa of demo.qualityAssessments) {
    await dbPool.query(
      `INSERT INTO public.quality_assessments (id, owner_id, crop_cycle_id, harvest_id, crop_name, assessment_date, image_label, visible_ripeness, visible_defects, color_uniformity, surface_condition, experimental_ai_summary, is_ai_generated, farmer_review_status, farmer_final_grade, farmer_notes, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE, $17, $18)
       ON CONFLICT (id) DO NOTHING`,
      [qa.id, ownerId, qa.crop_cycle_id, qa.harvest_id, qa.crop_name, qa.assessment_date, qa.image_label, qa.visible_ripeness, qa.visible_defects, qa.color_uniformity, qa.surface_condition, qa.experimental_ai_summary, qa.is_ai_generated, qa.farmer_review_status, qa.farmer_final_grade, qa.farmer_notes, qa.created_at, qa.updated_at]
    );
  }
  for (const m of demo.marketEntries) {
    await dbPool.query(
      `INSERT INTO public.market_entries (id, owner_id, entry_type, crop_name, market_name, region, recorded_date, price_per_unit, price_unit, source_citation, buyer_organization, buyer_contact_info, quality_requirements, notes, is_demo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, $15)
       ON CONFLICT (id) DO NOTHING`,
      [m.id, ownerId, m.entry_type, m.crop_name, m.market_name, m.region, m.recorded_date, m.price_per_unit, m.price_unit, m.source_citation, m.buyer_organization, m.buyer_contact_info, m.quality_requirements, m.notes, m.created_at]
    );
  }
  })();
  seedPromises.set(ownerId, promise);
  await promise;
}

/**
 * Determines whether to execute against PostgreSQL or the explicit in-memory demo store.
 * CRITICAL HONESTY RULE:
 * - If DATABASE_URL IS configured, we ALWAYS use PostgreSQL and let any connection or
 *   missing-table error surface honestly so we never claim a database operation succeeded
 *   when it actually failed.
 * - Before querying tables, we verify the schema and apply migrations/001_initial_schema.sql
 *   non-destructively if connected to a fresh database.
 * - Only when DATABASE_URL is NOT configured do we use the labelled in-memory demo store.
 */
async function requirePostgresOrDemoMode(ownerId?: string): Promise<'postgres' | 'demo'> {
  if (!isDatabaseUrlConfigured()) {
    return 'demo';
  }
  if (!cachedSchemaVerified || !cachedRlsVerified) {
    let status = await checkDatabaseHealth();
    if (!status.connected) {
      throw new Error(status.message);
    }
    if (!status.schema_verified || !status.rls_verified) {
      const migResult = await applySafeMigrationIfConnected();
      status = migResult.status;
    }
    if (!status.schema_verified) {
      throw new Error(status.message);
    }
  }
  if (ownerId) {
    await ensureDemoSeedInPostgres(ownerId);
  }
  return 'postgres';
}

/**
 * Executes a callback inside a PostgreSQL transaction scoped to the `authenticated` role
 * (`rolbypassrls = false`) with `request.jwt.claim.sub` and `request.jwt.claims` bound to
 * the verified `ownerId`. This ensures PostgreSQL Row-Level Security (RLS) is actively
 * enforced on every query in addition to application-level parameterized `WHERE owner_id` filters.
 */
export async function withRlsClient<T>(
  ownerId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('PostgreSQL pool is not configured.');
  }
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(
      `SELECT
         set_config('request.jwt.claim.sub', $1, true),
         set_config('request.jwt.claims', json_build_object('sub', $1, 'role', 'authenticated')::text, true)`,
      [ownerId]
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function numOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

function dateStr(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

export class ParentOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParentOwnershipError';
  }
}

async function assertParentOwnership(
  ownerId: string,
  checks: {
    farmId?: string | null;
    plotId?: string | null;
    cropCycleId?: string | null;
    harvestId?: string | null;
  },
  client?: pg.PoolClient
): Promise<void> {
  const queryable = client || getPool();
  if (!queryable) {
    // Enforce parent ownership in fallback demo workspace as well
    const ws = getWorkspace(ownerId);
    if (checks.farmId && !ws.farms.some((f) => f.id === checks.farmId)) {
      throw new ParentOwnershipError('Referenced farm does not exist for current owner scope.');
    }
    if (checks.plotId) {
      const plot = ws.plots.find((p) => p.id === checks.plotId);
      if (!plot) {
        throw new ParentOwnershipError('Referenced plot does not exist for current owner scope.');
      }
      if (checks.farmId && plot.farm_id !== checks.farmId) {
        throw new ParentOwnershipError('Referenced plot does not belong to the specified farm.');
      }
    }
    if (checks.cropCycleId && !ws.cropCycles.some((c) => c.id === checks.cropCycleId)) {
      throw new ParentOwnershipError('Referenced crop cycle does not exist for current owner scope.');
    }
    if (checks.harvestId) {
      const harvest = ws.harvests.find((h) => h.id === checks.harvestId);
      if (!harvest) {
        throw new ParentOwnershipError('Referenced harvest record does not exist for current owner scope.');
      }
      if (checks.cropCycleId && harvest.crop_cycle_id !== checks.cropCycleId) {
        throw new ParentOwnershipError('Referenced harvest record does not belong to the specified crop cycle.');
      }
    }
    return;
  }

  if (checks.farmId) {
    const res = await queryable.query(
      `SELECT id FROM public.farms WHERE id = $1 AND owner_id = $2`,
      [checks.farmId, ownerId]
    );
    if (res.rowCount === 0) {
      throw new ParentOwnershipError('Referenced farm does not exist for current owner scope.');
    }
  }

  if (checks.plotId) {
    const res = await queryable.query(
      `SELECT id, farm_id FROM public.plots WHERE id = $1 AND owner_id = $2`,
      [checks.plotId, ownerId]
    );
    if (res.rowCount === 0) {
      throw new ParentOwnershipError('Referenced plot does not exist for current owner scope.');
    }
    if (checks.farmId && res.rows[0].farm_id !== checks.farmId) {
      throw new ParentOwnershipError('Referenced plot does not belong to the specified farm.');
    }
  }

  if (checks.cropCycleId) {
    const res = await queryable.query(
      `SELECT id FROM public.crop_cycles WHERE id = $1 AND owner_id = $2`,
      [checks.cropCycleId, ownerId]
    );
    if (res.rowCount === 0) {
      throw new ParentOwnershipError('Referenced crop cycle does not exist for current owner scope.');
    }
  }

  if (checks.harvestId) {
    const res = await queryable.query(
      `SELECT id, crop_cycle_id FROM public.harvests WHERE id = $1 AND owner_id = $2`,
      [checks.harvestId, ownerId]
    );
    if (res.rowCount === 0) {
      throw new ParentOwnershipError('Referenced harvest record does not exist for current owner scope.');
    }
    if (checks.cropCycleId && res.rows[0].crop_cycle_id !== checks.cropCycleId) {
      throw new ParentOwnershipError('Referenced harvest record does not belong to the specified crop cycle.');
    }
  }
}

// ============================================================================
// REPOSITORY OPERATIONS (Parameterized PostgreSQL + Honest Demo Mode)
// ============================================================================

export async function listFarms(ownerId: string): Promise<Farm[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, name, location, total_area_acres, soil_summary, water_source, notes, is_demo, created_at, updated_at
         FROM public.farms
         WHERE owner_id = $1
         ORDER BY created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        total_area_acres: numOrNull(r.total_area_acres),
      }));
    });
  }
  return getWorkspace(ownerId).farms;
}

export async function createFarm(ownerId: string, input: FarmInput): Promise<Farm> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `INSERT INTO public.farms (owner_id, name, location, total_area_acres, soil_summary, water_source, notes, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
         RETURNING id, owner_id, name, location, total_area_acres, soil_summary, water_source, notes, is_demo, created_at, updated_at`,
        [
          ownerId,
          input.name,
          input.location,
          input.total_area_acres,
          input.soil_summary,
          input.water_source,
          input.notes,
        ]
      );
      const r = res.rows[0];
      return { ...r, total_area_acres: numOrNull(r.total_area_acres) };
    });
  }
  const now = new Date().toISOString();
  const created: Farm = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: now,
    updated_at: now,
  };
  getWorkspace(ownerId).farms.unshift(created);
  return created;
}

export async function updateFarm(
  ownerId: string,
  farmId: string,
  input: FarmInput
): Promise<Farm | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `UPDATE public.farms
         SET name = $3,
             location = $4,
             total_area_acres = $5,
             soil_summary = $6,
             water_source = $7,
             notes = $8,
             is_demo = FALSE,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, name, location, total_area_acres, soil_summary, water_source, notes, is_demo, created_at, updated_at`,
        [
          farmId,
          ownerId,
          input.name,
          input.location,
          input.total_area_acres,
          input.soil_summary,
          input.water_source,
          input.notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return { ...r, total_area_acres: numOrNull(r.total_area_acres) };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.farms.findIndex((f) => f.id === farmId);
  if (idx === -1) return null;
  const updated: Farm = {
    ...ws.farms[idx],
    ...input,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
  ws.farms[idx] = updated;
  return updated;
}

export async function deleteFarm(ownerId: string, farmId: string): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.farms WHERE id = $1 AND owner_id = $2`,
        [farmId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.farms.length;
  ws.farms = ws.farms.filter((f) => f.id !== farmId);
  if (ws.farms.length === before) return false;
  const deletedCycleIds = new Set(
    ws.cropCycles.filter((c) => c.farm_id === farmId).map((c) => c.id)
  );
  ws.plots = ws.plots.filter((p) => p.farm_id !== farmId);
  ws.cropCycles = ws.cropCycles.filter((c) => c.farm_id !== farmId);
  ws.cultivationEvents = ws.cultivationEvents.filter((e) => !deletedCycleIds.has(e.crop_cycle_id));
  ws.harvests = ws.harvests.filter((h) => !deletedCycleIds.has(h.crop_cycle_id));
  return true;
}

// --- Plots ---
export async function listPlots(ownerId: string): Promise<Plot[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, farm_id, name, area_acres, soil_type, soil_ph, irrigation_type, location_coordinates, notes, is_demo, created_at, updated_at
         FROM public.plots
         WHERE owner_id = $1
         ORDER BY created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        area_acres: Number(r.area_acres),
        soil_ph: numOrNull(r.soil_ph),
      }));
    });
  }
  return getWorkspace(ownerId).plots;
}

export async function createPlot(ownerId: string, input: PlotInput): Promise<Plot> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      await assertParentOwnership(ownerId, { farmId: input.farm_id }, client);
      const res = await client.query(
        `INSERT INTO public.plots (owner_id, farm_id, name, area_acres, soil_type, soil_ph, irrigation_type, location_coordinates, notes, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
         RETURNING id, owner_id, farm_id, name, area_acres, soil_type, soil_ph, irrigation_type, location_coordinates, notes, is_demo, created_at, updated_at`,
        [
          ownerId,
          input.farm_id,
          input.name,
          input.area_acres,
          input.soil_type,
          input.soil_ph,
          input.irrigation_type,
          input.location_coordinates,
          input.notes,
        ]
      );
      const r = res.rows[0];
      return {
        ...r,
        area_acres: Number(r.area_acres),
        soil_ph: numOrNull(r.soil_ph),
      };
    });
  }
  await assertParentOwnership(ownerId, { farmId: input.farm_id });
  const now = new Date().toISOString();
  const created: Plot = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: now,
    updated_at: now,
  };
  getWorkspace(ownerId).plots.unshift(created);
  return created;
}

export async function updatePlot(
  ownerId: string,
  plotId: string,
  input: PlotInput
): Promise<Plot | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM public.plots WHERE id = $1 AND owner_id = $2`,
        [plotId, ownerId]
      );
      if (existing.rowCount === 0) return null;

      await assertParentOwnership(ownerId, { farmId: input.farm_id }, client);
      const res = await client.query(
        `UPDATE public.plots
         SET farm_id = $3,
             name = $4,
             area_acres = $5,
             soil_type = $6,
             soil_ph = $7,
             irrigation_type = $8,
             location_coordinates = $9,
             notes = $10,
             is_demo = FALSE,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, farm_id, name, area_acres, soil_type, soil_ph, irrigation_type, location_coordinates, notes, is_demo, created_at, updated_at`,
        [
          plotId,
          ownerId,
          input.farm_id,
          input.name,
          input.area_acres,
          input.soil_type,
          input.soil_ph,
          input.irrigation_type,
          input.location_coordinates,
          input.notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        area_acres: Number(r.area_acres),
        soil_ph: numOrNull(r.soil_ph),
      };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.plots.findIndex((p) => p.id === plotId);
  if (idx === -1) return null;
  await assertParentOwnership(ownerId, { farmId: input.farm_id });
  const updated: Plot = {
    ...ws.plots[idx],
    ...input,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
  ws.plots[idx] = updated;
  return updated;
}

export async function deletePlot(ownerId: string, plotId: string): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.plots WHERE id = $1 AND owner_id = $2`,
        [plotId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.plots.length;
  ws.plots = ws.plots.filter((p) => p.id !== plotId);
  if (ws.plots.length === before) return false;
  const deletedCycleIds = new Set(
    ws.cropCycles.filter((c) => c.plot_id === plotId).map((c) => c.id)
  );
  ws.cropCycles = ws.cropCycles.filter((c) => c.plot_id !== plotId);
  ws.cultivationEvents = ws.cultivationEvents.filter((e) => !deletedCycleIds.has(e.crop_cycle_id));
  ws.harvests = ws.harvests.filter((h) => !deletedCycleIds.has(h.crop_cycle_id));
  return true;
}

// --- Crop Cycles ---
export async function listCropCycles(ownerId: string): Promise<CropCycle[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, farm_id, plot_id, crop_name, seed_variety, seed_source, sowing_date, expected_harvest_date, soil_details, location_detail, status, current_stage, seed_cost, notes, is_demo, created_at, updated_at
         FROM public.crop_cycles
         WHERE owner_id = $1
         ORDER BY sowing_date DESC, created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        sowing_date: dateStr(r.sowing_date),
        expected_harvest_date: r.expected_harvest_date ? dateStr(r.expected_harvest_date) : null,
        seed_cost: numOrNull(r.seed_cost),
      }));
    });
  }
  return getWorkspace(ownerId).cropCycles;
}

export async function createCropCycle(ownerId: string, input: CropCycleInput): Promise<CropCycle> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      await assertParentOwnership(
        ownerId,
        {
          farmId: input.farm_id,
          plotId: input.plot_id,
        },
        client
      );
      const res = await client.query(
        `INSERT INTO public.crop_cycles (owner_id, farm_id, plot_id, crop_name, seed_variety, seed_source, sowing_date, expected_harvest_date, soil_details, location_detail, status, current_stage, seed_cost, notes, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, FALSE)
         RETURNING id, owner_id, farm_id, plot_id, crop_name, seed_variety, seed_source, sowing_date, expected_harvest_date, soil_details, location_detail, status, current_stage, seed_cost, notes, is_demo, created_at, updated_at`,
        [
          ownerId,
          input.farm_id,
          input.plot_id,
          input.crop_name,
          input.seed_variety,
          input.seed_source,
          input.sowing_date,
          input.expected_harvest_date,
          input.soil_details,
          input.location_detail,
          input.status,
          input.current_stage,
          input.seed_cost,
          input.notes,
        ]
      );
      const r = res.rows[0];
      return {
        ...r,
        sowing_date: dateStr(r.sowing_date),
        expected_harvest_date: r.expected_harvest_date ? dateStr(r.expected_harvest_date) : null,
        seed_cost: numOrNull(r.seed_cost),
      };
    });
  }
  await assertParentOwnership(ownerId, {
    farmId: input.farm_id,
    plotId: input.plot_id,
  });
  const now = new Date().toISOString();
  const created: CropCycle = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: now,
    updated_at: now,
  };
  getWorkspace(ownerId).cropCycles.unshift(created);
  return created;
}

export async function updateCropCycle(
  ownerId: string,
  cycleId: string,
  input: CropCycleInput
): Promise<CropCycle | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM public.crop_cycles WHERE id = $1 AND owner_id = $2`,
        [cycleId, ownerId]
      );
      if (existing.rowCount === 0) return null;

      await assertParentOwnership(
        ownerId,
        {
          farmId: input.farm_id,
          plotId: input.plot_id,
        },
        client
      );
      const res = await client.query(
        `UPDATE public.crop_cycles
         SET farm_id = $3,
             plot_id = $4,
             crop_name = $5,
             seed_variety = $6,
             seed_source = $7,
             sowing_date = $8,
             expected_harvest_date = $9,
             soil_details = $10,
             location_detail = $11,
             status = $12,
             current_stage = $13,
             seed_cost = $14,
             notes = $15,
             is_demo = FALSE,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, farm_id, plot_id, crop_name, seed_variety, seed_source, sowing_date, expected_harvest_date, soil_details, location_detail, status, current_stage, seed_cost, notes, is_demo, created_at, updated_at`,
        [
          cycleId,
          ownerId,
          input.farm_id,
          input.plot_id,
          input.crop_name,
          input.seed_variety,
          input.seed_source,
          input.sowing_date,
          input.expected_harvest_date,
          input.soil_details,
          input.location_detail,
          input.status,
          input.current_stage,
          input.seed_cost,
          input.notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        sowing_date: dateStr(r.sowing_date),
        expected_harvest_date: r.expected_harvest_date ? dateStr(r.expected_harvest_date) : null,
        seed_cost: numOrNull(r.seed_cost),
      };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.cropCycles.findIndex((c) => c.id === cycleId);
  if (idx === -1) return null;
  await assertParentOwnership(ownerId, {
    farmId: input.farm_id,
    plotId: input.plot_id,
  });
  const updated: CropCycle = {
    ...ws.cropCycles[idx],
    ...input,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
  ws.cropCycles[idx] = updated;
  return updated;
}

export async function deleteCropCycle(ownerId: string, cycleId: string): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.crop_cycles WHERE id = $1 AND owner_id = $2`,
        [cycleId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.cropCycles.length;
  ws.cropCycles = ws.cropCycles.filter((c) => c.id !== cycleId);
  if (ws.cropCycles.length === before) return false;
  ws.cultivationEvents = ws.cultivationEvents.filter((e) => e.crop_cycle_id !== cycleId);
  ws.harvests = ws.harvests.filter((h) => h.crop_cycle_id !== cycleId);
  return true;
}

// --- Cultivation Events ---
export async function listCultivationEvents(ownerId: string): Promise<CultivationEvent[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, crop_cycle_id, event_date, activity_type, crop_stage, description, inputs_applied, cost_amount, observations, is_demo, created_at, updated_at
         FROM public.cultivation_events
         WHERE owner_id = $1
         ORDER BY event_date DESC, created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        event_date: dateStr(r.event_date),
        cost_amount: numOrNull(r.cost_amount),
      }));
    });
  }
  return getWorkspace(ownerId).cultivationEvents;
}

export async function createCultivationEvent(
  ownerId: string,
  input: CultivationEventInput
): Promise<CultivationEvent> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id }, client);
      const res = await client.query(
        `INSERT INTO public.cultivation_events (owner_id, crop_cycle_id, event_date, activity_type, crop_stage, description, inputs_applied, cost_amount, observations, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
         RETURNING id, owner_id, crop_cycle_id, event_date, activity_type, crop_stage, description, inputs_applied, cost_amount, observations, is_demo, created_at, updated_at`,
        [
          ownerId,
          input.crop_cycle_id,
          input.event_date,
          input.activity_type,
          input.crop_stage,
          input.description,
          input.inputs_applied,
          input.cost_amount,
          input.observations,
        ]
      );
      await client.query(
        `UPDATE public.crop_cycles SET current_stage = $3, updated_at = NOW() WHERE id = $1 AND owner_id = $2`,
        [input.crop_cycle_id, ownerId, input.crop_stage]
      );
      const r = res.rows[0];
      return {
        ...r,
        event_date: dateStr(r.event_date),
        cost_amount: numOrNull(r.cost_amount),
      };
    });
  }
  await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id });
  const now = new Date().toISOString();
  const created: CultivationEvent = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: now,
    updated_at: now,
  };
  const ws = getWorkspace(ownerId);
  ws.cultivationEvents.unshift(created);
  const cycle = ws.cropCycles.find((c) => c.id === input.crop_cycle_id);
  if (cycle) {
    cycle.current_stage = input.crop_stage;
    cycle.updated_at = now;
  }
  return created;
}

export async function updateCultivationEvent(
  ownerId: string,
  eventId: string,
  input: CultivationEventInput
): Promise<CultivationEvent | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM public.cultivation_events WHERE id = $1 AND owner_id = $2`,
        [eventId, ownerId]
      );
      if (existing.rowCount === 0) return null;

      await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id }, client);
      const res = await client.query(
        `UPDATE public.cultivation_events
         SET crop_cycle_id = $3,
             event_date = $4,
             activity_type = $5,
             crop_stage = $6,
             description = $7,
             inputs_applied = $8,
             cost_amount = $9,
             observations = $10,
             is_demo = FALSE,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, crop_cycle_id, event_date, activity_type, crop_stage, description, inputs_applied, cost_amount, observations, is_demo, created_at, updated_at`,
        [
          eventId,
          ownerId,
          input.crop_cycle_id,
          input.event_date,
          input.activity_type,
          input.crop_stage,
          input.description,
          input.inputs_applied,
          input.cost_amount,
          input.observations,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        event_date: dateStr(r.event_date),
        cost_amount: numOrNull(r.cost_amount),
      };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.cultivationEvents.findIndex((e) => e.id === eventId);
  if (idx === -1) return null;
  await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id });
  const updated: CultivationEvent = {
    ...ws.cultivationEvents[idx],
    ...input,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
  ws.cultivationEvents[idx] = updated;
  return updated;
}

export async function deleteCultivationEvent(ownerId: string, eventId: string): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.cultivation_events WHERE id = $1 AND owner_id = $2`,
        [eventId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.cultivationEvents.length;
  ws.cultivationEvents = ws.cultivationEvents.filter((e) => e.id !== eventId);
  return ws.cultivationEvents.length < before;
}

// --- Harvests ---
export async function listHarvests(ownerId: string): Promise<Harvest[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, crop_cycle_id, harvest_date, measured_weight, weight_unit, harvest_cost, storage_location, batch_code, notes, is_demo, created_at, updated_at
         FROM public.harvests
         WHERE owner_id = $1
         ORDER BY harvest_date DESC, created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        harvest_date: dateStr(r.harvest_date),
        measured_weight: Number(r.measured_weight),
        harvest_cost: numOrNull(r.harvest_cost),
      }));
    });
  }
  return getWorkspace(ownerId).harvests;
}

export async function createHarvest(ownerId: string, input: HarvestInput): Promise<Harvest> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id }, client);
      const res = await client.query(
        `INSERT INTO public.harvests (owner_id, crop_cycle_id, harvest_date, measured_weight, weight_unit, harvest_cost, storage_location, batch_code, notes, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
         RETURNING id, owner_id, crop_cycle_id, harvest_date, measured_weight, weight_unit, harvest_cost, storage_location, batch_code, notes, is_demo, created_at, updated_at`,
        [
          ownerId,
          input.crop_cycle_id,
          input.harvest_date,
          input.measured_weight,
          input.weight_unit,
          input.harvest_cost,
          input.storage_location,
          input.batch_code,
          input.notes,
        ]
      );
      const r = res.rows[0];
      return {
        ...r,
        harvest_date: dateStr(r.harvest_date),
        measured_weight: Number(r.measured_weight),
        harvest_cost: numOrNull(r.harvest_cost),
      };
    });
  }
  await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id });
  const now = new Date().toISOString();
  const created: Harvest = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: now,
    updated_at: now,
  };
  getWorkspace(ownerId).harvests.unshift(created);
  return created;
}

export async function updateHarvest(
  ownerId: string,
  harvestId: string,
  input: HarvestInput
): Promise<Harvest | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM public.harvests WHERE id = $1 AND owner_id = $2`,
        [harvestId, ownerId]
      );
      if (existing.rowCount === 0) return null;

      await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id }, client);
      const res = await client.query(
        `UPDATE public.harvests
         SET crop_cycle_id = $3,
             harvest_date = $4,
             measured_weight = $5,
             weight_unit = $6,
             harvest_cost = $7,
             storage_location = $8,
             batch_code = $9,
             notes = $10,
             is_demo = FALSE,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, crop_cycle_id, harvest_date, measured_weight, weight_unit, harvest_cost, storage_location, batch_code, notes, is_demo, created_at, updated_at`,
        [
          harvestId,
          ownerId,
          input.crop_cycle_id,
          input.harvest_date,
          input.measured_weight,
          input.weight_unit,
          input.harvest_cost,
          input.storage_location,
          input.batch_code,
          input.notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        harvest_date: dateStr(r.harvest_date),
        measured_weight: Number(r.measured_weight),
        harvest_cost: numOrNull(r.harvest_cost),
      };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.harvests.findIndex((h) => h.id === harvestId);
  if (idx === -1) return null;
  await assertParentOwnership(ownerId, { cropCycleId: input.crop_cycle_id });
  const updated: Harvest = {
    ...ws.harvests[idx],
    ...input,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
  ws.harvests[idx] = updated;
  return updated;
}

export async function deleteHarvest(ownerId: string, harvestId: string): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.harvests WHERE id = $1 AND owner_id = $2`,
        [harvestId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.harvests.length;
  ws.harvests = ws.harvests.filter((h) => h.id !== harvestId);
  return ws.harvests.length < before;
}

// --- Quality Assessments ---
export async function listQualityAssessments(ownerId: string): Promise<QualityAssessment[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, crop_cycle_id, harvest_id, crop_name, assessment_date, image_label, visible_ripeness, visible_defects, color_uniformity, surface_condition, experimental_ai_summary, is_ai_generated, farmer_review_status, farmer_final_grade, farmer_notes, is_demo, created_at, updated_at
         FROM public.quality_assessments
         WHERE owner_id = $1
         ORDER BY assessment_date DESC, created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        assessment_date: dateStr(r.assessment_date),
      }));
    });
  }
  return getWorkspace(ownerId).qualityAssessments;
}

export async function createQualityAssessment(
  ownerId: string,
  input: QualityAssessmentInput
): Promise<QualityAssessment> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      await assertParentOwnership(
        ownerId,
        {
          cropCycleId: input.crop_cycle_id,
          harvestId: input.harvest_id,
        },
        client
      );
      const res = await client.query(
        `INSERT INTO public.quality_assessments (
           owner_id, crop_cycle_id, harvest_id, crop_name, assessment_date, image_label,
           visible_ripeness, visible_defects, color_uniformity, surface_condition,
           experimental_ai_summary, is_ai_generated, farmer_review_status, farmer_final_grade, farmer_notes, is_demo
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, FALSE)
         RETURNING id, owner_id, crop_cycle_id, harvest_id, crop_name, assessment_date, image_label, visible_ripeness, visible_defects, color_uniformity, surface_condition, experimental_ai_summary, is_ai_generated, farmer_review_status, farmer_final_grade, farmer_notes, is_demo, created_at, updated_at`,
        [
          ownerId,
          input.crop_cycle_id,
          input.harvest_id,
          input.crop_name,
          input.assessment_date,
          input.image_label,
          input.visible_ripeness,
          input.visible_defects,
          input.color_uniformity,
          input.surface_condition,
          input.experimental_ai_summary,
          input.is_ai_generated,
          input.farmer_review_status,
          input.farmer_final_grade,
          input.farmer_notes,
        ]
      );
      const r = res.rows[0];
      return {
        ...r,
        assessment_date: dateStr(r.assessment_date),
      };
    });
  }
  await assertParentOwnership(ownerId, {
    cropCycleId: input.crop_cycle_id,
    harvestId: input.harvest_id,
  });
  const now = new Date().toISOString();
  const created: QualityAssessment = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: now,
    updated_at: now,
  };
  getWorkspace(ownerId).qualityAssessments.unshift(created);
  return created;
}

export async function updateQualityAssessment(
  ownerId: string,
  assessmentId: string,
  input: QualityAssessmentInput
): Promise<QualityAssessment | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM public.quality_assessments WHERE id = $1 AND owner_id = $2`,
        [assessmentId, ownerId]
      );
      if (existing.rowCount === 0) return null;

      await assertParentOwnership(
        ownerId,
        {
          cropCycleId: input.crop_cycle_id,
          harvestId: input.harvest_id,
        },
        client
      );
      const res = await client.query(
        `UPDATE public.quality_assessments
         SET crop_cycle_id = $3,
             harvest_id = $4,
             crop_name = $5,
             assessment_date = $6,
             image_label = $7,
             visible_ripeness = $8,
             visible_defects = $9,
             color_uniformity = $10,
             surface_condition = $11,
             experimental_ai_summary = $12,
             is_ai_generated = $13,
             farmer_review_status = $14,
             farmer_final_grade = $15,
             farmer_notes = $16,
             is_demo = FALSE,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, crop_cycle_id, harvest_id, crop_name, assessment_date, image_label, visible_ripeness, visible_defects, color_uniformity, surface_condition, experimental_ai_summary, is_ai_generated, farmer_review_status, farmer_final_grade, farmer_notes, is_demo, created_at, updated_at`,
        [
          assessmentId,
          ownerId,
          input.crop_cycle_id,
          input.harvest_id,
          input.crop_name,
          input.assessment_date,
          input.image_label,
          input.visible_ripeness,
          input.visible_defects,
          input.color_uniformity,
          input.surface_condition,
          input.experimental_ai_summary,
          input.is_ai_generated,
          input.farmer_review_status,
          input.farmer_final_grade,
          input.farmer_notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return { ...r, assessment_date: dateStr(r.assessment_date) };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.qualityAssessments.findIndex((q) => q.id === assessmentId);
  if (idx === -1) return null;
  await assertParentOwnership(ownerId, {
    cropCycleId: input.crop_cycle_id,
    harvestId: input.harvest_id,
  });
  const updated: QualityAssessment = {
    ...ws.qualityAssessments[idx],
    ...input,
    is_demo: false,
    updated_at: new Date().toISOString(),
  };
  ws.qualityAssessments[idx] = updated;
  return updated;
}

export async function updateQualityAssessmentReview(
  ownerId: string,
  assessmentId: string,
  review: {
    farmer_review_status: QualityAssessment['farmer_review_status'];
    farmer_final_grade: QualityAssessment['farmer_final_grade'];
    farmer_notes: string | null;
  }
): Promise<QualityAssessment | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `UPDATE public.quality_assessments
         SET farmer_review_status = $3,
             farmer_final_grade = $4,
             farmer_notes = $5,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, crop_cycle_id, harvest_id, crop_name, assessment_date, image_label, visible_ripeness, visible_defects, color_uniformity, surface_condition, experimental_ai_summary, is_ai_generated, farmer_review_status, farmer_final_grade, farmer_notes, is_demo, created_at, updated_at`,
        [
          assessmentId,
          ownerId,
          review.farmer_review_status,
          review.farmer_final_grade,
          review.farmer_notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return { ...r, assessment_date: dateStr(r.assessment_date) };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.qualityAssessments.findIndex((q) => q.id === assessmentId);
  if (idx === -1) return null;
  const updated: QualityAssessment = {
    ...ws.qualityAssessments[idx],
    farmer_review_status: review.farmer_review_status,
    farmer_final_grade: review.farmer_final_grade,
    farmer_notes: review.farmer_notes,
    updated_at: new Date().toISOString(),
  };
  ws.qualityAssessments[idx] = updated;
  return updated;
}

export async function deleteQualityAssessment(
  ownerId: string,
  assessmentId: string
): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.quality_assessments WHERE id = $1 AND owner_id = $2`,
        [assessmentId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.qualityAssessments.length;
  ws.qualityAssessments = ws.qualityAssessments.filter((q) => q.id !== assessmentId);
  return ws.qualityAssessments.length < before;
}

// --- Market Entries ---
export async function listMarketEntries(ownerId: string): Promise<MarketEntry[]> {
  const mode = await requirePostgresOrDemoMode(ownerId);
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `SELECT id, owner_id, entry_type, crop_name, market_name, region, recorded_date, price_per_unit, price_unit, source_citation, buyer_organization, buyer_contact_info, quality_requirements, notes, is_demo, created_at
         FROM public.market_entries
         WHERE owner_id = $1
         ORDER BY recorded_date DESC, created_at DESC`,
        [ownerId]
      );
      return res.rows.map((r) => ({
        ...r,
        recorded_date: dateStr(r.recorded_date),
        price_per_unit: numOrNull(r.price_per_unit),
      }));
    });
  }
  return getWorkspace(ownerId).marketEntries;
}

export async function createMarketEntry(
  ownerId: string,
  input: MarketEntryInput
): Promise<MarketEntry> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `INSERT INTO public.market_entries (
           owner_id, entry_type, crop_name, market_name, region, recorded_date,
           price_per_unit, price_unit, source_citation, buyer_organization,
           buyer_contact_info, quality_requirements, notes, is_demo
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE)
         RETURNING id, owner_id, entry_type, crop_name, market_name, region, recorded_date, price_per_unit, price_unit, source_citation, buyer_organization, buyer_contact_info, quality_requirements, notes, is_demo, created_at`,
        [
          ownerId,
          input.entry_type,
          input.crop_name,
          input.market_name,
          input.region,
          input.recorded_date,
          input.price_per_unit,
          input.price_unit,
          input.source_citation,
          input.buyer_organization,
          input.buyer_contact_info,
          input.quality_requirements,
          input.notes,
        ]
      );
      const r = res.rows[0];
      return {
        ...r,
        recorded_date: dateStr(r.recorded_date),
        price_per_unit: numOrNull(r.price_per_unit),
      };
    });
  }
  const created: MarketEntry = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    ...input,
    is_demo: false,
    created_at: new Date().toISOString(),
  };
  getWorkspace(ownerId).marketEntries.unshift(created);
  return created;
}

export async function updateMarketEntry(
  ownerId: string,
  entryId: string,
  input: MarketEntryInput
): Promise<MarketEntry | null> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `UPDATE public.market_entries
         SET entry_type = $3,
             crop_name = $4,
             market_name = $5,
             region = $6,
             recorded_date = $7,
             price_per_unit = $8,
             price_unit = $9,
             source_citation = $10,
             buyer_organization = $11,
             buyer_contact_info = $12,
             quality_requirements = $13,
             notes = $14,
             is_demo = FALSE
         WHERE id = $1 AND owner_id = $2
         RETURNING id, owner_id, entry_type, crop_name, market_name, region, recorded_date, price_per_unit, price_unit, source_citation, buyer_organization, buyer_contact_info, quality_requirements, notes, is_demo, created_at`,
        [
          entryId,
          ownerId,
          input.entry_type,
          input.crop_name,
          input.market_name,
          input.region,
          input.recorded_date,
          input.price_per_unit,
          input.price_unit,
          input.source_citation,
          input.buyer_organization,
          input.buyer_contact_info,
          input.quality_requirements,
          input.notes,
        ]
      );
      if (res.rowCount === 0) return null;
      const r = res.rows[0];
      return {
        ...r,
        recorded_date: dateStr(r.recorded_date),
        price_per_unit: numOrNull(r.price_per_unit),
      };
    });
  }
  const ws = getWorkspace(ownerId);
  const idx = ws.marketEntries.findIndex((m) => m.id === entryId);
  if (idx === -1) return null;
  const updated: MarketEntry = {
    ...ws.marketEntries[idx],
    ...input,
    is_demo: false,
  };
  ws.marketEntries[idx] = updated;
  return updated;
}

export async function deleteMarketEntry(ownerId: string, entryId: string): Promise<boolean> {
  const mode = await requirePostgresOrDemoMode();
  if (mode === 'postgres') {
    return withRlsClient(ownerId, async (client) => {
      const res = await client.query(
        `DELETE FROM public.market_entries WHERE id = $1 AND owner_id = $2`,
        [entryId, ownerId]
      );
      return (res.rowCount ?? 0) > 0;
    });
  }
  const ws = getWorkspace(ownerId);
  const before = ws.marketEntries.length;
  ws.marketEntries = ws.marketEntries.filter((m) => m.id !== entryId);
  return ws.marketEntries.length < before;
}
