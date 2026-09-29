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

import { invalidateRecurringPayments, invalidateUserData } from './queryCache';

export const triggerRecurringDetection = async () => {
  const res = await api.post('/recurring-payments/detect');
  invalidateRecurringPayments();
  return res;
};

export const confirmRecurringPayment = async (paymentId) => {
  const res = await api.post(`/recurring-payments/${paymentId}/confirm`);
  invalidateRecurringPayments();
  return res;
};

export const dismissRecurringPayment = async (paymentId) => {
  const res = await api.post(`/recurring-payments/${paymentId}/dismiss`);
  invalidateRecurringPayments();
  return res;
};

export const pauseRecurringPayment = async (paymentId) => {
  const res = await api.post(`/recurring-payments/${paymentId}/pause`);
  invalidateRecurringPayments();
  return res;
};

export const resumeRecurringPayment = async (paymentId) => {
  const res = await api.post(`/recurring-payments/${paymentId}/resume`);
  invalidateRecurringPayments();
  return res;
};

export const markRecurringPaymentPaid = async (paymentId, payload) => {
  const res = await api.post(`/recurring-payments/${paymentId}/mark-paid`, payload);
  invalidateRecurringPayments();
  return res;
};

export const updateRecurringUpiConfig = async (paymentId, payload) => {
  const res = await api.patch(`/recurring-payments/${paymentId}/upi-config`, payload);
  invalidateRecurringPayments();
  return res;
};

export const getRecurringUpiIntent = async (paymentId) => {
  return api.get(`/recurring-payments/${paymentId}/upi-intent`);
};

export default api;


