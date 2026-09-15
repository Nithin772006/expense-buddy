import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import CategoryChart from '../components/CategoryChart';
import { getUserMlProfile } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { CLUSTER_LABELS, formatCurrency } from '../utils/constants';
import {
  Users,
  BarChart3,
  CheckCircle2,
  IndianRupee,
  AlertTriangle,
  ArrowRight,
  Upload,
  PlusCircle,
  Sparkles,
  Layers,
} from 'lucide-react';

const CLUSTER_COLORS = ['green', 'blue', 'amber', 'purple', 'red'];

export default function SpendingAnalysis() {
  const [storedTxs, setStoredTxs] = useState([]);
  const [mlProfile, setMlProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchTransactions({ limit: 500 }),
      getUserMlProfile().catch(() => ({ data: { profile: null } })),
    ]).then(([txs, profRes]) => {
      setStoredTxs(txs || []);
      setMlProfile(profRes?.data?.profile || null);
      setLoading(false);
    });
  }, []);

  const clusterId = mlProfile?.cluster !== undefined && mlProfile?.cluster !== null ? mlProfile.cluster : null;
  const clusterInfo = clusterId !== null ? CLUSTER_LABELS[clusterId] : null;
  const clusterColor = clusterId !== null ? CLUSTER_COLORS[clusterId] || 'green' : 'green';

  const debitTxs = storedTxs.filter((t) => (t.transaction_type || 'debit').toLowerCase() === 'debit');
  const totalAmount = debitTxs.reduce((s, t) => s + (t.amount || 0), 0);
  const avgAmount = debitTxs.length > 0 ? totalAmount / debitTxs.length : 0;

  const catCounts = {};
  debitTxs.forEach((t) => {
    const c = t.category || 'Uncategorized';
    catCounts[c] = (catCounts[c] || 0) + t.amount;
  });
  const sortedCategories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const secondCategory = sortedCategories[1];

  const anomalyCount = debitTxs.filter((t) => t.is_anomaly).length;
  const hasData = debitTxs.length > 0;

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Spending Analysis</h1>
            <p className="page-subtitle">Identify your customer behavior segment using AI clustering.</p>
          </div>
        </div>
        <div className="dashboard-loading">
          <Spinner />
          <p>Analyzing spending patterns &amp; clusters…</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Spending Analysis</h1>
            <p className="page-subtitle">Identify your customer behavior segment using AI clustering.</p>
          </div>
        </div>
        <Card className="dashboard-empty">
          <BarChart3 size={48} className="dashboard-empty-icon" />
          <h2 className="dashboard-empty-title">No Data Available</h2>
          <p className="dashboard-empty-sub">
            Add or import transactions to generate your AI-powered spending behavior analysis.
          </p>
          <div className="dashboard-empty-actions">
            <Link to="/import-transactions" className="btn-primary">
              <Upload size={16} /> Import Bank Statement
            </Link>
            <Link to="/add-expense" className="btn-secondary">
              <PlusCircle size={16} /> Add Expense
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Spending Analysis</h1>
          <p className="page-subtitle">Identify your customer behavior segment using unsupervised KMeans clustering.</p>
        </div>
      </div>

      {/* Real transaction intelligence summary ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Total Spending
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#132e22', letterSpacing: '-0.5px' }}>
            {formatCurrency(totalAmount)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>
            {debitTxs.length} expense transaction{debitTxs.length !== 1 ? 's' : ''}
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Average Transaction
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#1d70b8', letterSpacing: '-0.5px' }}>
            {formatCurrency(avgAmount)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>
            Per individual expense
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Top Category
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#2d6a4f', letterSpacing: '-0.5px' }}>
            {topCategory ? topCategory[0] : 'None'}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>
            {topCategory ? formatCurrency(topCategory[1]) : ''}
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Active AI Segment
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#1b4332', letterSpacing: '-0.5px' }}>
            {clusterInfo ? clusterInfo.label : 'Pending Analysis'}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>
            KMeans 5-Cluster Model
          </span>
        </Card>
      </div>

      <div className="two-col-layout">
        {/* ── Left: Visual Insights ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card>
            <div className="card-title-row">
              <BarChart3 size={18} />
              <h2 className="card-title">Spending by Category</h2>
            </div>
            <CategoryChart transactions={storedTxs} />
          </Card>

          <Card>
            <div className="card-title-row">
              <IndianRupee size={18} />
              <h2 className="card-title">Top Expense Categories</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {sortedCategories.slice(0, 5).map(([cat, amt], idx) => {
                const pct = totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(0) : 0;
                return (
                  <div
                    key={cat}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: '#ffffff',
                      border: '1px solid rgba(82, 183, 136, 0.16)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2d6a4f', width: '20px' }}>
                        #{idx + 1}
                      </span>
                      <span style={{ color: '#132e22', fontSize: '0.95rem', fontWeight: 600 }}>{cat}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: '#1b4332', fontSize: '0.95rem', fontWeight: 800 }}>
                        {formatCurrency(amt)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#688a77', marginLeft: '6px' }}>
                        ({pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {anomalyCount > 0 && (
            <Card style={{ borderLeft: '4px solid #dc2626', background: 'rgba(254, 242, 242, 0.7)' }}>
              <div className="card-title-row" style={{ color: '#dc2626' }}>
                <AlertTriangle size={18} />
                <h2 className="card-title" style={{ color: '#b91c1c' }}>Anomalous Transactions Detected</h2>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#476856', lineHeight: '1.5' }}>
                Our AI anomaly detection model has flagged <strong>{anomalyCount}</strong> unusual transaction{anomalyCount > 1 ? 's' : ''} based on deviation from your median spending.
              </p>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', color: '#2d6a4f', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 700 }}>
                Review on Dashboard <ArrowRight size={14} />
              </Link>
            </Card>
          )}
        </div>

        {/* ── Right: Cluster Result ── */}
        <div className="results-col">
          {clusterInfo ? (
            <Card className="cluster-result-card">
              <div className="cluster-result-header">
                <span className="cluster-badge">
                  Cluster {clusterId}
                </span>
                <span className="cluster-active-badge">
                  <CheckCircle2 size={12} /> Model Active
                </span>
              </div>

              <div className="cluster-icon-wrap">
                <Users size={30} />
              </div>

              <div className="cluster-label-section">
                <p className="cluster-eyebrow">Your Spending Behavior</p>
                <h2 className="cluster-label">{clusterInfo.label}</h2>
              </div>

              <p className="cluster-desc">{clusterInfo.description}</p>

              <div className="cluster-reference">
                <p className="cluster-reference-title">Cluster Reference</p>
                {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
                  <div
                    key={k}
                    className={`cluster-ref-row ${parseInt(k) === clusterId ? 'cluster-ref-row--active' : ''}`}
                  >
                    <span className="cluster-ref-num">C{k}</span>
                    <span className="cluster-ref-name">{v.label}</span>
                    {parseInt(k) === clusterId && (
                      <CheckCircle2 size={14} className="cluster-ref-check" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="result-empty">
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: '#eaf5ee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2d6a4f',
                  marginBottom: '8px',
                }}
              >
                <Users size={28} />
              </div>
              <p className="empty-state-title">No Segment Identified</p>
              <p style={{ color: 'var(--text-2)' }}>Your transactions have not yet been clustered.</p>
              <p className="empty-state-sub">
                Run the AI analysis from your dashboard to categorize your spending segment.
              </p>
              <Link to="/" className="btn-secondary" style={{ marginTop: '12px' }}>
                Go to Dashboard
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
