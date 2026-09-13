import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee,
  ReceiptText,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Activity,
  Lightbulb,
  ArrowRight,
  PlusCircle,
  Tag,
  BarChart3,
  Users,
  Cpu,
  Zap,
  Upload,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import TransactionList from '../components/TransactionList';
import AIInsights from '../components/AIInsights';
import CategoryChart from '../components/CategoryChart';
import SpendingChart from '../components/SpendingChart';
import Spinner from '../components/Spinner';
import { healthCheck, getUserMlProfile, processUserMl } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { formatCurrency } from '../utils/constants';

/* ── AI Model definitions (static metadata) ── */
const AI_MODELS = [
  {
    icon: Tag,
    color: 'purple',
    name: 'Expense Classification',
    desc: 'Predicts the category of a transaction using TF-IDF text analysis.',
    to: '/add-expense',
  },
  {
    icon: AlertTriangle,
    color: 'red',
    name: 'Anomaly Detection',
    desc: 'Detects unusual transaction behavior using Isolation Forest.',
    to: '/add-expense',
  },
  {
    icon: Users,
    color: 'blue',
    name: 'Spending Behavior',
    desc: 'Groups customers by spending patterns using KMeans clustering.',
    to: '/spending-analysis',
  },
  {
    icon: TrendingUp,
    color: 'green',
    name: 'Expense Forecasting',
    desc: 'Predicts the next observed expense using gradient-boosted regression.',
    to: '/forecast',
  },
];

