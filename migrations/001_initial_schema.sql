-- Green Loop: Normalized PostgreSQL Schema (Supabase-compatible)
-- Safe, non-destructive migration: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
-- Does not drop or reset existing objects.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Farms
CREATE TABLE IF NOT EXISTS public.farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  location TEXT NOT NULL CHECK (char_length(trim(location)) > 0),
  total_area_acres NUMERIC(10, 2) CHECK (total_area_acres IS NULL OR total_area_acres > 0),
  soil_summary TEXT,
  water_source TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_farms_owner_id ON public.farms(owner_id);
CREATE INDEX IF NOT EXISTS idx_farms_created_at ON public.farms(created_at DESC);

-- 2. Plots
CREATE TABLE IF NOT EXISTS public.plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  area_acres NUMERIC(10, 2) NOT NULL CHECK (area_acres > 0),
  soil_type TEXT,
  soil_ph NUMERIC(4, 2) CHECK (soil_ph IS NULL OR (soil_ph >= 0 AND soil_ph <= 14)),
  irrigation_type TEXT,
  location_coordinates TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plots_owner_id ON public.plots(owner_id);
CREATE INDEX IF NOT EXISTS idx_plots_farm_id ON public.plots(farm_id);

-- 3. Crop Cycles (Crop Planning)
CREATE TABLE IF NOT EXISTS public.crop_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL CHECK (char_length(trim(crop_name)) > 0),
  seed_variety TEXT,
  seed_source TEXT,
  sowing_date DATE NOT NULL,
  expected_harvest_date DATE,
  soil_details TEXT,
  location_detail TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'harvested', 'completed', 'cancelled')),
  current_stage TEXT NOT NULL DEFAULT 'sowing' CHECK (current_stage IN ('land_prep', 'sowing', 'germination', 'vegetative', 'flowering', 'fruiting', 'maturation', 'harvest_ready', 'post_harvest')),
  seed_cost NUMERIC(12, 2) CHECK (seed_cost IS NULL OR seed_cost >= 0),
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crop_cycles_owner_id ON public.crop_cycles(owner_id);
CREATE INDEX IF NOT EXISTS idx_crop_cycles_farm_id ON public.crop_cycles(farm_id);
CREATE INDEX IF NOT EXISTS idx_crop_cycles_plot_id ON public.crop_cycles(plot_id);
CREATE INDEX IF NOT EXISTS idx_crop_cycles_status ON public.crop_cycles(status);

-- 4. Cultivation Events (Cultivation Log)
CREATE TABLE IF NOT EXISTS public.cultivation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  crop_cycle_id UUID NOT NULL REFERENCES public.crop_cycles(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('irrigation', 'fertilizer', 'pest_management', 'weeding', 'observation', 'soil_amendment', 'pruning', 'other')),
  crop_stage TEXT NOT NULL CHECK (crop_stage IN ('land_prep', 'sowing', 'germination', 'vegetative', 'flowering', 'fruiting', 'maturation', 'harvest_ready', 'post_harvest')),
  description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
  inputs_applied TEXT,
  cost_amount NUMERIC(12, 2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  observations TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cultivation_events_owner_id ON public.cultivation_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_cultivation_events_crop_cycle_id ON public.cultivation_events(crop_cycle_id);
CREATE INDEX IF NOT EXISTS idx_cultivation_events_event_date ON public.cultivation_events(event_date DESC);

-- 5. Harvests (Harvest Management)
CREATE TABLE IF NOT EXISTS public.harvests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  crop_cycle_id UUID NOT NULL REFERENCES public.crop_cycles(id) ON DELETE CASCADE,
  harvest_date DATE NOT NULL,
  measured_weight NUMERIC(12, 2) NOT NULL CHECK (measured_weight >= 0),
  weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'quintal', 'ton', 'lb')),
  harvest_cost NUMERIC(12, 2) CHECK (harvest_cost IS NULL OR harvest_cost >= 0),
  storage_location TEXT,
  batch_code TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_harvests_owner_id ON public.harvests(owner_id);
CREATE INDEX IF NOT EXISTS idx_harvests_crop_cycle_id ON public.harvests(crop_cycle_id);
CREATE INDEX IF NOT EXISTS idx_harvests_harvest_date ON public.harvests(harvest_date DESC);

-- 6. Quality Assessments (Visual Crop Inspection & Farmer Review)
CREATE TABLE IF NOT EXISTS public.quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  crop_cycle_id UUID REFERENCES public.crop_cycles(id) ON DELETE SET NULL,
  harvest_id UUID REFERENCES public.harvests(id) ON DELETE SET NULL,
  crop_name TEXT NOT NULL CHECK (char_length(trim(crop_name)) > 0),
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  image_label TEXT,
  visible_ripeness TEXT NOT NULL,
  visible_defects TEXT NOT NULL,
  color_uniformity TEXT,
  surface_condition TEXT,
  experimental_ai_summary TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT TRUE,
  farmer_review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (farmer_review_status IN ('pending_review', 'farmer_verified', 'farmer_adjusted', 'rejected')),
  farmer_final_grade TEXT CHECK (farmer_final_grade IS NULL OR farmer_final_grade IN ('Grade A (Market Prime)', 'Grade B (Standard Commercial)', 'Grade C (Processing / Local)', 'Rejected / Spoiled', 'Unassigned')),
  farmer_notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_assessments_owner_id ON public.quality_assessments(owner_id);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_crop_cycle_id ON public.quality_assessments(crop_cycle_id);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_harvest_id ON public.quality_assessments(harvest_id);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_assessment_date ON public.quality_assessments(assessment_date DESC);

-- 7. Market Entries (Sourced Market Prices & Verified Buyer Records)
CREATE TABLE IF NOT EXISTS public.market_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sourced_price', 'buyer_contact')),
  crop_name TEXT NOT NULL CHECK (char_length(trim(crop_name)) > 0),
  market_name TEXT NOT NULL CHECK (char_length(trim(market_name)) > 0),
  region TEXT NOT NULL,
  recorded_date DATE NOT NULL,
  price_per_unit NUMERIC(12, 2) CHECK (price_per_unit IS NULL OR price_per_unit >= 0),
  price_unit TEXT DEFAULT 'INR/quintal',
  source_citation TEXT NOT NULL CHECK (char_length(trim(source_citation)) > 0),
  buyer_organization TEXT,
  buyer_contact_info TEXT,
  quality_requirements TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_entries_owner_id ON public.market_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_market_entries_crop_name ON public.market_entries(crop_name);
