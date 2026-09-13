-- ==============================================================================
-- Migration 001: Create Recurring Payments and Recurring Payment Instances
-- ==============================================================================

-- 1. Create recurring_payments table
CREATE TABLE IF NOT EXISTS public.recurring_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    merchant TEXT NOT NULL,
    normalized_merchant TEXT NOT NULL,
    category TEXT,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    status TEXT NOT NULL DEFAULT 'active',
    confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    first_seen_date DATE,
    last_paid_date DATE,
    next_expected_date DATE,
    average_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    median_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    min_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    max_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    amount_stability TEXT NOT NULL DEFAULT 'mostly_stable',
    average_interval_days NUMERIC(6, 2) DEFAULT 0.0,
    payment_method TEXT,
    is_confirmed BOOLEAN NOT NULL DEFAULT false,
    detection_evidence JSONB DEFAULT '{}'::jsonb,
    source_transaction_ids JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create recurring_payment_instances table (Billing cycles)
CREATE TABLE IF NOT EXISTS public.recurring_payment_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recurring_payment_id UUID NOT NULL REFERENCES public.recurring_payments(id) ON DELETE CASCADE,
    billing_cycle_key TEXT NOT NULL,
    expected_date DATE NOT NULL,
    due_date DATE NOT NULL,
    expected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'upcoming',
    matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    paid_date DATE,
    actual_amount NUMERIC(12, 2),
    payment_source TEXT DEFAULT 'auto_detected',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_payment_cycle UNIQUE (user_id, recurring_payment_id, billing_cycle_key)
);

-- 3. Indexes for fast lookup and user isolation
CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_status 
    ON public.recurring_payments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_next_date 
    ON public.recurring_payments(user_id, next_expected_date);

CREATE INDEX IF NOT EXISTS idx_recurring_payments_user_merchant 
    ON public.recurring_payments(user_id, normalized_merchant);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_user_status 
    ON public.recurring_payment_instances(user_id, status);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_payment_cycle 
    ON public.recurring_payment_instances(recurring_payment_id, billing_cycle_key);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_matched_tx 
    ON public.recurring_payment_instances(matched_transaction_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.recurring_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_payment_instances ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies for Authenticated Users
DROP POLICY IF EXISTS "Users can manage own recurring payments" ON public.recurring_payments;
CREATE POLICY "Users can manage own recurring payments"
    ON public.recurring_payments FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own recurring payment instances" ON public.recurring_payment_instances;
CREATE POLICY "Users can manage own recurring payment instances"
    ON public.recurring_payment_instances FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
