/**
 * queryCache.js — Lightweight, User-Scoped Frontend Query Cache
 * 
 * Provides:
 * 1. In-flight request deduplication (prevents duplicate simultaneous requests between TopNavigation and pages)
 * 2. Stale-time caching (near-instant page navigation with 0 network roundtrips when data is fresh)
 * 3. Strict user-scoped isolation (user data cannot cross-pollinate)
 * 4. Event-driven invalidation on data changes (imports, expense add/delete, payments marked paid)
 */

import { supabase } from '../lib/supabaseClient';
import {
  healthCheck,
  getUserMlProfile,
  getRecurringPayments,
  getUserForecast,
} from './api';

const DEFAULT_STALE_TIME = 3 * 60 * 1000; // 3 minutes
const HEALTH_STALE_TIME  = 5 * 60 * 1000; // 5 minutes

class QueryCache {
  constructor() {
    this.cache = new Map();
  }

  _makeKey(parts) {
    return parts.filter((p) => p !== undefined && p !== null).join('::');
  }

  /**
   * Fetch with cache and in-flight promise deduplication.
   */
  async fetch(keyParts, fetcher, staleTime = DEFAULT_STALE_TIME, force = false) {
    const key = this._makeKey(keyParts);
    const now = Date.now();
    const entry = this.cache.get(key);

    // 1. Return fresh cached data if valid and not forcing refresh
    if (!force && entry?.data !== undefined && (now - entry.timestamp) < staleTime) {
      return entry.data;
    }

    // 2. Deduplicate: if an identical request is currently in-flight, reuse its promise
    if (entry?.promise) {
      return entry.promise;
    }

    // 3. Dispatch new request
    const promise = (async () => {
      try {
        const data = await fetcher();
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          promise: null,
        });
        return data;
      } catch (err) {
        // Remove promise on error so subsequent attempts can retry
        if (this.cache.has(key)) {
          const current = this.cache.get(key);
          this.cache.set(key, { ...current, promise: null });
        }
        throw err;
      }
    })();

    // Store in-flight promise
    this.cache.set(key, {
      data: entry?.data,
      timestamp: entry?.timestamp || 0,
      promise,
    });

    return promise;
  }

  /**
   * Synchronously peek at existing cached data (for instant UI render).
   */
  peek(keyParts) {
    const key = this._makeKey(keyParts);
    const entry = this.cache.get(key);
    return entry?.data !== undefined ? entry.data : null;
  }

  /**
   * Invalidate specific key or prefix pattern.
   */
  invalidate(keyPrefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate all data for a specific authenticated user.
   */
  invalidateUser(userId) {
    if (!userId) return;
    for (const key of this.cache.keys()) {
      if (key.includes(`::${userId}`)) {
        this.cache.delete(key);
      }
    }
    window.dispatchEvent(new CustomEvent('eb:transactions-updated', { detail: { userId } }));
  }

  /**
   * Clear entire cache (on logout).
   */
  clearAll() {
    this.cache.clear();
  }
}

export const queryCache = new QueryCache();

// ── User ID Helper ─────────────────────────────────────────────────────────

async function getAuthUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

// ── Domain-Specific Cached Getters ─────────────────────────────────────────

/**
 * Cached backend health check (shared globally, 5 min TTL).
 */
export async function getCachedHealth(force = false) {
  return queryCache.fetch(
    ['health'],
    async () => {
      const res = await healthCheck();
      return res.data;
    },
    HEALTH_STALE_TIME,
    force
  );
}

/**
 * Cached user ML profile (cluster, forecast, version status).
 */
export async function getCachedMlProfile(force = false) {
  const userId = await getAuthUserId();
  if (!userId) return null;

  return queryCache.fetch(
    ['ml_profile', userId],
    async () => {
      const res = await getUserMlProfile();
      return res.data?.profile || null;
    },
    DEFAULT_STALE_TIME,
    force
  );
}

/**
 * Cached recurring payments (strictly read-only).
 */
export async function getCachedRecurringPayments(force = false) {
  const userId = await getAuthUserId();
  if (!userId) return null;

  return queryCache.fetch(
    ['recurring_payments', userId],
    async () => {
      const res = await getRecurringPayments();
      return res.data;
    },
    DEFAULT_STALE_TIME,
    force
  );
}

/**
 * Cached forecast data.
 */
export async function getCachedForecast(force = false) {
  const userId = await getAuthUserId();
  if (!userId) return null;

  return queryCache.fetch(
    ['forecast', userId],
    async () => {
      const res = await getUserForecast();
      return res.data?.forecast || null;
    },
    DEFAULT_STALE_TIME,
    force
  );
}

/**
 * Helper to invalidate all user data when transactions change.
 */
export async function invalidateUserData(userId) {
  const uid = userId || (await getAuthUserId());
  if (uid) {
    queryCache.invalidateUser(uid);
  }
}

/**
 * Invalidate recurring payments cache specifically (e.g. after marking paid).
 */
export async function invalidateRecurringPayments(userId) {
  const uid = userId || (await getAuthUserId());
  if (uid) {
    queryCache.invalidate(`recurring_payments::${uid}`);
  }
}
