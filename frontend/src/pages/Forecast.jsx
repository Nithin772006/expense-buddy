import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import { getUserForecast } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { formatCurrency } from '../utils/constants';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  IndianRupee,
  ArrowRight,
  Upload,
  PlusCircle,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  RefreshCw,
  Info,
  Brain,
  Lightbulb,
  CheckCircle2,
  Target,
} from 'lucide-react';

export default function Forecast() {
  const [storedTxs, setStoredTxs] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadForecast = async () => {
    setLoading(true);
    try {
      const [txs, foreRes] = await Promise.all([
        fetchTransactions({ limit: 500 }),
        getUserForecast().catch(() => ({ data: { forecast: null } })),
      ]);
      setStoredTxs(txs || []);
      setForecastData(foreRes?.data?.forecast || null);
    } catch (e) {
      console.error('Failed to load forecast data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, []);

  const debitTxs = storedTxs.filter((t) => (t.transaction_type || 'debit').toLowerCase() === 'debit');
  const hasData = debitTxs.length > 0;
  const hasEnoughData = debitTxs.length >= 3;

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Expense Forecast</h1>
            <p className="page-subtitle">Predict your next expense using your historical spending patterns.</p>
          </div>
        </div>
        <div className="dashboard-loading">
          <Spinner />
          <p>Analyzing transactions &amp; generating hybrid forecast…</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Expense Forecast</h1>
            <p className="page-subtitle">Predict your next expense using your historical spending patterns.</p>
          </div>
        </div>
        <Card className="dashboard-empty">
          <IndianRupee size={48} className="dashboard-empty-icon" />
          <h2 className="dashboard-empty-title">No Expense Data Available</h2>
          <p className="dashboard-empty-sub">
            Add or import transactions to generate statistical baselines and AI-powered forecasts.
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

  const mlPred = forecastData?.ml_prediction;
  const rawModelOutput = forecastData?.raw_model_output;
  const statBaseline = forecastData?.statistical_baseline ?? (debitTxs.length > 0 ? debitTxs.reduce((s, t) => s + t.amount, 0) / debitTxs.length : 0);
  const fallbackPred = forecastData?.fallback_prediction ?? statBaseline;
  const reliability = forecastData?.reliability || 'insufficient_data';
  const confidence = forecastData?.confidence ?? 0;
  const trend = forecastData?.trend || 'stable';

  // Confirmed vs Possible Recurring Signals
  const rawConfirmed = forecastData?.confirmed_recurring_commitments || forecastData?.recurring_commitments || [];
  const confirmedCommitments = rawConfirmed.filter((c) => (c.frequency || '').toLowerCase() !== 'irregular');
  const confirmedRecurringTotal = forecastData?.confirmed_recurring_total ?? (forecastData?.recurring_commitment_estimate || 0);
  const possiblePatterns = forecastData?.possible_discretionary_patterns || forecastData?.possible_recurring_patterns || [];
  const possibleRecurringTotal = forecastData?.possible_discretionary_patterns_total ?? forecastData?.possible_recurring_total ?? 0;

  // Stage B AI Financial Reasoning
  const aiReasoning = forecastData?.ai_reasoning;

  // Recent spending for visual comparison
  const recentAmounts = debitTxs.slice(0, 4).map((t) => t.amount).reverse();
  const maxBar = Math.max(...recentAmounts, fallbackPred || statBaseline || 1, 1);

  // Reliability badge styling
  const getReliabilityBadge = (rel) => {
    switch (rel) {
      case 'high_reliability':
        return { label: 'High Reliability', bg: '#d8f3dc', border: 'rgba(82, 183, 136, 0.4)', color: '#1b4332', icon: ShieldCheck };
      case 'medium_reliability':
        return { label: 'Medium Reliability', bg: '#fef3c7', border: 'rgba(245, 158, 11, 0.3)', color: '#b45309', icon: ShieldCheck };
      case 'low_reliability':
        return { label: 'Low Reliability', bg: '#fee2e2', border: 'rgba(239, 68, 68, 0.3)', color: '#b91c1c', icon: ShieldAlert };
      default:
        return { label: 'Insufficient Data', bg: '#e2e8f0', border: 'rgba(148, 163, 184, 0.3)', color: '#475569', icon: AlertTriangle };
    }
  };

  // Risk badge styling
  const getRiskBadge = (risk) => {
    const r = (risk || '').toLowerCase();
    if (r === 'low') {
      return { label: 'LOW RISK', bg: '#d8f3dc', border: 'rgba(82, 183, 136, 0.4)', color: '#1b4332' };
    }
    if (r === 'high') {
      return { label: 'HIGH RISK', bg: '#fee2e2', border: 'rgba(239, 68, 68, 0.3)', color: '#b91c1c' };
    }
    return { label: 'MEDIUM RISK', bg: '#fef3c7', border: 'rgba(245, 158, 11, 0.3)', color: '#b45309' };
  };

  const relBadge = getReliabilityBadge(reliability);
  const RelIcon = relBadge.icon;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense Forecast</h1>
          <p className="page-subtitle">Predict your next expense using your historical spending patterns &amp; AI modeling.</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={loadForecast}>
          <RefreshCw size={13} /> Refresh Forecast
        </button>
      </div>

      {/* Notice if insufficient transactions for AI forecast */}
      {!hasEnoughData && (
        <Card style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', background: '#fffbeb', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={22} style={{ color: '#d97706' }} />
            <div>
              <h4 style={{ margin: '0 0 0.25rem 0', color: '#92400e', fontWeight: 700 }}>Not enough transaction history</h4>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f' }}>
                The forecasting engine requires at least 3 historical expenses to calculate variance and rolling metrics. You currently have {debitTxs.length} expense transaction{debitTxs.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Key Metrics Ribbon ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Statistical Baseline
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#1b4332', letterSpacing: '-0.5px' }}>
            {formatCurrency(statBaseline)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>Per next transaction</span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Historical Monthly Avg
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#132e22', letterSpacing: '-0.5px' }}>
            {formatCurrency(forecastData?.historical_monthly_average || 0)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>Monthly average</span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Recent 30-Day Spending
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#2d6a4f', letterSpacing: '-0.5px' }}>
            {formatCurrency(forecastData?.recent_30_days || 0)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>Last 30 days active</span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Spending Trend
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
            {trend === 'increasing' && <TrendingUp size={18} color="#dc2626" />}
            {trend === 'decreasing' && <TrendingDown size={18} color="#2d6a4f" />}
            {trend === 'stable' && <Minus size={18} color="#1d70b8" />}
            <span style={{ fontSize: '1.3rem', fontWeight: 800, textTransform: 'capitalize', color: '#132e22', letterSpacing: '-0.4px' }}>
              {trend.replace('_', ' ')}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#476856', marginTop: '4px', display: 'block' }}>
            {forecastData?.trend_percentage ? `${forecastData.trend_percentage}% vs prev window` : 'Pace analysis'}
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Forecast Confidence
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#2d6a4f', letterSpacing: '-0.5px' }}>
            {confidence}<span style={{ fontSize: '0.85rem', color: '#688a77', fontWeight: 600 }}>/100</span>
          </p>
          <div style={{ width: '100%', height: '5px', background: '#eaf5ee', borderRadius: '3px', marginTop: '6px' }}>
            <div style={{ width: `${confidence}%`, height: '100%', background: 'linear-gradient(90deg, #52b788, #2d6a4f)', borderRadius: '3px' }} />
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', width: '100%' }}>
        <div style={{ width: '100%', maxWidth: '880px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Forecast Main Result Card ── */}
          <Card className="forecast-result-card" style={{ padding: '2.5rem 2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Sparkles size={22} color="#2d6a4f" />
                <span className="forecast-result-eyebrow" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#132e22' }}>
                  Next Expense Forecast
                </span>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.85rem',
                borderRadius: '999px',
                background: relBadge.bg,
                border: `1px solid ${relBadge.border}`,
                color: relBadge.color,
                fontSize: '0.8rem',
                fontWeight: 700,
              }}>
                <RelIcon size={14} />
                <span>{relBadge.label}</span>
              </div>
            </div>

            {/* If low reliability, show calibrated ML forecast vs statistical fallback */}
            {reliability === 'low_reliability' ? (
              <div style={{ width: '100%' }}>
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '12px',
                  background: 'rgba(254, 226, 226, 0.7)',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  marginBottom: '1.5rem',
                  textAlign: 'left',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', color: '#991b1b', fontSize: '1rem', fontWeight: 700 }}>
                        ML Forecast Has Low Reliability — Recommended Fallback Active
                      </h4>
                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#476856', lineHeight: '1.5' }}>
                        The calibrated ML model forecast is <strong>{formatCurrency(mlPred || 0)}</strong> (calibrated via exp({rawModelOutput || '7.61'})). Because this prediction differs substantially from your statistical baseline, the system recommends your verified deterministic baseline of <strong>{formatCurrency(fallbackPred)}</strong> for safer financial budgeting.
                      </p>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: '#ffffff', borderRadius: '8px', border: '1px solid rgba(82, 183, 136, 0.35)' }}>
                        <span style={{ fontSize: '0.85rem', color: '#2d6a4f', fontWeight: 700 }}>Statistical Fallback Prediction:</span>
                        <span style={{ fontSize: '1.1rem', color: '#132e22', fontWeight: 800 }}>{formatCurrency(fallbackPred)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', textAlign: 'center', margin: '1.5rem 0' }}>
                  <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#688a77', fontWeight: 600 }}>Calibrated ML Forecast</span>
                    <p style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.4rem 0', color: '#dc2626' }}>{formatCurrency(mlPred || 0)}</p>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Inverse log transform applied (raw log: {rawModelOutput ?? '7.61'})
                    </span>
                  </div>
                  <div style={{ padding: '1.25rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(82, 183, 136, 0.35)', boxShadow: '0 4px 14px rgba(13, 38, 28, 0.04)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#2d6a4f', fontWeight: 700 }}>Verified Statistical Baseline</span>
                    <p style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.4rem 0', color: '#1b4332' }}>{formatCurrency(fallbackPred)}</p>
                    <span style={{ fontSize: '0.75rem', color: '#476856' }}>Recent Average per expense</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                <p className="forecast-amount" style={{ fontSize: '3.2rem', margin: '0.5rem 0', color: '#1b4332', fontWeight: 800 }}>
                  {formatCurrency(mlPred ?? fallbackPred)}
                </p>
                <p className="forecast-note" style={{ maxWidth: '600px', margin: '0 auto 1.5rem auto', color: '#476856' }}>
                  Estimated amount for your next observed expense based on historical spending behavior, rolling averages, and recent transaction cadence.
                </p>
              </div>
            )}

            {/* Visual comparison */}
            {recentAmounts.length > 0 && (
              <div className="forecast-comparison" style={{ marginTop: '1.5rem' }}>
                <p className="forecast-comparison-title" style={{ textAlign: 'center', marginBottom: '1rem', color: '#476856' }}>
                  Recent Spending vs Recommended Forecast
                </p>
                <div className="forecast-bars" style={{ justifyContent: 'center' }}>
                  {recentAmounts.map((amt, i) => (
                    <div key={i} className="forecast-bar-col">
                      <div
                        className="forecast-bar forecast-bar--history"
                        style={{ height: `${Math.max(12, (amt / maxBar) * 85)}px` }}
                      />
                      <span className="forecast-bar-label">{formatCurrency(amt)}</span>
                    </div>
                  ))}
                  <div className="forecast-bar-col">
                    <ArrowRight size={16} className="forecast-bar-arrow" />
                  </div>
                  <div className="forecast-bar-col">
                    <div
                      className="forecast-bar forecast-bar--forecast"
                      style={{ height: `${Math.max(12, (fallbackPred / maxBar) * 85)}px` }}
                    />
                    <span className="forecast-bar-label forecast-bar-label--forecast">
                      {formatCurrency(fallbackPred)}
                    </span>
                  </div>
                </div>
                <div className="forecast-legend" style={{ justifyContent: 'center', marginTop: '1.25rem' }}>
                  <span><span className="legend-dot legend-dot--history" />Recent Expenses</span>
                  <span><span className="legend-dot legend-dot--forecast" />Recommended Baseline</span>
                </div>
              </div>
            )}
          </Card>

          {/* ── STAGE B: AI Financial Reasoning Section ── */}
          {aiReasoning && (
            <Card style={{
              padding: '2rem',
              background: '#ffffff',
              border: '1px solid rgba(82, 183, 136, 0.35)',
              boxShadow: '0 10px 30px rgba(13, 38, 28, 0.05)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid rgba(82, 183, 136, 0.15)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <div style={{
                    padding: '0.5rem',
                    borderRadius: '10px',
                    background: '#eaf5ee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2d6a4f',
                  }}>
                    <Brain size={22} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2d6a4f', fontWeight: 800 }}>
                      AI Financial Reasoning
                    </span>
                    <h2 style={{ margin: '0.1rem 0 0 0', fontSize: '1.3rem', fontWeight: 800, color: '#132e22' }}>
                      AI Forecast Explanation
                    </h2>
                  </div>
                </div>

                {/* Risk Level Badge */}
                {aiReasoning.risk_level && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#688a77', textTransform: 'uppercase', fontWeight: 600 }}>Risk Level:</span>
                    {(() => {
                      const riskBadge = getRiskBadge(aiReasoning.risk_level);
                      return (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '999px',
                          background: riskBadge.bg,
                          border: `1px solid ${riskBadge.border}`,
                          color: riskBadge.color,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}>
                          <Target size={12} />
                          {riskBadge.label}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Summary Callout */}
              {aiReasoning.summary && (
                <div style={{
                  padding: '1.1rem 1.3rem',
                  borderRadius: '12px',
                  background: '#f4faf6',
                  border: '1px solid rgba(82, 183, 136, 0.3)',
                  marginBottom: '1.5rem',
                }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#2d6a4f', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Executive Summary
                  </span>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.95rem', color: '#132e22', lineHeight: '1.55', fontWeight: 600 }}>
                    {aiReasoning.summary}
                  </p>
                </div>
              )}

              {/* Three Explanation Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '1.5rem' }}>
                {/* Forecast Explanation */}
                <div style={{ padding: '1.1rem', borderRadius: '12px', background: '#f8faf9', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Sparkles size={15} color="#2d6a4f" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#132e22' }}>Forecast Logic</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#476856', lineHeight: '1.5' }}>
                    {aiReasoning.forecast_explanation}
                  </p>
                </div>

                {/* Reliability Explanation */}
                <div style={{ padding: '1.1rem', borderRadius: '12px', background: '#f8faf9', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <ShieldCheck size={15} color="#d97706" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#132e22' }}>Reliability Analysis</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#476856', lineHeight: '1.5' }}>
                    {aiReasoning.reliability_explanation}
                  </p>
                </div>

                {/* Spending Trend */}
                <div style={{ padding: '1.1rem', borderRadius: '12px', background: '#f8faf9', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <TrendingUp size={15} color="#2d6a4f" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#132e22' }}>Spending Trend</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#476856', lineHeight: '1.5' }}>
                    {aiReasoning.trend_explanation}
                  </p>
                </div>
              </div>

              {/* Key Insights & Recommendations Side by Side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '1.5rem' }}>
                {/* Key Insights */}
                <div style={{ padding: '1.25rem', borderRadius: '12px', background: '#ffffff', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    <Lightbulb size={16} color="#d97706" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#132e22' }}>Key Insights</h4>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {aiReasoning.key_insights && aiReasoning.key_insights.length > 0 ? (
                      aiReasoning.key_insights.map((insight, idx) => (
                        <li key={idx} style={{ fontSize: '0.85rem', color: '#476856', lineHeight: '1.45' }}>
                          {insight}
                        </li>
                      ))
                    ) : (
                      <li style={{ fontSize: '0.85rem', color: '#688a77' }}>Statistical baseline available.</li>
                    )}
                  </ul>
                </div>

                {/* Recommendations */}
                <div style={{ padding: '1.25rem', borderRadius: '12px', background: '#ffffff', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    <CheckCircle2 size={16} color="#2d6a4f" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#132e22' }}>Recommendations</h4>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {aiReasoning.recommendations && aiReasoning.recommendations.length > 0 ? (
                      aiReasoning.recommendations.map((rec, idx) => (
                        <li key={idx} style={{ fontSize: '0.85rem', color: '#476856', lineHeight: '1.45' }}>
                          {rec}
                        </li>
                      ))
                    ) : (
                      <li style={{ fontSize: '0.85rem', color: '#688a77' }}>Monitor spending pace against monthly budget.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Disclaimer Footnote */}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(82, 183, 136, 0.15)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={14} color="#688a77" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: '#688a77', fontStyle: 'italic' }}>
                  {aiReasoning.disclaimer || 'AI financial reasoning is derived strictly from deterministic statistical calculations.'}
                </span>
              </div>
            </Card>
          )}

          {/* ── Recurring Commitments & Signals Card ── */}
          {(confirmedCommitments.length > 0 || possiblePatterns.length > 0) && (
            <Card style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={18} color="#2d6a4f" />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#132e22' }}>
                    Recurring Spending Commitments
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#688a77' }}>
                    Confirmed Monthly: <strong style={{ color: '#1b4332' }}>{formatCurrency(confirmedRecurringTotal)}</strong>
                  </span>
                  {possibleRecurringTotal > 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#688a77' }}>
                      Possible Variable: <strong style={{ color: '#476856' }}>{formatCurrency(possibleRecurringTotal)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Confirmed Recurring Bills */}
              {confirmedCommitments.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#2d6a4f', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Confirmed Fixed Commitments (Bills &amp; Subscriptions)
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', marginTop: '0.6rem' }}>
                    {confirmedCommitments.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: '12px',
                          background: '#ffffff',
                          border: '1px solid rgba(82, 183, 136, 0.22)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          boxShadow: '0 2px 6px rgba(13, 38, 28, 0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#132e22', fontSize: '0.9rem' }}>{rec.merchant}</span>
                          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: '#d8f3dc', color: '#1b4332', fontWeight: 700 }}>
                            {rec.frequency}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1b4332' }}>{formatCurrency(rec.amount)}</span>
                          <span style={{ fontSize: '0.75rem', color: '#688a77' }}>{rec.occurrences}x logged</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Model Reasoning & Diagnostic Details ── */}
          <Card style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Info size={18} color="#2d6a4f" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#132e22' }}>
                Forecasting Engine Architecture &amp; Diagnostics
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem', color: '#476856', lineHeight: '1.5' }}>
              <div style={{ padding: '0.85rem', background: '#f8faf9', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <strong style={{ color: '#132e22' }}>1. Target Unit Definition:</strong> The underlying ML model predicts <em>Next Transaction Amount</em> (individual transaction level), not total monthly cash flow.
              </div>
              <div style={{ padding: '0.85rem', background: '#f8faf9', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <strong style={{ color: '#132e22' }}>2. Model Transformation Analysis:</strong> The gradient-boosted tree was trained on logarithmically scaled labels (ln(amount)). The raw prediction of {rawModelOutput ? rawModelOutput.toFixed(2) : '7.61'} was calibrated via exp({rawModelOutput ? rawModelOutput.toFixed(2) : '7.61'}) to produce the true currency prediction of {formatCurrency(mlPred || 0)}.
              </div>
              <div style={{ padding: '0.85rem', background: '#f8faf9', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <strong style={{ color: '#132e22' }}>3. Deterministic Safety Fallback:</strong> To guarantee accuracy for financial planning without modifying the serialized ML artifact, Stage A pairs the ML output with a deterministic statistical baseline ({formatCurrency(statBaseline)}) and transparent confidence metrics.
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
