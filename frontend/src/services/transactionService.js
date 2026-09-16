/**
 * transactionService.js
 * Unified data layer for transactions — reads from Supabase when authenticated,
 * falls back to localStorage for manual entries.
 */

import { supabase } from '../lib/supabaseClient';
import { triggerRecurringDetection } from './api';
import { queryCache, invalidateUserData } from './queryCache';

/**
 * Fetch all transactions for the current user from Supabase with query caching.
 * Deduplicates in-flight requests and caches for fast navigation.
 */
export async function fetchTransactions({ limit = 500, force = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return [];

  return queryCache.fetch(
    ['transactions', userId, limit],
    async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('fetchTransactions error:', error);
        return [];
      }

      return (data || []).map(normalizeForUI);
    },
    3 * 60 * 1000,
    force
  );
}

/**
 * Save a single manually-entered transaction to Supabase.
 */
export async function saveTransactionToSupabase(tx) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('saveTransactionToSupabase: no authenticated user, skipping Supabase write');
    return null;
  }

  const row = {
    user_id:          user.id,
    transaction_date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    description:      tx.description,
    merchant:         tx.merchant || null,
    amount:           tx.amount,
    transaction_type: tx.transaction_type || 'debit',
    payment_method:   tx.payment_method || null,
    account_balance:  tx.account_balance || null,
    category:         tx.category || null,
    is_anomaly:       tx.is_anomaly || false,
    anomaly_score:    tx.anomaly_score || null,
    classification_confidence: tx.classification_confidence || null,
    source:           tx.source || 'manual',
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('saveTransactionToSupabase error:', error);
    throw error;
  }

  // Invalidate cached queries for this user so views update with fresh data
  invalidateUserData(user.id);

  // Trigger recurring payment detection sync in the background
  try {
    triggerRecurringDetection().catch(() => {});
  } catch (e) {
    // Non-blocking background sync
  }

  return data;
}

/**
 * Delete all transactions for the current authenticated user from Supabase.
 */
export async function deleteUserTransactions() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('deleteUserTransactions error:', error);
    throw error;
  }

  // Invalidate cached user queries
  invalidateUserData(user.id);
}

/**
 * Map Supabase row → shape expected by existing UI components:
 * { id, description, amount, date, category, is_anomaly, account_balance, ... }
 */
function normalizeForUI(row) {
  return {
    id:              row.id,
    description:     row.description,
    merchant:        row.merchant,
    amount:          parseFloat(row.amount),
    date:            row.transaction_date,   // keep as date string
    category:        row.category || 'Uncategorized',
    is_anomaly:      row.is_anomaly,
    anomaly_score:   row.anomaly_score,
    account_balance: row.account_balance ? parseFloat(row.account_balance) : null,
    transaction_type: row.transaction_type,
    payment_method:  row.payment_method,
    source:          row.source,
    source_import_id: row.source_import_id,
    created_at:      row.created_at,
  };
}
