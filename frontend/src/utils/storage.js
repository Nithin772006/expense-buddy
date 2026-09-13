/**
 * storage.js — localStorage helpers (kept for backward compatibility).
 * Manual expenses are now ALSO saved to Supabase via transactionService.
 */

const STORAGE_KEY = 'expenseBuddyTransactions';

function getKey(userId) {
  return userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

/**
 * Returns stored transactions from localStorage for the given user (newest first).
 * Note: Supabase is the canonical source of truth — this is a local UI cache only.
 */
export function getTransactions(userId) {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (raw) return JSON.parse(raw);
    // fallback check for legacy un-scoped key if no userId
    if (!userId) {
      const legacy = localStorage.getItem(STORAGE_KEY);
      return legacy ? JSON.parse(legacy) : [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Saves a transaction to user-scoped localStorage cache.
 */
export function saveTransaction(tx, userId) {
  const existing = getTransactions(userId);
  const updated = [tx, ...existing.filter((t) => t.id !== tx.id)];
  localStorage.setItem(getKey(userId), JSON.stringify(updated));
  return updated;
}

/**
 * Clears stored transactions from localStorage for the given user.
 */
export function clearTransactions(userId) {
  localStorage.removeItem(getKey(userId));
  if (!userId) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Clears all cached transaction data across all users from browser storage.
 */
export function purgeAllLocalTransactionCaches() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORAGE_KEY)) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

/**
 * Generates a simple unique ID.
 */
export function generateId() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
