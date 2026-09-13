import React, { useEffect, useState } from 'react';
import Card from '../components/Card';
import { Settings2, Info, Trash2, CheckCircle2, XCircle, Wifi, WifiOff, Cpu } from 'lucide-react';
import { clearTransactions, getTransactions } from '../utils/storage';
import { healthCheck } from '../services/api';
import { fetchTransactions, deleteUserTransactions } from '../services/transactionService';
import { supabase } from '../lib/supabaseClient';

export default function Settings() {
  const apiUrl = import.meta.env.VITE_API_URL || 'Not configured';
  const [currentUser, setCurrentUser] = useState(null);
  const [txCount, setTxCount] = useState(0);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [cleared, setCleared] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
      if (user) {
        fetchTransactions({ limit: 1000 })
          .then((txs) => setTxCount(txs.length))
          .catch(() => setTxCount(getTransactions(user.id).length))
          .finally(() => setLoadingTxs(false));
      } else {
        setLoadingTxs(false);
      }
    });

    healthCheck()
      .then((r) => setHealth(r.data))
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, []);

  const handleClear = async () => {
    if (window.confirm(`Delete all ${txCount} transaction(s) for your account from Supabase? This cannot be undone.`)) {
      try {
        await deleteUserTransactions();
        if (currentUser) clearTransactions(currentUser.id);
        setTxCount(0);
        setCleared(true);
      } catch (err) {
        alert('Failed to delete transactions: ' + (err.message || err));
      }
    }
  };

  const isOnline = health?.status === 'healthy';
  const modelsLoaded = health
    ? Object.values(health.services).filter(Boolean).length
    : 0;
  const totalModels = health ? Object.keys(health.services).length : 4;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Backend status, API configuration, and data management.</p>
        </div>
      </div>

      {/* ── Status Row ── */}
      <div className="settings-status-row">
        {/* Backend status */}
        <Card className="settings-status-card">
          <div className="settings-status-icon-wrap">
            {healthLoading
              ? <div className="spinner spinner--sm" />
              : isOnline
                ? <Wifi size={22} className="settings-status-icon settings-status-icon--ok" />
                : <WifiOff size={22} className="settings-status-icon settings-status-icon--err" />}
          </div>
          <div>
            <p className="settings-status-label">Backend</p>
            <p className={`settings-status-value ${isOnline ? 'text-green' : 'text-red'}`}>
              {healthLoading ? 'Checking…' : isOnline ? '● Connected' : '● Offline'}
            </p>
            <p className="settings-status-sub">{apiUrl}</p>
          </div>
        </Card>

        {/* ML Models */}
        <Card className="settings-status-card">
          <div className="settings-status-icon-wrap">
            <Cpu size={22} className="settings-status-icon settings-status-icon--purple" />
          </div>
          <div>
            <p className="settings-status-label">ML Models</p>
            <p className={`settings-status-value ${modelsLoaded === totalModels ? 'text-green' : 'text-red'}`}>
              ● {healthLoading ? 'Checking…' : `${modelsLoaded}/${totalModels} Loaded`}
            </p>
            <p className="settings-status-sub">scikit-learn models</p>
          </div>
        </Card>

        {/* Supabase Cloud Data */}
        <Card className="settings-status-card">
          <div className="settings-status-icon-wrap">
            <CheckCircle2 size={22} className="settings-status-icon settings-status-icon--blue" />
          </div>
          <div>
            <p className="settings-status-label">Supabase Cloud Data</p>
            <p className="settings-status-value text-blue">
              {loadingTxs ? '● Loading…' : `● ${txCount} Transaction${txCount !== 1 ? 's' : ''}`}
            </p>
            <p className="settings-status-sub">{currentUser?.email || 'Authenticated User'}</p>
          </div>
        </Card>
      </div>

      {/* ── Model Detail ── */}
      {health && (
        <Card className="settings-models-card">
          <div className="card-title-row">
            <Cpu size={16} />
            <h2 className="card-title">Model Status</h2>
          </div>
          <div className="settings-model-grid">
            {Object.entries(health.services).map(([name, loaded]) => (
              <div key={name} className="settings-model-row">
                {loaded
                  ? <CheckCircle2 size={15} className="model-status-ok" />
                  : <XCircle size={15} className="model-status-err" />}
                <div>
                  <p className="settings-model-name">{name.charAt(0).toUpperCase() + name.slice(1)}</p>
                  <p className="settings-model-status">{loaded ? 'Active' : 'Not loaded'}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="settings-grid">
        {/* API Config */}
        <Card>
          <div className="card-title-row">
            <Settings2 size={16} />
            <h2 className="card-title">API Configuration</h2>
          </div>
          <div className="settings-item">
            <span className="settings-key">Backend URL</span>
            <code className="settings-val">{apiUrl}</code>
          </div>
          <div className="settings-item">
            <span className="settings-key">Swagger UI</span>
            <a href={`${apiUrl}/docs`} target="_blank" rel="noreferrer" className="settings-link">
              {apiUrl}/docs ↗
            </a>
          </div>
          <div className="settings-item">
            <span className="settings-key">Health Endpoint</span>
            <a href={`${apiUrl}/health`} target="_blank" rel="noreferrer" className="settings-link">
              {apiUrl}/health ↗
            </a>
          </div>
          <p className="settings-note">
            Change the backend URL by updating <code>VITE_API_URL</code> in <code>.env</code> and restarting the dev server.
          </p>
        </Card>

        {/* About */}
        <Card>
          <div className="card-title-row">
            <Info size={16} />
            <h2 className="card-title">About Expense Buddy</h2>
          </div>
          <div className="settings-item"><span className="settings-key">Version</span><span className="settings-val">1.0.0</span></div>
          <div className="settings-item"><span className="settings-key">Frontend</span><span className="settings-val">React 19 + Vite 8</span></div>
          <div className="settings-item"><span className="settings-key">Backend</span><span className="settings-val">FastAPI + scikit-learn</span></div>
          <div className="settings-item"><span className="settings-key">Charts</span><span className="settings-val">Recharts</span></div>
          <div className="settings-item"><span className="settings-key">Storage</span><span className="settings-val">Supabase PostgreSQL (Cloud)</span></div>
        </Card>

        {/* Data Management */}
        <Card>
          <div className="card-title-row">
            <Trash2 size={16} />
            <h2 className="card-title">Data Management</h2>
          </div>
          <div className="settings-item">
            <span className="settings-key">Account Email</span>
            <span className="settings-val">{currentUser?.email || '—'}</span>
          </div>
          <div className="settings-item">
            <span className="settings-key">User ID</span>
            <code className="settings-val" style={{ fontSize: '0.75rem' }}>{currentUser?.id || '—'}</code>
          </div>
          <div className="settings-item">
            <span className="settings-key">Cloud Transactions</span>
            <span className="settings-val">{loadingTxs ? 'Loading…' : txCount}</span>
          </div>
          {cleared ? (
            <div className="settings-cleared">
              <CheckCircle2 size={14} /> All account transactions cleared successfully.
            </div>
          ) : (
            <button className="btn-danger" onClick={handleClear} disabled={loadingTxs || txCount === 0}>
              <Trash2 size={13} /> Delete All My Transactions
            </button>
          )}
          <p className="settings-note">
            Permanently deletes all transactions belonging to your account from Supabase and local cache. Other users' data is unaffected.
          </p>
        </Card>
      </div>
    </div>
  );
}