export default function Dashboard() {
  const [health, setHealth]               = useState(null);
  const [transactions, setTransactions]   = useState([]);
  const [mlProfile, setMlProfile]         = useState(null);
  const [loading, setLoading]             = useState(true);
  const [mlProcessing, setMlProcessing]   = useState(false);
  const [mlStatusMessage, setMlStatusMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [txs, profRes] = await Promise.all([
        fetchTransactions({ limit: 500 }),
        getUserMlProfile().catch(() => ({ data: { profile: null } })),
      ]);
      setTransactions(txs || []);
      setMlProfile(profRes?.data?.profile || null);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    healthCheck()
      .then((res) => setHealth(res.data))
      .catch(() => setHealth(null));

    loadData();
  }, [loadData]);

  const handleRunMl = async () => {
    setMlProcessing(true);
    setMlStatusMessage('Analyzing your transactions with AI models…');
    try {
      const res = await processUserMl(false);
      setMlStatusMessage(`Analysis complete: ${res.data.processed_transactions} transactions analyzed.`);
      await loadData();
      setTimeout(() => setMlStatusMessage(''), 4000);
    } catch (err) {
      console.error('ML processing failed:', err);
      setMlStatusMessage('Some insights could not be calculated. Your transactions are still safely stored.');
      setTimeout(() => setMlStatusMessage(''), 5000);
    } finally {
      setMlProcessing(false);
    }
  };

  // Derive genuine data-driven stats
  const debitTxs   = transactions.filter((t) => (t.transaction_type || 'debit').toLowerCase() === 'debit');
  const creditTxs  = transactions.filter((t) => (t.transaction_type || '').toLowerCase() === 'credit');

  const totalSpend  = debitTxs.reduce((s, t) => s + (t.amount || 0), 0);
  const totalIncome = creditTxs.reduce((s, t) => s + (t.amount || 0), 0);
  const avgExpense  = debitTxs.length > 0 ? totalSpend / debitTxs.length : 0;
  const anomalyCount = transactions.filter((t) => t.is_anomaly).length;

  // Category counts
  const categoryMap = {};
  debitTxs.forEach((t) => {
    const cat = t.category || 'Uncategorized';
    categoryMap[cat] = (categoryMap[cat] || 0) + t.amount;
  });
  const topCategoryEntry = Object.entries(categoryMap).sort((a, b) => b[1] - a[1])[0];
  const topCategory = topCategoryEntry ? topCategoryEntry[0] : 'None';

  const isOnline     = health?.status === 'healthy';
  const hasData      = transactions.length > 0;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your AI-powered financial overview.</p>
        </div>
        <div className="page-header-actions">
          <div className={`status-pill ${isOnline ? 'status-pill--ok' : 'status-pill--err'}`}>
            {isOnline
              ? <><CheckCircle2 size={12} /> Backend Online</>
              : <><XCircle size={12} /> Backend Offline</>}
          </div>
          {hasData && (
            <button
              className="btn-secondary btn-sm"
              onClick={handleRunMl}
              disabled={mlProcessing}
              title="Run AI models on your transactions"
            >
              <RefreshCw size={13} className={mlProcessing ? 'spin' : ''} />
              {mlProcessing ? 'Analyzing…' : 'Run AI Analysis'}
            </button>
          )}
          <Link to="/import-transactions" className="btn-primary btn-sm">
            <Upload size={14} /> Import
          </Link>
          <Link to="/add-expense" className="btn-secondary btn-sm">
            <PlusCircle size={14} /> Add Expense
          </Link>
        </div>
      </div>

      {/* ML Status banner */}
      {mlStatusMessage && (
        <div className="ml-status-banner" style={{
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: mlProcessing ? 'rgba(99, 102, 241, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          border: `1px solid ${mlProcessing ? 'rgba(99, 102, 241, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
          color: mlProcessing ? '#818cf8' : '#4ade80',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {mlProcessing ? <Spinner /> : <Sparkles size={16} />}
          <span>{mlStatusMessage}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="dashboard-loading">
          <Spinner />
          <p>Loading your transactions…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && (
        <Card className="dashboard-empty">
          <ReceiptText size={48} className="dashboard-empty-icon" />
          <h2 className="dashboard-empty-title">No transactions yet</h2>
          <p className="dashboard-empty-sub">
            Import your bank statement to get started — or add expenses manually.
          </p>
          <div className="dashboard-empty-actions">
            <Link to="/import-transactions" className="btn-primary">
              <Upload size={16} /> Import Bank Statement
            </Link>
            <Link to="/add-expense" className="btn-secondary">
              <PlusCircle size={16} /> Add Expense Manually
            </Link>
          </div>
        </Card>
      )}

      {/* Dashboard content — only when data exists */}
      {!loading && hasData && (
        <>
          {/* ── Summary Stats ── */}
          <div className="stats-grid">
            <StatCard icon={IndianRupee} label="Total Expenses" value={formatCurrency(totalSpend)}
              sub={`${debitTxs.length} debit${debitTxs.length !== 1 ? 's' : ''} (Top: ${topCategory})`} color="purple" />
            <StatCard icon={TrendingUp} label="Average Expense"
              value={formatCurrency(avgExpense)} sub="Per debit transaction" color="blue" />
            <StatCard icon={ReceiptText} label="Transactions"
              value={transactions.length.toString()}
              sub={totalIncome > 0 ? `Income: ${formatCurrency(totalIncome)}` : 'Stored in Supabase'} color="green" />
            <StatCard icon={AlertTriangle} label="Anomalies Detected"
              value={anomalyCount.toString()} sub="Flagged by Isolation Forest"
              color={anomalyCount > 0 ? 'red' : 'amber'} />
          </div>

          {/* ── AI Spending Profile Highlight Card ── */}
          {mlProfile && (mlProfile.cluster_label || mlProfile.forecasted_amount !== null) && (
            <Card style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.6), rgba(15, 23, 42, 0.8))', border: '1px solid rgba(129, 140, 248, 0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
                    <Sparkles size={22} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 600 }}>
                      AI Profile: {mlProfile.cluster_label || 'Analyzed'}
                    </span>
                    <h3 style={{ margin: '0.2rem 0', fontSize: '1.05rem', color: '#f8fafc' }}>
                      {mlProfile.cluster_description || 'Active financial pattern tracking'}
                    </h3>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  {mlProfile.forecasted_amount !== null && mlProfile.forecasted_amount !== undefined && (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Predicted Next Expense</span>
                      <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
                        {formatCurrency(mlProfile.forecasted_amount)}
                      </p>
                    </div>
                  )}
                  <Link to="/spending-analysis" className="btn-secondary btn-sm">
                    View Analysis <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {/* ── Charts Row ── */}
          <div className="charts-row">
            <Card className="chart-card">
              <div className="card-title-row">
                <Activity size={15} />
                <h2 className="card-title">Spending Overview</h2>
              </div>
              <SpendingChart transactions={transactions} />
            </Card>
            <Card className="chart-card chart-card--narrow">
              <div className="card-title-row">
                <ReceiptText size={15} />
                <h2 className="card-title">Expense Categories</h2>
              </div>
              <CategoryChart transactions={transactions} />
            </Card>
          </div>

          {/* ── AI Intelligence Section ── */}
          <div className="section-heading">
            <Cpu size={15} />
            <h2>AI Intelligence</h2>
          </div>
          <div className="ai-models-grid">
            {AI_MODELS.map((model) => (
              <Link to={model.to} key={model.name} className={`ai-model-card ai-model-card--${model.color}`}>
                <div className="ai-model-card-top">
                  <div className={`ai-model-icon ai-model-icon--${model.color}`}>
                    <model.icon size={20} />
                  </div>
                  <span className="ai-model-status">
                    <Zap size={10} /> Active
                  </span>
                </div>
                <h3 className="ai-model-name">{model.name}</h3>
                <p className="ai-model-desc">{model.desc}</p>
                <div className="ai-model-action">
                  Try now <ArrowRight size={13} />
                </div>
              </Link>
            ))}
          </div>

          {/* ── Bottom Row ── */}
          <div className="dashboard-bottom">
            {/* Recent Transactions */}
            <Card>
              <div className="card-header-row">
                <div className="card-title-row">
                  <ReceiptText size={15} />
                  <h2 className="card-title">Recent Transactions</h2>
                </div>
                <Link to="/import-transactions" className="card-link">
                  Import more <ArrowRight size={12} />
                </Link>
              </div>
              <TransactionList transactions={transactions} limit={6} />
            </Card>

            {/* Right column */}
            <div className="dashboard-right-col">
              {/* AI Insights */}
              <Card>
                <div className="card-title-row">
                  <Lightbulb size={15} />
                  <h2 className="card-title">AI Insights</h2>
                </div>
                <AIInsights transactions={transactions} />
              </Card>

              {/* Anomaly Highlight */}
              {anomalyCount > 0 && (
                <Card className="anomaly-highlight-card">
                  <div className="anomaly-highlight-header">
                    <AlertTriangle size={15} />
                    <h2 className="card-title">Suspicious Transactions ({anomalyCount})</h2>
                  </div>
                  <p className="anomaly-highlight-note">
                    AI detected unusual transaction behavior. These are not confirmed as fraud — please review manually.
                  </p>
                  <div className="anomaly-tx-list">
                    {transactions.filter((t) => t.is_anomaly).slice(0, 4).map((t) => (
                      <div key={t.id} className="anomaly-tx-row">
                        <div>
                          <p className="anomaly-tx-desc">{t.description}</p>
                          <p className="anomaly-tx-meta">
                            {t.category} ·{' '}
                            {new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </p>
                        </div>
                        <p className="anomaly-tx-amount">{formatCurrency(t.amount)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Backend Model Status */}
              {health && (
                <Card>
                  <div className="card-title-row">
                    <Cpu size={15} />
                    <h2 className="card-title">Model Status</h2>
                  </div>
                  <div className="model-status-grid">
                    {Object.entries(health.services).map(([name, loaded]) => (
                      <div key={name} className="model-status-item">
                        {loaded
                          ? <CheckCircle2 size={13} className="model-status-ok" />
                          : <XCircle size={13} className="model-status-err" />}
                        <span className="model-status-name">
                          {name.charAt(0).toUpperCase() + name.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

