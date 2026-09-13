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

export default api;

