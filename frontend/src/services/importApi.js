import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const importApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach Supabase access token to every request
importApi.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

/**
 * Upload a file for parsing. Returns { columns, preview_rows, auto_mapping,
 * mapping_confident, total_rows, sheet_names, selected_sheet, source }.
 */
export async function parseFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('file_type', 'auto');

  const { data } = await importApi.post('/import/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: () => {},   // caller can intercept if needed
  });
  return data;
}

/**
 * Re-parse an Excel file with a specific sheet selected.
 */
export async function parseExcelSheet(file, sheetName) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sheet_name', sheetName);
  formData.append('file_type', 'excel');

  const { data } = await importApi.post('/import/parse-sheet', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * Confirm an import: normalize, deduplicate, ML, save to Supabase.
 * Server derives owner user_id from authenticated Bearer token.
 * Returns { import_id, total_rows, successful_rows, duplicate_rows, failed_rows, error_summary }
 */
export async function confirmImport({ userId, rows, mapping, source, filename, fileType }) {
  const { data } = await importApi.post('/import/confirm', {
    user_id:   userId,
    rows,
    mapping,
    source,
    filename,
    file_type: fileType,
  });
  return data;
}

/**
 * Fetch import history for the authenticated user.
 * Server derives user identity securely from Bearer token.
 */
export async function getImportHistory(_userId) {
  // The server derives user identity securely from the authenticated Bearer token
  const { data } = await importApi.get('/import/history');
  return data.imports || [];
}

