-- ==============================================================================
-- Migration 004: Add Payee UPI Configuration to Recurring Payments
-- ==============================================================================

-- 1. Add payee_name and payee_upi_id columns to recurring_payments table
ALTER TABLE public.recurring_payments 
ADD COLUMN IF NOT EXISTS payee_name TEXT,
ADD COLUMN IF NOT EXISTS payee_upi_id TEXT;

-- 2. Add comment for documentation
COMMENT ON COLUMN public.recurring_payments.payee_name IS 'Business/Payee name for UPI payments';
COMMENT ON COLUMN public.recurring_payments.payee_upi_id IS 'Virtual Payment Address (VPA) for UPI intent redirection (e.g. merchant@upi)';
