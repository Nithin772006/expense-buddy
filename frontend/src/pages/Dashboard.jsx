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
  CalendarClock,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import TransactionList from '../components/TransactionList';
import AIInsights from '../components/AIInsights';
import CategoryChart from '../components/CategoryChart';
import SpendingChart from '../components/SpendingChart';
import Spinner from '../components/Spinner';
import { healthCheck, getUserMlProfile, processUserMl, getRecurringPayments } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { formatCurrency } from '../utils/constants';

/* ── AI Model definitions (static metadata) ── */
const AI_MODELS = [
  {
    icon: Tag,
    color: 'green',
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
  const [recurringData, setRecurringData] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [mlProcessing, setMlProcessing]   = useState(false);
  const [mlStatusMessage, setMlStatusMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [txs, profRes, recRes] = await Promise.all([
        fetchTransactions({ limit: 500 }),
        getUserMlProfile().catch(() => ({ data: { profile: null } })),
        getRecurringPayments().catch(() => ({ data: null })),
      ]);
      setTransactions(txs || []);
      setMlProfile(profRes?.data?.profile || null);
      setRecurringData(recRes?.data || null);
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

    // Listen for AI analysis trigger from top navigation
    const handleMlCompleted = () => loadData();
    window.addEventListener('eb:ml-completed', handleMlCompleted);
    return () => window.removeEventListener('eb:ml-completed', handleMlCompleted);
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

  const isOnline = health?.status === 'healthy';
  const hasData  = transactions.length > 0;

  // Time-aware greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Recurring preview items
  const confirmedPayments = recurringData?.recurring_payments || [];

  return (
    <div className="page">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting}.</h1>
          <p className="page-subtitle">Your financial world, intelligently organized.</p>
        </div>
        <div className="page-header-actions">
          <div className={`status-pill ${isOnline ? 'status-pill--ok' : 'status-pill--err'}`}>
            {isOnline
              ? <><CheckCircle2 size={13} /> Backend Online</>
              : <><XCircle size={13} /> Backend Offline</>}
          </div>

          {hasData && (
            <button
              className="btn-secondary btn-sm"
              onClick={handleRunMl}
              disabled={mlProcessing}
              title="Run AI models on your transactions"
            >
              <RefreshCw size={13} className={mlProcessing ? 'eb-spin' : ''} />
              {mlProcessing ? 'Analyzing…' : 'Run AI Analysis'}
            </button>
          )}

          <Link to="/import-transactions" className="btn-secondary btn-sm">
            <Upload size={14} /> Import
          </Link>
          <Link to="/add-expense" className="btn-primary btn-sm">
            <PlusCircle size={14} /> Add Expense
          </Link>
        </div>
      </div>

      {/* ML Status banner */}
      {mlStatusMessage && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            background: mlProcessing ? 'rgba(82, 183, 136, 0.12)' : 'rgba(216, 243, 220, 0.9)',
            border: `1px solid ${mlProcessing ? 'rgba(82, 183, 136, 0.35)' : 'rgba(45, 106, 79, 0.3)'}`,
            color: mlProcessing ? 'var(--eb-forest)' : '#1b4332',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            boxShadow: '0 2px 8px rgba(13, 38, 28, 0.04)',
          }}
        >
          {mlProcessing ? <Spinner size={16} /> : <Sparkles size={16} color="#2d6a4f" />}
          <span>{mlStatusMessage}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="dashboard-loading">
          <Spinner />
          <p>Loading your financial workspace…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && (
        <Card className="dashboard-empty">
          <ReceiptText size={48} className="dashboard-empty-icon" />
          <h2 className="dashboard-empty-title">No transactions yet</h2>
          <p className="dashboard-empty-sub">
            Start tracking your spending to unlock Expense Buddy's financial intelligence.
          </p>
          <div className="dashboard-empty-actions">
            <Link to="/import-transactions" className="btn-primary">
              <Upload size={16} /> Import Bank Statement
            </Link>
            <Link to="/add-expense" className="btn-secondary">
              <PlusCircle size={16} /> Add Your First Expense
            </Link>
          </div>
        </Card>
      )}

      {/* Dashboard content */}
      {!loading && hasData && (
        <>
          {/* ── Summary Key Metric Cards ── */}
          <div className="stats-grid">
            <StatCard
              icon={IndianRupee}
              label="Total Expenses"
              value={formatCurrency(totalSpend)}
              sub={`${debitTxs.length} debit transaction${debitTxs.length !== 1 ? 's' : ''} (Top: ${topCategory})`}
              color="green"
            />
            <StatCard
              icon={TrendingUp}
              label="Average Expense"
              value={formatCurrency(avgExpense)}
              sub="Per debit transaction"
              color="blue"
            />
            <StatCard
              icon={ReceiptText}
              label="Transactions"
              value={transactions.length.toString()}
              sub={totalIncome > 0 ? `Income: ${formatCurrency(totalIncome)}` : 'Securely recorded'}
              color="green"
            />
            <StatCard
              icon={AlertTriangle}
              label="Anomalies Detected"
              value={anomalyCount.toString()}
              sub={anomalyCount > 0 ? 'Flagged by Isolation Forest' : 'All patterns healthy'}
              color={anomalyCount > 0 ? 'red' : 'green'}
            />
          </div>

          {/* ── AI Financial Insight Banner ── */}
          <Card
            style={{
              marginBottom: '1.5rem',
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, rgba(234, 245, 238, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%)',
              border: '1px solid rgba(82, 183, 136, 0.35)',
              boxShadow: '0 8px 24px rgba(45, 106, 79, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 3px 10px rgba(45, 106, 79, 0.25)',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2d6a4f', fontWeight: 800 }}>
                      AI Financial Insight
                    </span>
                    {mlProfile?.cluster_label && (
                      <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: '999px', background: '#d8f3dc', color: '#1b4332', fontWeight: 700 }}>
                        {mlProfile.cluster_label}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.05rem', color: '#132e22', fontWeight: 700 }}>
                    {mlProfile?.cluster_description || `Your highest spending category is ${topCategory}. All transactions are mapped to AI behavior models.`}
                  </h3>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                {mlProfile?.forecasted_amount !== null && mlProfile?.forecasted_amount !== undefined && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#688a77', fontWeight: 600 }}>Next Expense Forecast</span>
                    <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1b4332' }}>
                      {formatCurrency(mlProfile.forecasted_amount)}
                    </p>
                  </div>
                )}
                <Link to="/spending-analysis" className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  View Analysis <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </Card>

          {/* ── Quick Actions Ribbon ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <Link to="/add-expense" className="btn-secondary" style={{ padding: '12px 16px', justifyContent: 'flex-start', background: '#ffffff' }}>
              <PlusCircle size={16} style={{ color: '#2d6a4f' }} />
              <span>Add Expense</span>
            </Link>
            <Link to="/import-transactions" className="btn-secondary" style={{ padding: '12px 16px', justifyContent: 'flex-start', background: '#ffffff' }}>
              <Upload size={16} style={{ color: '#2d6a4f' }} />
              <span>Import Transactions</span>
            </Link>
            <Link to="/spending-analysis" className="btn-secondary" style={{ padding: '12px 16px', justifyContent: 'flex-start', background: '#ffffff' }}>
              <BarChart3 size={16} style={{ color: '#2d6a4f' }} />
              <span>Spending Analysis</span>
            </Link>
            <Link to="/forecast" className="btn-secondary" style={{ padding: '12px 16px', justifyContent: 'flex-start', background: '#ffffff' }}>
              <TrendingUp size={16} style={{ color: '#2d6a4f' }} />
              <span>View Forecast</span>
            </Link>
          </div>

          {/* ── Charts Row: Spending Overview + Expense Categories ── */}
          <div className="charts-row">
            <Card className="chart-card">
              <div className="card-title-row">
                <Activity size={16} />
                <h2 className="card-title">Spending Overview</h2>
              </div>
              <SpendingChart transactions={transactions} />
            </Card>

            <Card className="chart-card chart-card--narrow">
              <div className="card-title-row">
                <ReceiptText size={16} />
                <h2 className="card-title">Expense Categories</h2>
              </div>
              <CategoryChart transactions={transactions} />
            </Card>
          </div>

          {/* ── Smart Recurring Payments Preview (Signature Feature) ── */}
          {confirmedPayments.length > 0 && (
            <Card style={{ marginBottom: '24px', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CalendarClock size={18} style={{ color: '#2d6a4f' }} />
                  <h2 className="card-title">Smart Recurring Commitments</h2>
                </div>
                <Link to="/recurring-payments" className="card-link">
                  Manage All Commitments <ArrowRight size={13} />
                </Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {confirmedPayments.slice(0, 3).map((p) => {
                  const isDueSoon = p.current_cycle_status === 'due_soon' || p.current_cycle_status === 'due_today';
                  const isOverdue = p.current_cycle_status === 'overdue';
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '14px',
                        background: '#ffffff',
                        border: '1px solid rgba(82, 183, 136, 0.22)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 2px 8px rgba(13, 38, 28, 0.03)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#132e22' }}>
                          {p.merchant}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#688a77', marginTop: '2px' }}>
                          {p.category} • <span style={{ textTransform: 'capitalize' }}>{p.frequency}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1b4332' }}>
                          {formatCurrency(p.average_amount)}
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            display: 'inline-block',
                            marginTop: '3px',
                            background: p.is_paid
                              ? '#d8f3dc'
                              : isOverdue
                              ? '#fee2e2'
                              : isDueSoon
                              ? '#fef3c7'
                              : '#eaf5ee',
                            color: p.is_paid
                              ? '#1b4332'
                              : isOverdue
                              ? '#b91c1c'
                              : isDueSoon
                              ? '#b45309'
                              : '#2d6a4f',
                          }}
                        >
                          {p.is_paid ? 'PAID' : (p.current_cycle_status || 'UPCOMING').toUpperCase().replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── AI Intelligence Models Grid ── */}
          <div className="section-heading">
            <Cpu size={16} />
            <h2>AI Intelligence Models</h2>
          </div>
          <div className="ai-models-grid">
            {AI_MODELS.map((model) => (
              <Link to={model.to} key={model.name} className="ai-model-card">
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
                  Explore <ChevronRight size={13} />
                </div>
              </Link>
            ))}
          </div>

          {/* ── Bottom Row: Recent Transactions + AI Insights ── */}
          <div className="dashboard-bottom">
            {/* Recent Transactions */}
            <Card>
              <div className="card-header-row">
                <div className="card-title-row">
                  <ReceiptText size={16} />
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
                  <Lightbulb size={16} />
                  <h2 className="card-title">AI Insights</h2>
                </div>
                <AIInsights transactions={transactions} />
              </Card>

              {/* Anomaly Highlight if any */}
              {anomalyCount > 0 && (
                <Card className="anomaly-highlight-card">
                  <div className="anomaly-highlight-header">
                    <AlertTriangle size={16} />
                    <h2 className="card-title" style={{ color: '#dc2626' }}>
                      Suspicious Transactions ({anomalyCount})
                    </h2>
                  </div>
                  <p className="anomaly-highlight-note">
                    AI detected unusual transaction behavior via Isolation Forest. These are not confirmed fraud — please review carefully.
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
                    <Cpu size={16} />
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
