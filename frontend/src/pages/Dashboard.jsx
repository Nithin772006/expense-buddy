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
import { processUserMl } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import {
  getCachedHealth,
  getCachedMlProfile,
  getCachedRecurringPayments,
} from '../services/queryCache';
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

  const loadData = useCallback(async (force = false) => {
    try {
      const [hData, txs, profData, recData] = await Promise.all([
        getCachedHealth(force).catch(() => null),
        fetchTransactions({ limit: 500, force }).catch(() => []),
        getCachedMlProfile(force).catch(() => null),
        getCachedRecurringPayments(force).catch(() => null),
      ]);
      setHealth(hData);
      setTransactions(txs || []);
      setMlProfile(profData || null);
      setRecurringData(recData || null);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);

    // Listen for AI analysis trigger and transaction updates
    const handleRefresh = () => loadData(true);
    window.addEventListener('eb:ml-completed', handleRefresh);
    window.addEventListener('eb:transactions-updated', handleRefresh);
    return () => {
      window.removeEventListener('eb:ml-completed', handleRefresh);
      window.removeEventListener('eb:transactions-updated', handleRefresh);
    };
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
    <div className="page dashboard-page">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-title-block">
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
              className="btn-secondary"
              onClick={handleRunMl}
              disabled={mlProcessing}
              title="Run AI models on your transactions"
            >
              <RefreshCw size={13} className={mlProcessing ? 'eb-spin' : ''} />
              {mlProcessing ? 'Analyzing…' : 'Run AI Analysis'}
            </button>
          )}

          <Link to="/import-transactions" className="btn-secondary">
            <Upload size={14} /> Import
          </Link>
          <Link to="/add-expense" className="btn-primary">
            <PlusCircle size={14} /> Add Expense
          </Link>
        </div>
      </div>

      {/* ML Status banner */}
      {mlStatusMessage && (
        <div className="eb-ml-status-banner">
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
              color="emerald"
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

          {/* ── Quick Actions Ribbon ── */}
          <div className="quick-actions-grid">
            <Link to="/add-expense" className="quick-action-btn">
              <PlusCircle size={16} className="quick-action-icon" />
              <span>Add Expense</span>
            </Link>
            <Link to="/import-transactions" className="quick-action-btn">
              <Upload size={16} className="quick-action-icon" />
              <span>Import Transactions</span>
            </Link>
            <Link to="/spending-analysis" className="quick-action-btn">
              <BarChart3 size={16} className="quick-action-icon" />
              <span>Spending Analysis</span>
            </Link>
            <Link to="/forecast" className="quick-action-btn">
              <TrendingUp size={16} className="quick-action-icon" />
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

            <Card className="chart-card chart-card--category">
              <div className="card-title-row">
                <ReceiptText size={16} />
                <h2 className="card-title">Expense Categories</h2>
              </div>
              <CategoryChart transactions={transactions} />
            </Card>
          </div>

          {/* ── Smart Recurring Payments Preview (Signature Feature) ── */}
          {confirmedPayments.length > 0 && (
            <Card className="recurring-preview-card">
              <div className="card-header-row">
                <div className="card-title-row">
                  <CalendarClock size={18} />
                  <h2 className="card-title">Smart Recurring Commitments</h2>
                </div>
                <Link to="/recurring-payments" className="card-link">
                  Manage All Commitments <ArrowRight size={13} />
                </Link>
              </div>

              <div className="recurring-preview-grid">
                {confirmedPayments.slice(0, 3).map((p) => {
                  const isDueSoon = p.current_cycle_status === 'due_soon' || p.current_cycle_status === 'due_today';
                  const isOverdue = p.current_cycle_status === 'overdue';
                  return (
                    <div key={p.id} className="recurring-item-card">
                      <div>
                        <div className="recurring-merchant-name">
                          {p.merchant}
                        </div>
                        <div className="recurring-meta-sub">
                          {p.category} • <span style={{ textTransform: 'capitalize' }}>{p.frequency}</span>
                        </div>
                      </div>
                      <div className="recurring-item-right">
                        <div className="recurring-amount">
                          {formatCurrency(p.average_amount)}
                        </div>
                        <span
                          className={`recurring-badge ${
                            p.is_paid
                              ? 'recurring-badge--paid'
                              : isOverdue
                              ? 'recurring-badge--overdue'
                              : isDueSoon
                              ? 'recurring-badge--due'
                              : 'recurring-badge--upcoming'
                          }`}
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
