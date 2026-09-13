import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import CategoryChart from '../components/CategoryChart';
import { getUserMlProfile } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { CLUSTER_LABELS, formatCurrency } from '../utils/constants';
import { Users, BarChart3, CheckCircle2, IndianRupee, AlertTriangle, ArrowRight, Upload, PlusCircle } from 'lucide-react';

const CLUSTER_COLORS = ['purple', 'blue', 'green', 'amber', 'red'];

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
  const clusterColor = clusterId !== null ? CLUSTER_COLORS[clusterId] || 'purple' : 'purple';

  const totalAmount = storedTxs.reduce((s, t) => s + (t.amount || 0), 0);
  const avgAmount = storedTxs.length > 0 ? totalAmount / storedTxs.length : 0;
  
  const catCounts = {};
  storedTxs.forEach((t) => {
    const c = t.category || 'Uncategorized';
    catCounts[c] = (catCounts[c] || 0) + t.amount;
  });
  const sortedCategories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const secondCategory = sortedCategories[1];

  const anomalyCount = storedTxs.filter((t) => t.is_anomaly).length;
  const hasData = storedTxs.length > 0;

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
          <p>Loading spending analysis...</p>
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
          <p className="page-subtitle">Identify your customer behavior segment using AI clustering.</p>
        </div>
      </div>

      {/* Real transaction intelligence summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Spending</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
            {formatCurrency(totalAmount)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{storedTxs.length} transactions</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Average Transaction</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
            {formatCurrency(avgAmount)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Per expense</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Top Category</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#a855f7' }}>
            {topCategory ? topCategory[0] : 'None'}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{topCategory ? formatCurrency(topCategory[1]) : ''}</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Active Segment</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>
            {clusterInfo ? clusterInfo.label : 'Pending Analysis'}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>KMeans 5-Cluster</span>
        </Card>
      </div>

      <div className="two-col-layout">
        
        {/* ── Visual Insights ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <div className="card-title-row">
              <BarChart3 size={15} />
              <h2 className="card-title">Spending by Category</h2>
            </div>
            <CategoryChart transactions={storedTxs} />
          </Card>
          
          <Card>
            <div className="card-title-row">
              <IndianRupee size={15} />
              <h2 className="card-title">Top Expense Categories</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {sortedCategories.slice(0, 4).map(([cat, amt]) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>{cat}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.95rem', fontWeight: 600 }}>{formatCurrency(amt)}</span>
                </div>
              ))}
            </div>
          </Card>
          
          {anomalyCount > 0 && (
             <Card style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="card-title-row">
                <AlertTriangle size={15} color="#ef4444" />
                <h2 className="card-title" style={{ color: '#f8fafc' }}>Anomalous Transactions Detected</h2>
              </div>
              <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#cbd5e1' }}>
                Our AI anomaly detection model has flagged <strong>{anomalyCount}</strong> unusual transaction{anomalyCount > 1 ? 's' : ''} based on your spending history. Check your dashboard for more details.
              </p>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', color: '#38bdf8', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 600 }}>
                View Dashboard <ArrowRight size={14} />
              </Link>
             </Card>
          )}
        </div>

        {/* ── Cluster Result ── */}
        <div className="results-col">
          {clusterInfo ? (
            <Card className={`cluster-result-card cluster-result-card--${clusterColor}`}>
              <div className="cluster-result-header">
                <span className={`cluster-badge cluster-badge--${clusterColor}`}>
                  Cluster {clusterId}
                </span>
                <span className="cluster-active-badge">
                  <CheckCircle2 size={11} /> Model Active
                </span>
              </div>

              <div className={`cluster-icon-wrap cluster-icon-wrap--${clusterColor}`}>
                <Users size={32} />
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
                      <CheckCircle2 size={13} className="cluster-ref-check" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="result-empty">
              <Users size={36} className="result-empty-icon" />
              <p className="empty-state-title">No Segment Identified</p>
              <p>Your transactions have not yet been assigned a spending behavior cluster.</p>
              <p className="empty-state-sub">
                Run the AI analysis from your dashboard or add more transactions to generate your profile.
              </p>
              <Link to="/" className="btn-secondary" style={{ marginTop: '1rem' }}>
                Go to Dashboard
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
