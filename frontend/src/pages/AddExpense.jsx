import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import FormField from '../components/FormField';
import Spinner from '../components/Spinner';
import ErrorAlert from '../components/ErrorAlert';
import AnomalyBadge from '../components/AnomalyBadge';
import { predictExpense, predictAnomaly } from '../services/api';
import { saveTransaction, generateId } from '../utils/storage';
import { saveTransactionToSupabase } from '../services/transactionService';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/constants';
import { Tag, CheckCircle2, PlusCircle, Sparkles, ArrowRight, ShieldCheck, ShieldAlert, Receipt } from 'lucide-react';

const initialForm = {
  description: '',
  transaction_amount: '',
  account_balance: '',
  credit_score: '',
  has_loan: '0',
  emi_amount: '',
  transaction_hour: new Date().getHours().toString(),
};

export default function AddExpense() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!form.description.trim()) { setError('Please enter a transaction description.'); return; }
    const amount = parseFloat(form.transaction_amount);
    const balance = parseFloat(form.account_balance);
    const creditScore = parseFloat(form.credit_score);
    const emi = parseFloat(form.emi_amount) || 0;
    const hour = parseInt(form.transaction_hour);

    if (isNaN(amount) || amount <= 0) { setError('Please enter a valid transaction amount.'); return; }
    if (isNaN(balance) || balance < 0) { setError('Please enter a valid account balance.'); return; }
    if (isNaN(creditScore) || creditScore < 300 || creditScore > 900) { setError('Credit score must be between 300 and 900.'); return; }
    if (isNaN(hour) || hour < 0 || hour > 23) { setError('Transaction hour must be between 0 and 23.'); return; }

    setLoading(true);
    try {
      const [expenseRes, anomalyRes] = await Promise.all([
        predictExpense(form.description.trim()),
        predictAnomaly({
          transaction_amount: amount,
          account_balance: balance,
          credit_score: creditScore,
          has_loan: parseInt(form.has_loan),
          emi_amount: emi,
          transaction_hour: hour,
          amount_balance_ratio: balance > 0 ? amount / balance : 0,
          emi_balance_ratio: balance > 0 ? emi / balance : 0,
          previous_transaction_count: 10,
          customer_previous_avg_amount: amount,
          amount_vs_customer_average: 1.0,
          customer_amount_std: amount * 0.1,
          customer_amount_zscore: 0.0,
        }),
      ]);

      const category = expenseRes.data.category;
      const is_anomaly = anomalyRes.data.is_anomaly;

      const tx = {
        id: generateId(),
        description: form.description.trim(),
        amount,
        date: new Date().toISOString(),
        category,
        is_anomaly,
        account_balance: balance,
        credit_score: creditScore,
        has_loan: parseInt(form.has_loan),
        emi_amount: emi,
        source: 'manual',
        transaction_type: 'debit',
      };

      // 1. Save to Supabase as CANONICAL persistent database
      const savedRow = await saveTransactionToSupabase(tx);
      if (savedRow?.id) {
        tx.id = savedRow.id;
      }

      // 2. Save to user-scoped localStorage cache (offline/UI cache)
      const { data: { user } } = await supabase.auth.getUser();
      saveTransaction(tx, user?.id);

      setResult({ ...tx });
    } catch (err) {
      setError(err?.message || err?.response?.data?.detail || 'Failed to save transaction. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnother = () => {
    setForm(initialForm);
    setResult(null);
    setError('');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Add Expense</h1>
          <p className="page-subtitle">Classify your transaction with TF-IDF AI and detect pattern anomalies instantly.</p>
        </div>
      </div>

      <div className="two-col-layout">
        {/* ── Form Card ── */}
        <Card>
          <div className="card-title-row">
            <Receipt size={18} />
            <h2 className="card-title">Transaction Details</h2>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            <FormField
              label="Transaction Description"
              name="description"
              type="text"
              value={form.description}
              onChange={handleChange}
              placeholder="e.g. Zomato dinner, Netflix subscription, Petrol pump…"
            />
            <div className="form-row">
              <FormField label="Amount (₹)" name="transaction_amount" value={form.transaction_amount} onChange={handleChange} placeholder="e.g. 450" />
              <FormField label="Account Balance (₹)" name="account_balance" value={form.account_balance} onChange={handleChange} placeholder="e.g. 25000" />
            </div>
            <div className="form-row">
              <FormField label="Credit Score (300–900)" name="credit_score" value={form.credit_score} onChange={handleChange} placeholder="e.g. 720" min={300} max={900} />
              <FormField
                label="Has Active Loan?"
                name="has_loan"
                type="select"
                value={form.has_loan}
                onChange={handleChange}
                options={[{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }]}
              />
            </div>
            <div className="form-row">
              <FormField label="EMI Amount (₹)" name="emi_amount" value={form.emi_amount} onChange={handleChange} placeholder="0 if no active EMI" />
              <FormField label="Transaction Hour (0–23)" name="transaction_hour" value={form.transaction_hour} onChange={handleChange} placeholder="e.g. 14" min={0} max={23} />
            </div>

            <ErrorAlert message={error} />

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '6px' }}>
              {loading ? (
                <>
                  <Spinner size={16} /> Analyzing with AI…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Analyze &amp; Save Expense
                </>
              )}
            </button>
          </form>
        </Card>

        {/* ── Results Column ── */}
        <div className="results-col">
          {loading && (
            <Card className="results-loading">
              <Spinner />
              <p style={{ fontWeight: 600, color: 'var(--eb-forest)' }}>Running AI classification &amp; anomaly detection…</p>
            </Card>
          )}

          {result && !loading && (
            <Card className="result-success-card">
              {/* Success header */}
              <div className="result-success-header">
                <CheckCircle2 size={20} className="result-success-icon" />
                <span>Transaction Analyzed &amp; Saved</span>
              </div>

              {/* Transaction summary */}
              <div className="result-summary">
                <div className="result-summary-row">
                  <span className="result-summary-key">Description</span>
                  <span className="result-summary-val">{result.description}</span>
                </div>
                <div className="result-summary-row">
                  <span className="result-summary-key">Amount</span>
                  <span className="result-summary-val result-summary-amount">{formatCurrency(result.amount)}</span>
                </div>
                <div className="result-summary-row">
                  <span className="result-summary-key">Date &amp; Time</span>
                  <span className="result-summary-val">
                    {new Date(result.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="result-summary-row">
                  <span className="result-summary-key">Predicted Category</span>
                  <span className="result-summary-val result-category">
                    <Tag size={13} /> {result.category}
                  </span>
                </div>
                <div className="result-summary-row">
                  <span className="result-summary-key">Anomaly Status</span>
                  <AnomalyBadge isAnomaly={result.is_anomaly} />
                </div>
              </div>

              {/* AI explanation */}
              <div className={`result-ai-note ${result.is_anomaly ? 'result-ai-note--warn' : 'result-ai-note--ok'}`}>
                {result.is_anomaly
                  ? 'AI detected unusual transaction behavior based on Isolation Forest metrics. This warrants review — it is not confirmed as fraud.'
                  : 'This transaction appears completely within your normal spending pattern. No anomalies detected.'}
              </div>

              {/* Actions */}
              <div className="result-actions">
                <button className="btn-secondary" onClick={handleAddAnother} style={{ flex: 1 }}>
                  <PlusCircle size={15} /> Add Another
                </button>
                <button className="btn-primary btn-sm" onClick={() => navigate('/')} style={{ flex: 1 }}>
                  Dashboard <ArrowRight size={14} />
                </button>
              </div>
            </Card>
          )}

          {!loading && !result && (
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
                  marginBottom: '6px',
                }}
              >
                <Sparkles size={28} />
              </div>
              <p className="empty-state-title" style={{ fontSize: '1.1rem' }}>Ready to Analyze</p>
              <p style={{ color: 'var(--text-2)', maxWidth: '300px', margin: '0 auto' }}>
                Fill in the transaction details and click <strong>Analyze &amp; Save Expense</strong>.
              </p>
              <p className="empty-state-sub" style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                Our ML models will predict category and flag unusual amounts against your account balance.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
