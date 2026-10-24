import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FarmInputSchema,
  PlotInputSchema,
  CropCycleInputSchema,
  CultivationEventInputSchema,
  HarvestInputSchema,
  QualityAssessmentInputSchema,
  MarketEntryInputSchema,
  buildFarmCycleReports,
  computeActionableAlerts,
  sanitizeOwnerId,
  normalizeWeightToKg,
} from './validation';

test('FarmInputSchema validates required fields and preserves null vs numeric area', () => {
  const valid = FarmInputSchema.parse({
    name: ' Sahyadri Terrace Farm ',
    location: 'Nashik, Maharashtra',
    total_area_acres: '14.5',
    soil_summary: '',
  });
  assert.equal(valid.name, 'Sahyadri Terrace Farm');
  assert.equal(valid.total_area_acres, 14.5);
  assert.equal(valid.soil_summary, null);

  const missingArea = FarmInputSchema.parse({
    name: 'Smallholder Plot',
    location: 'Pune',
    total_area_acres: null,
  });
  assert.equal(missingArea.total_area_acres, null);

  assert.throws(() => {
    FarmInputSchema.parse({
      name: '',
      location: 'Pune',
    });
  });
});

test('PlotInputSchema enforces positive area and valid pH range (0-14)', () => {
  const validPlot = PlotInputSchema.parse({
    farm_id: 'farm-1',
    name: 'Plot A1',
    area_acres: 3.25,
    soil_ph: '6.8',
  });
  assert.equal(validPlot.area_acres, 3.25);
  assert.equal(validPlot.soil_ph, 6.8);

  assert.throws(() => {
    PlotInputSchema.parse({
      farm_id: 'farm-1',
      name: 'Invalid pH Plot',
      area_acres: 2,
      soil_ph: 15.5,
    });
  });
});

test('CultivationEventInputSchema distinguishes null (missing) cost from 0 (zero cost)', () => {
  const zeroCostEvent = CultivationEventInputSchema.parse({
    crop_cycle_id: 'cycle-1',
    event_date: '2026-10-15',
    activity_type: 'observation',
    crop_stage: 'vegetative',
    description: 'Canopy inspection after rain; no paid inputs used',
    cost_amount: 0,
  });
  assert.strictEqual(zeroCostEvent.cost_amount, 0);

  const missingCostEvent = CultivationEventInputSchema.parse({
    crop_cycle_id: 'cycle-1',
    event_date: '2026-10-16',
    activity_type: 'irrigation',
    crop_stage: 'vegetative',
    description: 'Drip irrigation 3 hours (electricity bill pending)',
    cost_amount: '',
  });
  assert.strictEqual(missingCostEvent.cost_amount, null);
});

