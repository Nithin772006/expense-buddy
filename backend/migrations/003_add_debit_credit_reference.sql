-- ==============================================================================
-- Migration 003: Add Debit/Credit/Reference columns to transactions table
-- ==============================================================================
-- Preserves all existing transaction data.
-- Adds nullable columns with sensible defaults.
-- Run in Supabase SQL Editor.

-- Add debit column: stores the raw debit value from bank statement (NULL if credit transaction)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS debit NUMERIC(12, 2) DEFAULT NULL;

-- Add credit column: stores the raw credit value from bank statement (NULL if debit transaction)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS credit NUMERIC(12, 2) DEFAULT NULL;

-- Add reference column: ref no / cheque no from bank statement
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS reference TEXT DEFAULT NULL;

-- Backfill existing transactions:
-- For debit transactions, set debit = amount (credit remains NULL)
-- For credit transactions, set credit = amount (debit remains NULL)
UPDATE public.transactions
SET debit = amount
WHERE transaction_type = 'debit' AND debit IS NULL;

UPDATE public.transactions
SET credit = amount
WHERE transaction_type = 'credit' AND credit IS NULL;

-- Index for reference lookups
CREATE INDEX IF NOT EXISTS idx_transactions_reference
    ON public.transactions(user_id, reference)
    WHERE reference IS NOT NULL;

-- Verify
SELECT
    COUNT(*) AS total_transactions,
    SUM(CASE WHEN transaction_type = 'debit'  THEN 1 ELSE 0 END) AS debit_count,
    SUM(CASE WHEN transaction_type = 'credit' THEN 1 ELSE 0 END) AS credit_count,
    SUM(CASE WHEN debit IS NULL AND credit IS NULL THEN 1 ELSE 0 END) AS missing_amount_count
FROM public.transactions;
