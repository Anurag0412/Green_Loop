-- Green Loop: Feature 2 — Row-Level Security (RLS) & Multi-User Isolation Migration
-- Safe, non-destructive, idempotent migration:
-- 1. Preserves all existing tables and user/demo data.
-- 2. Grants table privileges to the Supabase `authenticated` role and revokes from `anon`.
-- 3. Enables Row-Level Security (RLS) on all 7 public tables.
-- 4. Enforces row ownership (`owner_id`) and parent-record ownership in PostgreSQL RLS policies.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Helper function that resolves the verified authenticated subject (`sub` / `auth.uid()`)
-- from Supabase PostgREST or transaction-scoped `SET LOCAL request.jwt.claim.sub`.
CREATE OR REPLACE FUNCTION public.current_authenticated_owner_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_authenticated_owner_id() TO authenticated, anon, service_role;

-- 1. Farms RLS
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farms_select_own ON public.farms;
CREATE POLICY farms_select_own ON public.farms
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS farms_insert_own ON public.farms;
CREATE POLICY farms_insert_own ON public.farms
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS farms_update_own ON public.farms;
CREATE POLICY farms_update_own ON public.farms
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS farms_delete_own ON public.farms;
CREATE POLICY farms_delete_own ON public.farms
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

-- 2. Plots RLS (also enforces parent farm ownership)
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plots_select_own ON public.plots;
CREATE POLICY plots_select_own ON public.plots
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS plots_insert_own ON public.plots;
CREATE POLICY plots_insert_own ON public.plots
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = farm_id
        AND f.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS plots_update_own ON public.plots;
CREATE POLICY plots_update_own ON public.plots
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = farm_id
        AND f.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS plots_delete_own ON public.plots;
CREATE POLICY plots_delete_own ON public.plots
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

-- 3. Crop Cycles RLS (also enforces parent farm and plot ownership)
ALTER TABLE public.crop_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crop_cycles_select_own ON public.crop_cycles;
CREATE POLICY crop_cycles_select_own ON public.crop_cycles
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS crop_cycles_insert_own ON public.crop_cycles;
CREATE POLICY crop_cycles_insert_own ON public.crop_cycles
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = farm_id
        AND f.owner_id = public.current_authenticated_owner_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.plots p
      WHERE p.id = plot_id
        AND p.farm_id = farm_id
        AND p.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS crop_cycles_update_own ON public.crop_cycles;
CREATE POLICY crop_cycles_update_own ON public.crop_cycles
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.farms f
      WHERE f.id = farm_id
        AND f.owner_id = public.current_authenticated_owner_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.plots p
      WHERE p.id = plot_id
        AND p.farm_id = farm_id
        AND p.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS crop_cycles_delete_own ON public.crop_cycles;
CREATE POLICY crop_cycles_delete_own ON public.crop_cycles
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

-- 4. Cultivation Events RLS (also enforces parent crop_cycle ownership)
ALTER TABLE public.cultivation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cultivation_events_select_own ON public.cultivation_events;
CREATE POLICY cultivation_events_select_own ON public.cultivation_events
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS cultivation_events_insert_own ON public.cultivation_events;
CREATE POLICY cultivation_events_insert_own ON public.cultivation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.crop_cycles c
      WHERE c.id = crop_cycle_id
        AND c.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS cultivation_events_update_own ON public.cultivation_events;
CREATE POLICY cultivation_events_update_own ON public.cultivation_events
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.crop_cycles c
      WHERE c.id = crop_cycle_id
        AND c.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS cultivation_events_delete_own ON public.cultivation_events;
CREATE POLICY cultivation_events_delete_own ON public.cultivation_events
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

-- 5. Harvests RLS (also enforces parent crop_cycle ownership)
ALTER TABLE public.harvests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS harvests_select_own ON public.harvests;
CREATE POLICY harvests_select_own ON public.harvests
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS harvests_insert_own ON public.harvests;
CREATE POLICY harvests_insert_own ON public.harvests
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.crop_cycles c
      WHERE c.id = crop_cycle_id
        AND c.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS harvests_update_own ON public.harvests;
CREATE POLICY harvests_update_own ON public.harvests
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND EXISTS (
      SELECT 1 FROM public.crop_cycles c
      WHERE c.id = crop_cycle_id
        AND c.owner_id = public.current_authenticated_owner_id()
    )
  );

DROP POLICY IF EXISTS harvests_delete_own ON public.harvests;
CREATE POLICY harvests_delete_own ON public.harvests
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

-- 6. Quality Assessments RLS (also enforces parent crop_cycle and harvest ownership when provided)
ALTER TABLE public.quality_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_assessments_select_own ON public.quality_assessments;
CREATE POLICY quality_assessments_select_own ON public.quality_assessments
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS quality_assessments_insert_own ON public.quality_assessments;
CREATE POLICY quality_assessments_insert_own ON public.quality_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND (
      crop_cycle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.crop_cycles c
        WHERE c.id = crop_cycle_id
          AND c.owner_id = public.current_authenticated_owner_id()
      )
    )
    AND (
      harvest_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.harvests h
        WHERE h.id = harvest_id
          AND h.owner_id = public.current_authenticated_owner_id()
          AND (crop_cycle_id IS NULL OR h.crop_cycle_id = crop_cycle_id)
      )
    )
  );

DROP POLICY IF EXISTS quality_assessments_update_own ON public.quality_assessments;
CREATE POLICY quality_assessments_update_own ON public.quality_assessments
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (
    owner_id = public.current_authenticated_owner_id()
    AND (
      crop_cycle_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.crop_cycles c
        WHERE c.id = crop_cycle_id
          AND c.owner_id = public.current_authenticated_owner_id()
      )
    )
    AND (
      harvest_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.harvests h
        WHERE h.id = harvest_id
          AND h.owner_id = public.current_authenticated_owner_id()
          AND (crop_cycle_id IS NULL OR h.crop_cycle_id = crop_cycle_id)
      )
    )
  );

DROP POLICY IF EXISTS quality_assessments_delete_own ON public.quality_assessments;
CREATE POLICY quality_assessments_delete_own ON public.quality_assessments
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

-- 7. Market Entries RLS
ALTER TABLE public.market_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_entries_select_own ON public.market_entries;
CREATE POLICY market_entries_select_own ON public.market_entries
  FOR SELECT TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS market_entries_insert_own ON public.market_entries;
CREATE POLICY market_entries_insert_own ON public.market_entries
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS market_entries_update_own ON public.market_entries;
CREATE POLICY market_entries_update_own ON public.market_entries
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id())
  WITH CHECK (owner_id = public.current_authenticated_owner_id());

DROP POLICY IF EXISTS market_entries_delete_own ON public.market_entries;
CREATE POLICY market_entries_delete_own ON public.market_entries
  FOR DELETE TO authenticated
  USING (owner_id = public.current_authenticated_owner_id());
