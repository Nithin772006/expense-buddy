-- ==============================================================================
-- Migration 002: Add Transaction & Analysis Versioning to user_ml_profiles
-- ==============================================================================

-- 1. Ensure user_ml_profiles table exists and has all required versioning fields
CREATE TABLE IF NOT EXISTS public.user_ml_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    cluster_id INTEGER DEFAULT 0,
    cluster_label TEXT DEFAULT 'Standard Spender',
    monthly_forecast NUMERIC(12, 2) DEFAULT 0.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add versioning, status, and cached feature columns safely
ALTER TABLE public.user_ml_profiles
    ADD COLUMN IF NOT EXISTS transaction_version BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS analyzed_version BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'ready',
    ADD COLUMN IF NOT EXISTS total_transactions INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_spending NUMERIC(12, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS cluster INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cluster_description TEXT,
    ADD COLUMN IF NOT EXISTS features_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS forecasted_amount NUMERIC(12, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS forecast_features JSONB DEFAULT '{}'::jsonb;

-- 3. Indexes for fast status and version querying
CREATE INDEX IF NOT EXISTS idx_user_ml_profiles_status 
    ON public.user_ml_profiles(user_id, analysis_status);

CREATE INDEX IF NOT EXISTS idx_user_ml_profiles_version 
    ON public.user_ml_profiles(user_id, transaction_version, analyzed_version);