test('buildFarmCycleReports strictly distinguishes missing data (null) from zero values (0)', () => {
  const farms = [
    {
      id: 'f1',
      owner_id: 'owner-1',
      name: 'Green Valley',
      location: 'Nashik',
      total_area_acres: 10,
      soil_summary: null,
      water_source: null,
      notes: null,
      is_demo: false,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
  ];
  const plots = [
    {
      id: 'p1',
      owner_id: 'owner-1',
      farm_id: 'f1',
      name: 'Block North',
      area_acres: 4,
      soil_type: 'Loam',
      soil_ph: 6.5,
      irrigation_type: 'Drip',
      location_coordinates: null,
      notes: null,
      is_demo: false,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
  ];

  // Cycle 1: All costs missing (null), no harvests (null)
  // Cycle 2: Zero cost explicitly recorded (0), harvest of 0 kg recorded (crop failure)
  const cropCycles = [
    {
      id: 'c-missing',
      owner_id: 'owner-1',
      farm_id: 'f1',
      plot_id: 'p1',
      crop_name: 'Wheat',
      seed_variety: 'HD-2967',
      seed_source: null,
      sowing_date: '2026-10-01',
      expected_harvest_date: null,
      soil_details: null,
      location_detail: null,
      status: 'active' as const,
      current_stage: 'sowing' as const,
      seed_cost: null,
      notes: null,
      is_demo: false,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'c-zero',
      owner_id: 'owner-1',
      farm_id: 'f1',
      plot_id: 'p1',
      crop_name: 'Cover Clover',
      seed_variety: 'Farm Saved Seed',
      seed_source: 'Own',
      sowing_date: '2026-09-01',
      expected_harvest_date: '2026-10-20',
      soil_details: null,
      location_detail: null,
      status: 'harvested' as const,
      current_stage: 'post_harvest' as const,
      seed_cost: 0,
      notes: null,
      is_demo: false,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-10-20T00:00:00Z',
    },
  ];

  const cultivationEvents = [
    {
      id: 'e1',
      owner_id: 'owner-1',
      crop_cycle_id: 'c-missing',
      event_date: '2026-10-05',
      activity_type: 'irrigation' as const,
      crop_stage: 'germination' as const,
      description: 'Canal water release',
      inputs_applied: null,
      cost_amount: null,
      observations: null,
      is_demo: false,
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
    },
    {
      id: 'e2',
      owner_id: 'owner-1',
      crop_cycle_id: 'c-zero',
      event_date: '2026-09-10',
      activity_type: 'observation' as const,
      crop_stage: 'vegetative' as const,
      description: 'Manual family check',
      inputs_applied: null,
      cost_amount: 0,
      observations: null,
      is_demo: false,
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    },
  ];

  const harvests = [
    {
      id: 'h1',
      owner_id: 'owner-1',
      crop_cycle_id: 'c-zero',
      harvest_date: '2026-10-20',
      measured_weight: 0,
      weight_unit: 'kg' as const,
      harvest_cost: 0,
      storage_location: null,
      batch_code: null,
      notes: 'Mulched directly into soil; 0 kg commercial harvest',
      is_demo: false,
      created_at: '2026-10-20T00:00:00Z',
      updated_at: '2026-10-20T00:00:00Z',
    },
  ];

  const reports = buildFarmCycleReports({
    farms,
    plots,
    cropCycles,
    cultivationEvents,
    harvests,
    qualityAssessments: [],
  });

  const missingRow = reports.find((r) => r.crop_cycle_id === 'c-missing')!;
  assert.strictEqual(missingRow.seed_cost, null);
  assert.strictEqual(missingRow.cultivation_cost_known_total, null);
  assert.strictEqual(missingRow.total_known_cost, null);
  assert.strictEqual(missingRow.total_measured_weight_kg, null);
  assert.strictEqual(missingRow.has_incomplete_cost_data, true);

  const zeroRow = reports.find((r) => r.crop_cycle_id === 'c-zero')!;
  assert.strictEqual(zeroRow.seed_cost, 0);
  assert.strictEqual(zeroRow.cultivation_cost_known_total, 0);
  assert.strictEqual(zeroRow.total_known_cost, 0);
  assert.strictEqual(zeroRow.total_measured_weight_kg, 0);
  assert.strictEqual(zeroRow.has_incomplete_cost_data, false);
});

test('computeActionableAlerts flags unreviewed quality assessments and approaching harvests', () => {
  const alerts = computeActionableAlerts({
    cropCycles: [
      {
        id: 'c1',
        owner_id: 'owner-1',
        farm_id: 'f1',
        plot_id: 'p1',
        crop_name: 'Roma Tomato',
        seed_variety: null,
        seed_source: null,
        sowing_date: '2026-07-15',
        expected_harvest_date: '2026-10-25',
        soil_details: null,
        location_detail: null,
        status: 'active',
        current_stage: 'harvest_ready',
        seed_cost: 1200,
        notes: null,
        is_demo: false,
        created_at: '2026-07-15T00:00:00Z',
        updated_at: '2026-07-15T00:00:00Z',
      },
    ],
    cultivationEvents: [],
    harvests: [],
    qualityAssessments: [
      {
        id: 'q1',
        owner_id: 'owner-1',
        crop_cycle_id: 'c1',
        harvest_id: null,
        crop_name: 'Roma Tomato',
        assessment_date: '2026-10-23',
        image_label: 'Sample 1',
        visible_ripeness: '85% red coloration',
        visible_defects: 'Minor calyx splitting on 1 fruit',
        color_uniformity: 'High',
        surface_condition: 'Firm',
        experimental_ai_summary: 'Experimental visual scan',
        is_ai_generated: true,
        farmer_review_status: 'pending_review',
        farmer_final_grade: null,
        farmer_notes: null,
        is_demo: false,
        created_at: '2026-10-23T00:00:00Z',
        updated_at: '2026-10-23T00:00:00Z',
      },
    ],
    referenceDateStr: '2026-10-23',
  });

  assert.equal(alerts.length, 3); // no events, harvest due within 7 days, and pending quality review
  assert.ok(alerts.some((a) => a.module_target === 'quality'));
  assert.ok(alerts.some((a) => a.module_target === 'harvests'));
});

test('MarketEntryInputSchema requires source_citation andsanitizeOwnerId cleans untrusted input', () => {
  assert.throws(() => {
    MarketEntryInputSchema.parse({
      entry_type: 'sourced_price',
      crop_name: 'Tomato',
      market_name: 'Pimpalgaon APMC',
      region: 'Nashik',
      recorded_date: '2026-10-22',
      price_per_unit: 2400,
      source_citation: '', // should fail
    });
  });

  assert.equal(sanitizeOwnerId('  farmer_anurag_01!@# '), 'farmer_anurag_01');
  assert.equal(sanitizeOwnerId(''), 'owner-default-workspace');
  assert.equal(normalizeWeightToKg(2.5, 'quintal'), 250);
});

test('CropCycleInputSchema rejects expected_harvest_date earlier than sowing_date', () => {
  const validCycle = CropCycleInputSchema.parse({
    farm_id: 'f1',
    plot_id: 'p1',
    crop_name: 'Turmeric',
    sowing_date: '2026-06-15',
    expected_harvest_date: '2027-02-20',
  });
  assert.equal(validCycle.sowing_date, '2026-06-15');
  assert.equal(validCycle.expected_harvest_date, '2027-02-20');

  assert.throws(() => {
    CropCycleInputSchema.parse({
      farm_id: 'f1',
      plot_id: 'p1',
      crop_name: 'Turmeric',
      sowing_date: '2026-10-15',
      expected_harvest_date: '2026-09-01', // earlier than sowing_date
    });
  });
});

test('Authentication token verification rejects missing, tampered, and expired tokens', async () => {
  const { issueSignedAccessToken, verifyAccessToken } = await import('../server/auth');

  // 1. Missing token rejected with 401 MISSING_TOKEN
  await assert.rejects(
    async () => {
      await verifyAccessToken('');
    },
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 401 && err.code === 'MISSING_TOKEN'
  );

  // 2. Tampered signature rejected with 401 INVALID_SIGNATURE
  const validIssued = issueSignedAccessToken(
    {
      id: '00000000-0000-4000-8000-000000000011',
      email: 'farmer@example.com',
      full_name: 'Test Farmer',
      session_id: '00000000-0000-4000-8000-000000000022',
    },
    3600
  );
  const tamperedToken = validIssued.token.slice(0, -4) + 'XXXX';
  await assert.rejects(
    async () => {
      await verifyAccessToken(tamperedToken);
    },
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 401 && err.code === 'INVALID_SIGNATURE'
  );

  // 3. Expired token rejected with 401 TOKEN_EXPIRED
  const expiredIssued = issueSignedAccessToken(
    {
      id: '00000000-0000-4000-8000-000000000011',
      email: 'farmer@example.com',
      full_name: 'Test Farmer',
      session_id: '00000000-0000-4000-8000-000000000022',
    },
    -30
  );
  await assert.rejects(
    async () => {
      await verifyAccessToken(expiredIssued.token);
    },
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 401 && err.code === 'TOKEN_EXPIRED'
  );
});
