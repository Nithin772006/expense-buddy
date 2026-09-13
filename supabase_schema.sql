-- ==============================================================================
-- Expense Buddy — Supabase PostgreSQL Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor to set up all tables and RLS policies.

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Transaction Imports Table
CREATE TABLE IF NOT EXISTS public.transaction_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'csv',
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Debit', 'Credit')),
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Uncategorized',
    is_anomaly BOOLEAN DEFAULT false,
    anomaly_score NUMERIC(6, 4) DEFAULT 0.0,
    anomaly_reason TEXT,
    import_id UUID REFERENCES public.transaction_imports(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. User ML Profiles Table (Clusters & Forecasts)
CREATE TABLE IF NOT EXISTS public.user_ml_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    cluster_id INTEGER DEFAULT 0,
    cluster_label TEXT DEFAULT 'Standard Spender',
    monthly_forecast NUMERIC(12, 2) DEFAULT 0.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Indexes for High Performance Querying
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_user_anomaly ON public.transactions(user_id, is_anomaly);
CREATE INDEX IF NOT EXISTS idx_imports_user_created ON public.transaction_imports(user_id, created_at DESC);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ml_profiles ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: Ensure Users Only Access Their Own Data

-- Transactions Policies
CREATE POLICY "Users can view own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
    ON public.transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
    ON public.transactions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
    ON public.transactions FOR DELETE
    USING (auth.uid() = user_id);

-- Transaction Imports Policies
CREATE POLICY "Users can view own imports"
    ON public.transaction_imports FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own imports"
    ON public.transaction_imports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own imports"
    ON public.transaction_imports FOR UPDATE
    USING (auth.uid() = user_id);

-- User ML Profiles Policies
CREATE POLICY "Users can view own ML profile"
    ON public.user_ml_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update own ML profile"
    ON public.user_ml_profiles FOR ALL
    USING (auth.uid() = user_id);
