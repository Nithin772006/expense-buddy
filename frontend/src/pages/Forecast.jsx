import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import { getUserMlProfile } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { formatCurrency } from '../utils/constants';
import { TrendingUp, IndianRupee, ArrowRight, Upload, PlusCircle, Sparkles } from 'lucide-react';

export default function Forecast() {
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

  const hasData = storedTxs.length > 0;
  const hasEnoughData = storedTxs.length >= 3;
  const forecastedAmount = mlProfile?.forecasted_amount;

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
          <p>Loading forecast data...</p>
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
          <h2 className="dashboard-empty-title">No Data Available</h2>
          <p className="dashboard-empty-sub">
            Add or import transactions to generate AI-powered expense forecasts.
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

  // Recent spending for comparison bar
  const recentAmounts = storedTxs.slice(0, 4).map((t) => t.amount).reverse();
  const maxBar = Math.max(...recentAmounts, forecastedAmount || 0, 1);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense Forecast</h1>
          <p className="page-subtitle">Predict your next expense using your historical spending patterns.</p>
        </div>
      </div>

      {/* Notice if insufficient transactions for AI forecast */}
      {!hasEnoughData && (
        <Card style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <TrendingUp size={22} style={{ color: '#eab308' }} />
            <div>
              <h4 style={{ margin: '0 0 0.25rem 0', color: '#fef08a' }}>Not enough transaction history</h4>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
                The AI forecasting model requires at least 3 historical transactions to calculate lag amounts, rolling averages, and spending variance. You currently have {storedTxs.length} transaction{storedTxs.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="two-col-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {hasEnoughData && (
          <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {forecastedAmount !== undefined && forecastedAmount !== null ? (
              <Card className="forecast-result-card" style={{ padding: '2rem' }}>
                <div className="forecast-result-top" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
                  <Sparkles size={24} className="forecast-result-icon" color="#38bdf8" />
                  <span className="forecast-result-eyebrow" style={{ fontSize: '1rem' }}>Predicted Next Expense</span>
                </div>
                <p className="forecast-amount" style={{ textAlign: 'center', fontSize: '3rem', margin: '1rem 0' }}>{formatCurrency(forecastedAmount)}</p>
                <p className="forecast-note" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 2rem auto' }}>
                  Estimated amount for your next observed expense based on historical spending behavior, rolling averages, and time patterns. This is an AI model estimate, not a guarantee.
                </p>

                {/* Visual comparison */}
                {recentAmounts.length > 0 && (
                  <div className="forecast-comparison" style={{ marginTop: '2rem' }}>
                    <p className="forecast-comparison-title" style={{ textAlign: 'center' }}>Recent Spending vs Forecast</p>
                    <div className="forecast-bars" style={{ justifyContent: 'center' }}>
                      {recentAmounts.map((amt, i) => (
                        <div key={i} className="forecast-bar-col">
                          <div
                            className="forecast-bar forecast-bar--history"
                            style={{ height: `${Math.max(8, (amt / maxBar) * 80)}px` }}
                          />
                          <span className="forecast-bar-label">{formatCurrency(amt).replace('₹', '₹')}</span>
                        </div>
                      ))}
                      <div className="forecast-bar-col">
                        <ArrowRight size={14} className="forecast-bar-arrow" />
                      </div>
                      <div className="forecast-bar-col">
                        <div
                          className="forecast-bar forecast-bar--forecast"
                          style={{ height: `${Math.max(8, (forecastedAmount / maxBar) * 80)}px` }}
                        />
                        <span className="forecast-bar-label forecast-bar-label--forecast">
                          {formatCurrency(forecastedAmount)}
                        </span>
                      </div>
                    </div>
                    <div className="forecast-legend" style={{ justifyContent: 'center' }}>
                      <span><span className="legend-dot legend-dot--history" />Recent</span>
                      <span><span className="legend-dot legend-dot--forecast" />Predicted</span>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="result-empty">
                <IndianRupee size={36} className="result-empty-icon" />
                <p className="empty-state-title">Pending Forecast</p>
                <p className="empty-state-sub">
                  Your forecast has not been generated yet. Run the AI analysis from your dashboard to update your profile.
                </p>
                <Link to="/" className="btn-secondary" style={{ marginTop: '1rem' }}>
                  Go to Dashboard
                </Link>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
