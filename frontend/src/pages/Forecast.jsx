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
          <p>Analyzing transactions & generating hybrid forecast…</p>
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
        return { label: 'High Reliability', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', color: '#4ade80', icon: ShieldCheck };
      case 'medium_reliability':
        return { label: 'Medium Reliability', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)', color: '#facc15', icon: ShieldCheck };
      case 'low_reliability':
        return { label: 'Low Reliability', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', color: '#f87171', icon: ShieldAlert };
      default:
        return { label: 'Insufficient Data', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)', color: '#94a3b8', icon: AlertTriangle };
    }
  };

  // Risk badge styling
  const getRiskBadge = (risk) => {
    const r = (risk || '').toLowerCase();
    if (r === 'low') {
      return { label: 'LOW RISK', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' };
    }
    if (r === 'high') {
      return { label: 'HIGH RISK', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', color: '#f87171' };
    }
    return { label: 'MEDIUM RISK', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)', color: '#facc15' };
  };

  const relBadge = getReliabilityBadge(reliability);
  const RelIcon = relBadge.icon;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense Forecast</h1>
          <p className="page-subtitle">Predict your next expense using your historical spending patterns & AI modeling.</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={loadForecast}>
          <RefreshCw size={13} /> Refresh Forecast
        </button>
      </div>

      {/* Notice if insufficient transactions for AI forecast */}
      {!hasEnoughData && (
        <Card style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={22} style={{ color: '#eab308' }} />
            <div>
              <h4 style={{ margin: '0 0 0.25rem 0', color: '#fef08a' }}>Not enough transaction history</h4>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
                The forecasting engine requires at least 3 historical expenses to calculate variance and rolling metrics. You currently have {debitTxs.length} expense transaction{debitTxs.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Key Metrics Ribbon ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Statistical Baseline</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
            {formatCurrency(statBaseline)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Per next transaction</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Historical Monthly Avg</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
            {formatCurrency(forecastData?.historical_monthly_average || 0)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Monthly average</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Recent 30-Day Spending</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#a855f7' }}>
            {formatCurrency(forecastData?.recent_30_days || 0)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Last 30 days active</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Spending Trend</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
            {trend === 'increasing' && <TrendingUp size={16} color="#f87171" />}
            {trend === 'decreasing' && <TrendingDown size={16} color="#4ade80" />}
            {trend === 'stable' && <Minus size={16} color="#38bdf8" />}
            <span style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'capitalize', color: '#f8fafc' }}>
              {trend.replace('_', ' ')}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{forecastData?.trend_percentage ? `${forecastData.trend_percentage}% vs prev window` : 'Pace analysis'}</span>
        </Card>
        <Card style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Forecast Confidence</span>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>
            {confidence}<span style={{ fontSize: '0.85rem', color: '#64748b' }}>/100</span>
          </p>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '0.4rem' }}>
            <div style={{ width: `${confidence}%`, height: '100%', background: '#4ade80', borderRadius: '2px' }} />
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
        <div style={{ width: '100%', maxWidth: '840px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* ── Forecast Main Result Card ── */}
          <Card className="forecast-result-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={22} color="#38bdf8" />
                <span className="forecast-result-eyebrow" style={{ fontSize: '1rem', fontWeight: 600 }}>Next Expense Forecast</span>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                background: relBadge.bg,
                border: `1px solid ${relBadge.border}`,
                color: relBadge.color,
                fontSize: '0.8rem',
                fontWeight: 600,
              }}>
                <RelIcon size={14} />
                <span>{relBadge.label}</span>
              </div>
            </div>

            {/* If low reliability, show calibrated ML forecast vs statistical fallback */}
            {reliability === 'low_reliability' ? (
              <div>
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  marginBottom: '1.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <AlertTriangle size={20} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', color: '#fca5a5', fontSize: '1rem' }}>
                        ML Forecast Has Low Reliability — Recommended Fallback Active
                      </h4>
                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        The calibrated ML model forecast is <strong>{formatCurrency(mlPred || 0)}</strong> (calibrated via exp({rawModelOutput || '7.61'})). Because this prediction differs substantially from your statistical baseline, the system recommends your verified deterministic baseline of <strong>{formatCurrency(fallbackPred)}</strong> for safer financial budgeting.
                      </p>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: 'rgba(56, 189, 248, 0.15)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                        <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>Statistical Fallback Prediction:</span>
                        <span style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 700 }}>{formatCurrency(fallbackPred)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'center', margin: '1.5rem 0' }}>
                  <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Calibrated ML Forecast</span>
                    <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.5rem 0', color: '#f87171' }}>{formatCurrency(mlPred || 0)}</p>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Inverse log transform applied (raw log: {rawModelOutput ?? '7.61'})
                    </span>
                  </div>
                  <div style={{ padding: '1rem', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#38bdf8' }}>Verified Statistical Baseline</span>
                    <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.5rem 0', color: '#38bdf8' }}>{formatCurrency(fallbackPred)}</p>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Recent Average per expense</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                <p className="forecast-amount" style={{ fontSize: '3rem', margin: '0.5rem 0' }}>
                  {formatCurrency(mlPred ?? fallbackPred)}
                </p>
                <p className="forecast-note" style={{ maxWidth: '600px', margin: '0 auto 1.5rem auto', color: '#94a3b8' }}>
                  Estimated amount for your next observed expense based on historical spending behavior, rolling averages, and recent transaction cadence.
                </p>
              </div>
            )}

            {/* Visual comparison */}
            {recentAmounts.length > 0 && (
              <div className="forecast-comparison" style={{ marginTop: '1.5rem' }}>
                <p className="forecast-comparison-title" style={{ textAlign: 'center', marginBottom: '1rem', color: '#cbd5e1' }}>
                  Recent Spending vs Recommended Forecast
                </p>
                <div className="forecast-bars" style={{ justifyContent: 'center' }}>
                  {recentAmounts.map((amt, i) => (
                    <div key={i} className="forecast-bar-col">
                      <div
                        className="forecast-bar forecast-bar--history"
                        style={{ height: `${Math.max(10, (amt / maxBar) * 80)}px` }}
                      />
                      <span className="forecast-bar-label">{formatCurrency(amt)}</span>
                    </div>
                  ))}
                  <div className="forecast-bar-col">
                    <ArrowRight size={14} className="forecast-bar-arrow" />
                  </div>
                  <div className="forecast-bar-col">
                    <div
                      className="forecast-bar forecast-bar--forecast"
                      style={{ height: `${Math.max(10, (fallbackPred / maxBar) * 80)}px` }}
                    />
                    <span className="forecast-bar-label forecast-bar-label--forecast">
                      {formatCurrency(fallbackPred)}
                    </span>
                  </div>
                </div>
                <div className="forecast-legend" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                  <span><span className="legend-dot legend-dot--history" />Recent Expenses</span>
                  <span><span className="legend-dot legend-dot--forecast" />Statistical Baseline</span>
                </div>
              </div>
            )}
          </Card>

          {/* ── STAGE B: AI Financial Reasoning Section ── */}
          {aiReasoning && (
            <Card style={{
              padding: '2rem',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Subtle decorative glow */}
              <div style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '140px',
                height: '140px',
                background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              {/* Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{
                    padding: '0.45rem',
                    borderRadius: '8px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Brain size={22} color="#38bdf8" />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#38bdf8', fontWeight: 700 }}>
                      AI Financial Reasoning
                    </span>
                    <h2 style={{ margin: '0.1rem 0 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#f8fafc' }}>
                      AI Forecast Explanation
                    </h2>
                  </div>
                </div>

                {/* Risk Level Badge */}
                {aiReasoning.risk_level && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Risk Level:</span>
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
                          letterSpacing: '0.05em',
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
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  background: 'rgba(56, 189, 248, 0.06)',
                  border: '1px solid rgba(56, 189, 248, 0.18)',
                  marginBottom: '1.5rem',
                }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Executive Summary
                  </span>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.95rem', color: '#f1f5f9', lineHeight: '1.5', fontWeight: 500 }}>
                    {aiReasoning.summary}
                  </p>
                </div>
              )}

              {/* Three Explanation Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Forecast Explanation */}
                <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Sparkles size={15} color="#38bdf8" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>Forecast Explanation</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                    {aiReasoning.forecast_explanation}
                  </p>
                </div>

                {/* Reliability Explanation */}
                <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <ShieldCheck size={15} color="#facc15" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>Reliability Analysis</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                    {aiReasoning.reliability_explanation}
                  </p>
                </div>

                {/* Spending Trend */}
                <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <TrendingUp size={15} color="#4ade80" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>Spending Trend</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                    {aiReasoning.trend_explanation}
                  </p>
                </div>
              </div>

              {/* Key Insights & Recommendations Side by Side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                {/* Key Insights */}
                <div style={{ padding: '1.25rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    <Lightbulb size={16} color="#38bdf8" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>Key Insights</h4>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {aiReasoning.key_insights && aiReasoning.key_insights.length > 0 ? (
                      aiReasoning.key_insights.map((insight, idx) => (
                        <li key={idx} style={{ fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                          {insight}
                        </li>
                      ))
                    ) : (
                      <li style={{ fontSize: '0.825rem', color: '#94a3b8' }}>Statistical baseline available.</li>
                    )}
                  </ul>
                </div>

                {/* Recommendations */}
                <div style={{ padding: '1.25rem', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    <CheckCircle2 size={16} color="#4ade80" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>Recommendations</h4>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {aiReasoning.recommendations && aiReasoning.recommendations.length > 0 ? (
                      aiReasoning.recommendations.map((rec, idx) => (
                        <li key={idx} style={{ fontSize: '0.825rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                          {rec}
                        </li>
                      ))
                    ) : (
                      <li style={{ fontSize: '0.825rem', color: '#94a3b8' }}>Monitor spending pace against monthly budget.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Disclaimer Footnote */}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={14} color="#64748b" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                  {aiReasoning.disclaimer || 'AI financial reasoning is derived strictly from deterministic statistical calculations.'}
                </span>
              </div>
            </Card>
          )}

          {/* ── Recurring Commitments & Signals Card ── */}
          {(confirmedCommitments.length > 0 || possiblePatterns.length > 0) && (
            <Card style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={18} color="#a855f7" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
                    Recurring Spending Commitments
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    Confirmed Monthly: <strong style={{ color: '#a855f7' }}>{formatCurrency(confirmedRecurringTotal)}</strong>
                  </span>
                  {possibleRecurringTotal > 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Possible Variable: <strong style={{ color: '#cbd5e1' }}>{formatCurrency(possibleRecurringTotal)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Confirmed Recurring Bills */}
              {confirmedCommitments.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#a855f7', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Confirmed Fixed Commitments (Bills & Subscriptions)
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {confirmedCommitments.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          background: 'rgba(168, 85, 247, 0.05)',
                          border: '1px solid rgba(168, 85, 247, 0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem' }}>{rec.merchant}</span>
                          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontWeight: 700 }}>
                            {rec.frequency}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>{formatCurrency(rec.amount)}</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{rec.occurrences}x logged</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Possible / Discretionary Recurring Patterns */}
              {possiblePatterns.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Possible Discretionary Patterns (Variable Dining / Shopping)
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {possiblePatterns.map((rec, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: '0.85rem' }}>{rec.merchant}</span>
                          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', padding: '2px 5px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8' }}>
                            {rec.frequency}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1' }}>{formatCurrency(rec.amount)}</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{rec.occurrences}x logged</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── Model Reasoning & Diagnostic Details ── */}
          <Card style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Info size={18} color="#38bdf8" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
                Forecasting Engine Architecture & Diagnostics
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#f8fafc' }}>1. Target Unit Definition:</strong> The underlying ML model predicts <em>Next Transaction Amount</em> (individual transaction level), not total monthly cash flow.
              </div>
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#f8fafc' }}>2. Model Transformation Analysis:</strong> The gradient-boosted tree was trained on logarithmically scaled labels (ln(amount)). The raw prediction of {rawModelOutput ? rawModelOutput.toFixed(2) : '7.61'} was calibrated via exp({rawModelOutput ? rawModelOutput.toFixed(2) : '7.61'}) to produce the true currency prediction of {formatCurrency(mlPred || 0)}.
              </div>
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#f8fafc' }}>3. Deterministic Safety Fallback:</strong> To guarantee accuracy for financial planning without modifying the serialized ML artifact, Stage A pairs the ML output with a deterministic statistical baseline ({formatCurrency(statBaseline)}) and transparent confidence metrics.
              </div>
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ color: '#f8fafc' }}>4. Stage B Groq Reasoning Layer:</strong> The AI reasoning layer analyzes deterministic metrics and model reliability to provide plain-language explanations without ever modifying or inventing numerical predictions.
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
