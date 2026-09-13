import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import {
  getRecurringPayments,
  triggerRecurringDetection,
  confirmRecurringPayment,
  dismissRecurringPayment,
  pauseRecurringPayment,
  resumeRecurringPayment,
  markRecurringPaymentPaid,
  getPaymentCycleHistory,
} from '../services/api';
import { formatCurrency } from '../utils/constants';
import {
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Info,
  Calendar,
  IndianRupee,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  ChevronRight,
  Sparkles,
  HelpCircle,
  X,
  PlusCircle,
  Upload,
} from 'lucide-react';

export default function RecurringPayments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'mark_paid' | 'details' | null
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Mark Paid form state
  const [paidForm, setPaidForm] = useState({
    paid_date: new Date().toISOString().split('T')[0],
    actual_amount: '',
    notes: '',
  });

  const loadData = async () => {
    try {
      const res = await getRecurringPayments();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load recurring payments:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerRecurringDetection();
      await loadData();
    } catch (err) {
      console.error('Failed to refresh detection:', err);
      setRefreshing(false);
    }
  };

  const handleOpenMarkPaid = (payment) => {
    setSelectedPayment(payment);
    setPaidForm({
      paid_date: new Date().toISOString().split('T')[0],
      actual_amount: payment.average_amount || '',
      notes: '',
    });
    setActiveModal('mark_paid');
  };

  const handleSubmitMarkPaid = async (e) => {
    e.preventDefault();
    if (!selectedPayment) return;
    setActionLoading(true);
    try {
      await markRecurringPaymentPaid(selectedPayment.id, {
        paid_date: paidForm.paid_date,
        actual_amount: parseFloat(paidForm.actual_amount),
        notes: paidForm.notes || null,
      });
      setActiveModal(null);
      await loadData();
    } catch (err) {
      console.error('Error marking as paid:', err);
      alert('Failed to mark payment as paid: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDetails = async (payment) => {
    setSelectedPayment(payment);
    setActiveModal('details');
    setHistoryLoading(true);
    try {
      const res = await getPaymentCycleHistory(payment.id);
      setPaymentHistory(res.data?.billing_cycles || []);
    } catch (err) {
      console.error('Failed to load cycle history:', err);
      setPaymentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleConfirm = async (paymentId) => {
    setActionLoading(true);
    try {
      await confirmRecurringPayment(paymentId);
      await loadData();
    } catch (err) {
      console.error('Error confirming payment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismiss = async (paymentId) => {
    if (!window.confirm('Are you sure you want to dismiss this recurring pattern?')) return;
    setActionLoading(true);
    try {
      await dismissRecurringPayment(paymentId);
      await loadData();
    } catch (err) {
      console.error('Error dismissing payment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePause = async (payment) => {
    setActionLoading(true);
    try {
      if (payment.status === 'paused') {
        await resumeRecurringPayment(payment.id);
      } else {
        await pauseRecurringPayment(payment.id);
      }
      await loadData();
    } catch (err) {
      console.error('Error toggling pause status:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <Spinner size={36} />
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Analyzing recurring commitments...</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {
    active_count: 0,
    total_monthly_commitment: 0,
    due_soon_count: 0,
    due_today_count: 0,
    overdue_count: 0,
    paid_count: 0,
  };

  const confirmedPayments = data?.recurring_payments || [];
  const possiblePatterns = data?.possible_patterns || [];

  // Helper for status badge rendering
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <CheckCircle2 size={13} /> PAID
          </span>
        );
      case 'due_today':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
            <AlertTriangle size={13} /> DUE TODAY
          </span>
        );
      case 'due_soon':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            <Clock size={13} /> DUE SOON
          </span>
        );
      case 'overdue':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
            <AlertTriangle size={13} /> OVERDUE
          </span>
        );
      case 'missed':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.4)' }}>
            <AlertTriangle size={13} /> MISSED
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <Clock size={13} /> UPCOMING
          </span>
        );
    }
  };

  return (
    <div className="page" style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            <CalendarClock size={28} style={{ color: 'var(--primary, #6366f1)' }} />
            Recurring Payments & Reminders
          </h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', marginTop: '0.35rem', fontSize: '0.95rem' }}>
            Deterministic recurring commitment tracking with automatic payment cycle detection and due date reminders.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing || actionLoading}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: refreshing ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Re-analyzing...' : 'Refresh Detection'}
        </button>
      </div>

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Total Monthly Commitment
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)', marginTop: '0.4rem' }}>
            {formatCurrency(summary.total_monthly_commitment)}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#10b981', marginTop: '0.25rem' }}>
            {summary.active_count} Active Commitment{summary.active_count !== 1 ? 's' : ''}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Due Soon (Next 7 Days)
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: summary.due_soon_count > 0 ? '#f59e0b' : 'var(--text-primary, #f8fafc)', marginTop: '0.4rem' }}>
            {summary.due_soon_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '0.25rem' }}>
            Action required soon
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Due Today
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: summary.due_today_count > 0 ? '#ef4444' : 'var(--text-primary, #f8fafc)', marginTop: '0.4rem' }}>
            {summary.due_today_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '0.25rem' }}>
            Expected today
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Overdue / Missed
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: summary.overdue_count > 0 ? '#ef4444' : 'var(--text-primary, #f8fafc)', marginTop: '0.4rem' }}>
            {summary.overdue_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '0.25rem' }}>
            Unmatched past cycles
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Paid This Cycle
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#10b981', marginTop: '0.4rem' }}>
            {summary.paid_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#10b981', marginTop: '0.25rem' }}>
            Reconciled successfully
          </div>
        </Card>
      </div>

      {/* Main Section: Confirmed Commitments */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} style={{ color: '#10b981' }} />
              Confirmed Recurring Commitments
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', margin: '0.2rem 0 0 0' }}>
              High-confidence bills, subscriptions, and periodic commitments automatically verified from your transaction history.
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
            {confirmedPayments.length} Confirmed
          </span>
        </div>

        {confirmedPayments.length === 0 ? (
          <Card>
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
              <CalendarClock size={40} style={{ color: 'var(--text-secondary, #64748b)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No confirmed recurring payments yet</h3>
              <p style={{ color: 'var(--text-secondary, #94a3b8)', maxWidth: '480px', margin: '0 auto 1.5rem', fontSize: '0.9rem' }}>
                As you continue importing transactions or adding monthly utility and subscription expenses, our deterministic detector will establish confidence and track your billing cycles.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <Link to="/import-transactions" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Upload size={15} /> Import Transactions
                </Link>
                <Link to="/add-expense" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <PlusCircle size={15} /> Add Expense
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {confirmedPayments.map((p) => {
              const isPaused = p.status === 'paused';
              return (
                <div
                  key={p.id}
                  style={{
                    background: 'var(--card-bg, rgba(30, 41, 59, 0.7))',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                    opacity: isPaused ? 0.65 : 1,
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  {/* Top line: Merchant & Status */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #f8fafc)' }}>
                          {p.merchant}
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>
                          {p.category || 'General Recurring'} • <span style={{ textTransform: 'capitalize' }}>{p.frequency}</span>
                        </span>
                      </div>
                      <div>
                        {isPaused ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8' }}>
                            <PauseCircle size={12} /> Paused
                          </span>
                        ) : (
                          renderStatusBadge(p.current_cycle_status)
                        )}
                      </div>
                    </div>

                    {/* Amount & Frequency */}
                    <div style={{ margin: '1rem 0', padding: '0.85rem', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                        Typical Amount
                      </div>
                      <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.2rem' }}>
                        {formatCurrency(p.average_amount)}
                        <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary, #94a3b8)', marginLeft: '0.35rem' }}>
                          / {p.frequency}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          Stability: {p.amount_stability?.replace(/_/g, ' ')}
                        </span>
                        <span style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                          {p.confidence_score}% Confidence
                        </span>
                      </div>
                    </div>

                    {/* Payment Dates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.7rem' }}>Last Paid</div>
                        <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>{p.last_paid_date || 'N/A'}</div>
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.7rem' }}>Next Expected</div>
                        <div style={{ fontWeight: 600, marginTop: '0.15rem', color: p.current_cycle_status === 'due_soon' ? '#f59e0b' : (p.current_cycle_status === 'due_today' ? '#ef4444' : 'inherit') }}>
                          {p.next_expected_date || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.85rem' }}>
                    <button
                      onClick={() => handleOpenMarkPaid(p)}
                      disabled={actionLoading || p.is_paid}
                      className="btn-primary"
                      style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem', opacity: p.is_paid ? 0.5 : 1, cursor: p.is_paid ? 'not-allowed' : 'pointer' }}
                    >
                      {p.is_paid ? 'Paid' : 'Mark Paid'}
                    </button>
                    <button
                      onClick={() => handleOpenDetails(p)}
                      className="btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
                    >
                      Details
                    </button>
                    <button
                      onClick={() => handleTogglePause(p)}
                      title={isPaused ? 'Resume tracking' : 'Pause tracking'}
                      style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: 'var(--text-secondary, #94a3b8)', padding: '0.45rem 0.6rem', cursor: 'pointer' }}
                    >
                      {isPaused ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Possible Recurring Patterns */}
      {possiblePatterns.length > 0 && (
        <div style={{ marginTop: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                <Clock size={18} />
                Possible Recurring Patterns
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', margin: '0.2rem 0 0 0' }}>
                Repeated merchant activity detected, but irregular cadence or discretionary context prevents automatic confirmation.
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
              {possiblePatterns.length} Pattern{possiblePatterns.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {possiblePatterns.map((pattern, idx) => (
              <div
                key={pattern.id || idx}
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px dashed rgba(245, 158, 11, 0.3)',
                  borderRadius: '10px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{pattern.merchant}</h4>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                      {pattern.frequency}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0.5rem 0', color: 'var(--text-primary, #f8fafc)' }}>
                    {formatCurrency(pattern.average_amount || pattern.amount)}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '0.75rem' }}>
                    {pattern.occurrence_count || pattern.occurrences} transactions • {pattern.confidence_score}% score
                  </div>

                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', color: '#f59e0b', marginBottom: '0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{pattern.rejection_reason || 'Irregular payment intervals; pending further transaction evidence.'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {pattern.id && (
                    <button
                      onClick={() => handleConfirm(pattern.id)}
                      disabled={actionLoading}
                      className="btn-secondary"
                      style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                    >
                      Confirm Recurring
                    </button>
                  )}
                  {pattern.id && (
                    <button
                      onClick={() => handleDismiss(pattern.id)}
                      disabled={actionLoading}
                      style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.75rem', padding: '0.35rem 0.6rem', cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Mark As Paid */}
      {activeModal === 'mark_paid' && selectedPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--surface-bg, #1e293b)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', width: '100%', maxWidth: '440px', padding: '1.5rem', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={20} style={{ color: '#10b981' }} />
                Mark Payment as Paid
              </h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '1.25rem' }}>
              Confirm payment for <strong style={{ color: '#fff' }}>{selectedPayment.merchant}</strong>. This records a user-verified payment cycle without modifying raw bank records.
            </p>

            <form onSubmit={handleSubmitMarkPaid}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '0.35rem' }}>
                  Paid Date
                </label>
                <input
                  type="date"
                  required
                  value={paidForm.paid_date}
                  onChange={(e) => setPaidForm({ ...paidForm, paid_date: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '0.35rem' }}>
                  Actual Amount Paid (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paidForm.actual_amount}
                  onChange={(e) => setPaidForm({ ...paidForm, actual_amount: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '0.35rem' }}>
                  Optional Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid via UPI / GPay"
                  value={paidForm.notes}
                  onChange={(e) => setPaidForm({ ...paidForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setActiveModal(null)} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary" style={{ padding: '0.5rem 1.25rem' }}>
                  {actionLoading ? 'Recording...' : 'Confirm Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Payment Details & Evidence History */}
      {activeModal === 'details' && selectedPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--surface-bg, #1e293b)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{selectedPayment.merchant}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>
                  {selectedPayment.category} • {selectedPayment.confidence_score}% Detection Confidence
                </span>
              </div>
              <button onClick={() => setActiveModal(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* Explainable Detection Evidence */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShieldCheck size={16} /> Explainable Evidence
                </h4>
                <div style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', padding: '1rem' }}>
                  {selectedPayment.detection_evidence?.evidence_points?.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.4rem', color: '#e2e8f0' }}>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                      <span>{pt}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Average Interval: <strong>{selectedPayment.average_interval_days || 30} days</strong></span>
                    <span>Interval Std: <strong>±{selectedPayment.detection_evidence?.interval_std || 0}d</strong></span>
                  </div>
                </div>
              </div>

              {/* Billing Cycle History */}
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={16} /> Payment Cycle History
                </h4>
                {historyLoading ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem' }}><Spinner size={24} /></div>
                ) : paymentHistory.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', textAlign: 'center', padding: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                    No previous billing cycles recorded. New cycles are added as payments occur.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {paymentHistory.map((cycle) => (
                      <div
                        key={cycle.id}
                        style={{
                          background: 'rgba(0, 0, 0, 0.2)',
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderLeft: cycle.status === 'paid' ? '3px solid #10b981' : (cycle.status === 'overdue' ? '3px solid #ef4444' : '3px solid #f59e0b'),
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            Cycle: {cycle.billing_cycle_key}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '0.15rem' }}>
                            Expected: {cycle.expected_date} {cycle.paid_date ? `• Paid: ${cycle.paid_date}` : ''}
                          </div>
                          {cycle.notes && (
                            <div style={{ fontSize: '0.75rem', color: '#818cf8', marginTop: '0.2rem' }}>
                              Note: {cycle.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                            {formatCurrency(cycle.actual_amount || cycle.expected_amount)}
                          </div>
                          <div style={{ marginTop: '0.25rem' }}>
                            {renderStatusBadge(cycle.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'right' }}>
              <button onClick={() => setActiveModal(null)} className="btn-secondary" style={{ padding: '0.45rem 1.25rem' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
