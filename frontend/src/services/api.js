import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Supabase access token to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export const healthCheck = () => api.get('/health');

export const predictExpense = (description) =>
  api.post('/predict/expense', { description });

export const predictAnomaly = (data) =>
  api.post('/predict/anomaly', data);

export const predictCluster = (data) =>
  api.post('/predict/cluster', data);

export const predictForecast = (data) =>
  api.post('/predict/forecast', data);

// ── User ML processing endpoints ──
export const processUserMl = (force = false) =>
  api.post('/ml/process', { force });

export const getUserMlProfile = () =>
  api.get('/ml/profile');

export const getUserForecast = () =>
  api.get('/ml/forecast');

export const getUserForecastReasoning = () =>
  api.get('/ml/forecast/reasoning');

// ── Smart Recurring Payments Endpoints ──
export const getRecurringPayments = () =>
  api.get('/recurring-payments');

export const getRecurringSummary = () =>
  api.get('/recurring-payments/summary');

export const getUpcomingRecurringPayments = () =>
  api.get('/recurring-payments/upcoming');

export const getDueRecurringPayments = () =>
  api.get('/recurring-payments/due');

export const getOverdueRecurringPayments = () =>
  api.get('/recurring-payments/overdue');

export const getPaymentCycleHistory = (paymentId) =>
  api.get(`/recurring-payments/${paymentId}/history`);

export const triggerRecurringDetection = () =>
  api.post('/recurring-payments/detect');

export const confirmRecurringPayment = (paymentId) =>
  api.post(`/recurring-payments/${paymentId}/confirm`);

export const dismissRecurringPayment = (paymentId) =>
  api.post(`/recurring-payments/${paymentId}/dismiss`);

export const pauseRecurringPayment = (paymentId) =>
  api.post(`/recurring-payments/${paymentId}/pause`);

export const resumeRecurringPayment = (paymentId) =>
  api.post(`/recurring-payments/${paymentId}/resume`);

export const markRecurringPaymentPaid = (paymentId, payload) =>
  api.post(`/recurring-payments/${paymentId}/mark-paid`, payload);

export default api;


