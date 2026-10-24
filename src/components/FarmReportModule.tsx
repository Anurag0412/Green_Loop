import React, { useState } from 'react';
import { Download, Database, CheckCircle, Activity, FileSpreadsheet } from 'lucide-react';
import type { CycleReportRow } from '../shared/validation';
import type { DatabaseStatusReport } from '../server/db';
import {
  api,
  formatCurrencyOrMissing,
  formatWeightOrMissing,
  formatStageLabel,
} from '../lib/api';

interface Props {
  ownerId: string;
  cycleReports: CycleReportRow[];
  databaseStatus: DatabaseStatusReport;
  onRefresh: () => Promise<void>;
}

export function FarmReportModule({
  ownerId,
  cycleReports,
  databaseStatus,
  onRefresh,
}: Props) {
  const [sqlPreview, setSqlPreview] = useState<string | null>(null);
  const [loadingSql, setLoadingSql] = useState(false);
  const [applyingMigration, setApplyingMigration] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [healthProbeResult, setHealthProbeResult] = useState<{
    httpStatus: number;
    report: DatabaseStatusReport;
  } | null>(null);
  const [probingHealth, setProbingHealth] = useState(false);

  const cyclesWithKnownCost = cycleReports.filter((r) => r.total_known_cost !== null);
  const aggregateKnownCost =
    cyclesWithKnownCost.length > 0
      ? cyclesWithKnownCost.reduce((sum, r) => sum + (r.total_known_cost ?? 0), 0)
      : null;

  const cyclesWithMeasuredHarvest = cycleReports.filter(
    (r) => r.total_measured_weight_kg !== null
  );
  const aggregateMeasuredHarvestKg =
    cyclesWithMeasuredHarvest.length > 0
      ? cyclesWithMeasuredHarvest.reduce((sum, r) => sum + (r.total_measured_weight_kg ?? 0), 0)
      : null;

  const totalActivities = cycleReports.reduce((sum, r) => sum + r.activity_count, 0);
  const totalVerifiedQuality = cycleReports.reduce((sum, r) => sum + r.verified_quality_count, 0);

  function handleExportCsv() {
    const headers = [
      'Crop Name',
      'Variety',
      'Farm',
      'Plot',
      'Sowing Date',
      'Status',
      'Activities Logged',
      'Seed Cost (INR)',
      'Cultivation Cost Known (INR)',
      'Total Known Cost (INR)',
      'Incomplete Cost Records',
      'Measured Harvest (kg)',
      'Verified Quality Grade',
      'Demo Record',
    ];
    const rows = cycleReports.map((r) => [
      r.crop_name,
      r.seed_variety ?? 'Not recorded',
      r.farm_name,
      r.plot_name,
      r.sowing_date,
      r.status,
      String(r.activity_count),
      r.seed_cost !== null ? String(r.seed_cost) : 'Not recorded',
      r.cultivation_cost_known_total !== null
        ? String(r.cultivation_cost_known_total)
        : 'Not recorded',
      r.total_known_cost !== null ? String(r.total_known_cost) : 'Not recorded',
      r.has_incomplete_cost_data ? 'Yes (partial)' : 'No (complete)',
      r.total_measured_weight_kg !== null ? String(r.total_measured_weight_kg) : 'Not recorded',
      r.latest_verified_grade ?? 'Not verified',
      r.is_demo ? 'Demo' : 'User Recorded',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `green-loop-farm-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleToggleSqlMigration() {
    if (sqlPreview) {
      setSqlPreview(null);
      return;
    }
    setLoadingSql(true);
    try {
      const res = await api.getMigrationSql(ownerId);
      setSqlPreview(res.sql);
    } finally {
      setLoadingSql(false);
    }
  }

  async function handleApplyMigration() {
    setApplyingMigration(true);
    setMigrationMessage(null);
    try {
      const res = await api.applyMigration(ownerId);
      setMigrationMessage(res.status.message);
      await onRefresh();
    } catch (err) {
      setMigrationMessage(
        err instanceof Error ? err.message : 'Migration execution requires DATABASE_URL.'
      );
    } finally {
      setApplyingMigration(false);
    }
  }

  async function handleRunHealthCheck() {
    setProbingHealth(true);
    try {
      const res = await api.checkDbHealth(ownerId);
      setHealthProbeResult(res);
    } finally {
      setProbingHealth(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b-[2.5px] border-primary pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2">
            <span className="washi-tape bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md font-bold px-2.5 py-0.5 border-[1.5px] border-primary uppercase tracking-wider inline-block">
              LIFECYCLE AUDIT · SEC 07
            </span>
            <span className="font-mono text-xs text-on-surface-variant font-bold">
              // ACCOUNTING &amp; DATA INTEGRITY AUDIT
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight uppercase">
            Farm Lifecycle Report
          </h1>
          <p className="text-body-md text-on-surface-variant max-w-2xl font-medium">
            Summarizes recorded cultivation activities, known input costs, measured harvest weights,
            and farmer-verified quality grades. Unrecorded values are explicitly reported as{' '}
            <span className="font-mono font-bold text-primary bg-tertiary-fixed px-1 border border-primary">
              Not recorded
            </span>{' '}
            and never conflated with{' '}
            <span className="font-mono font-bold text-primary bg-surface-container-high px-1 border border-primary">
              0
            </span>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-xs font-bold uppercase tracking-wider text-on-primary bg-primary border-2 border-primary brutal-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-transform whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Download CSV Report
        </button>
      </div>

      {/* 4 Tactile KPI Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-surface-container-lowest border-[2.5px] border-primary p-5 shadow-[4px_4px_0px_#012d1d]">
          <p className="font-mono text-[11px] font-bold text-on-surface-variant uppercase">
            Total Recorded Field Activities
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-primary whitespace-nowrap">
            {totalActivities}
          </p>
          <p className="mt-1 font-mono text-xs text-on-surface-variant">
            Across {cycleReports.length} crop cycle(s)
          </p>
        </div>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary p-5 shadow-[4px_4px_0px_#012d1d]">
          <p className="font-mono text-[11px] font-bold text-on-surface-variant uppercase">
            Total Known Input &amp; Harvest Costs
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-primary whitespace-nowrap">
            {formatCurrencyOrMissing(aggregateKnownCost)}
          </p>
          <p className="mt-1 font-mono text-xs text-on-surface-variant">
            {cyclesWithKnownCost.length} of {cycleReports.length} cycle(s) have cost entries
          </p>
        </div>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary p-5 shadow-[4px_4px_0px_#012d1d]">
          <p className="font-mono text-[11px] font-bold text-on-surface-variant uppercase">
            Total Measured Harvest Weight
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-secondary whitespace-nowrap">
            {formatWeightOrMissing(aggregateMeasuredHarvestKg, 'kg')}
          </p>
          <p className="mt-1 font-mono text-xs text-on-surface-variant">
            {cyclesWithMeasuredHarvest.length} cycle(s) with weighbridge/scale entries
          </p>
        </div>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary p-5 shadow-[4px_4px_0px_#012d1d]">
          <p className="font-mono text-[11px] font-bold text-on-surface-variant uppercase">
            Farmer-Reviewed Quality Lots
          </p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-primary whitespace-nowrap">
            {totalVerifiedQuality}
          </p>
          <p className="mt-1 font-mono text-xs text-on-surface-variant">
            Excludes unreviewed experimental AI scans
          </p>
        </div>
      </div>

      {/* Cycle-by-Cycle Report Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-xl font-bold text-primary uppercase">
            Crop Cycle Breakdown (Missing Data vs. Zero Values)
          </h2>
        </div>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary shadow-[5px_5px_0px_#012d1d] overflow-x-auto">
          {cycleReports.length === 0 ? (
            <div className="p-8 text-center font-mono text-sm text-on-surface-variant">
              No crop cycles recorded yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-primary bg-surface-container-low font-label-md text-xs font-bold text-primary uppercase">
                  <th className="py-3.5 px-4">Crop Cycle &amp; Plot</th>
                  <th className="py-3.5 px-4 text-right">Activities</th>
                  <th className="py-3.5 px-4 text-right">Seed Cost</th>
                  <th className="py-3.5 px-4 text-right">Cultivation Cost</th>
                  <th className="py-3.5 px-4 text-right">Total Known Cost</th>
                  <th className="py-3.5 px-4 text-right">Measured Harvest (kg)</th>
                  <th className="py-3.5 px-4">Farmer-Verified Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-primary/20 text-xs">
                {cycleReports.map((row) => (
                  <tr key={row.crop_cycle_id} className="hover:bg-surface-container-low">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-primary text-sm">
                        {row.crop_name}
                        {row.is_demo && (
                          <span className="ml-2 px-1.5 py-0.5 bg-tertiary-fixed border border-primary font-mono text-[10px] font-bold text-on-tertiary-fixed uppercase">
                            Demo Data
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-on-surface-variant">
                        {row.farm_name} · {row.plot_name} · Sown {row.sowing_date} (
                        {formatStageLabel(row.status)})
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-primary">
                      {row.activity_count}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-primary">
                      {formatCurrencyOrMissing(row.seed_cost)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-primary">
                      <div>{formatCurrencyOrMissing(row.cultivation_cost_known_total)}</div>
                      {row.events_with_missing_cost > 0 && (
                        <div className="text-[11px] text-tertiary font-mono">
                          ({row.events_with_missing_cost} event cost unrecorded)
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-primary">
                      <div>{formatCurrencyOrMissing(row.total_known_cost)}</div>
                      {row.has_incomplete_cost_data && (
                        <div className="text-[11px] font-mono text-on-surface-variant">
                          Partial — missing fields
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-secondary">
                      {formatWeightOrMissing(row.total_measured_weight_kg, 'kg')}
                    </td>
                    <td className="py-3.5 px-4">
                      {row.latest_verified_grade ? (
                        <span className="px-2 py-0.5 bg-secondary-container border border-primary font-mono font-bold text-on-secondary-container">
                          {row.latest_verified_grade}
                        </span>
                      ) : row.pending_quality_count > 0 ? (
                        <span className="px-2 py-0.5 bg-tertiary-fixed border border-primary font-mono font-bold text-on-tertiary-fixed">
                          Pending farmer review ({row.pending_quality_count})
                        </span>
                      ) : (
                        <span className="font-mono text-on-surface-variant">Not assessed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Supabase PostgreSQL Connection & Migration Verification Panel */}
      <div className="bg-surface-container-lowest border-[2.5px] border-primary p-6 shadow-[5px_5px_0px_#012d1d] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-headline-sm text-sm font-bold text-primary uppercase">
              <Database className="w-4 h-4 text-secondary" />
              <span>Supabase PostgreSQL Connection &amp; Migration Verification</span>
            </div>
            <p className="text-xs text-on-surface-variant font-medium">
              Active Storage Mode:{' '}
              <span className="font-mono font-bold text-primary bg-secondary-container px-1.5 py-0.5 border border-primary">
                {databaseStatus.active_storage_mode}
              </span>{' '}
              · {databaseStatus.message}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunHealthCheck}
              disabled={probingHealth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-label-md text-xs font-bold uppercase text-primary bg-surface-container-low hover:bg-tertiary-fixed border-2 border-primary transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              {probingHealth ? 'Testing /api/health/db...' : 'Test /api/health/db'}
            </button>
            {databaseStatus.connected && !databaseStatus.schema_verified && (
              <button
                type="button"
                onClick={handleApplyMigration}
                disabled={applyingMigration}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-label-md text-xs font-bold uppercase text-on-primary bg-primary border-2 border-primary brutal-shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {applyingMigration ? 'Applying...' : 'Apply Safe SQL Migration'}
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleSqlMigration}
              className="px-3 py-1.5 font-label-md text-xs font-bold uppercase text-primary bg-surface-container-low hover:bg-tertiary-fixed border-2 border-primary transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loadingSql
                ? 'Loading SQL...'
                : sqlPreview
                  ? 'Hide SQL Migration (001_initial_schema.sql)'
                  : 'View SQL Migration (001_initial_schema.sql)'}
            </button>
          </div>
        </div>

        {healthProbeResult && (
          <div
            className={`p-3 border-2 border-primary text-xs font-mono space-y-1 ${
              healthProbeResult.httpStatus === 200
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-tertiary-fixed text-on-tertiary-fixed'
            }`}
          >
            <div className="font-bold">
              GET /api/health/db → HTTP {healthProbeResult.httpStatus} · select_one:{' '}
              {String(healthProbeResult.report.select_one)} · connected:{' '}
              {String(healthProbeResult.report.connected)} · schema_verified:{' '}
              {String(healthProbeResult.report.schema_verified)}
            </div>
            <div>{healthProbeResult.report.message}</div>
          </div>
        )}

        {migrationMessage && (
          <div className="p-3 bg-surface-container-low border-2 border-primary text-xs font-mono text-primary">
            {migrationMessage}
          </div>
        )}

        {sqlPreview && (
          <pre className="p-4 bg-primary text-on-primary text-xs font-mono border-2 border-primary overflow-x-auto max-h-96">
            {sqlPreview}
          </pre>
        )}
      </div>
    </div>
  );
}
