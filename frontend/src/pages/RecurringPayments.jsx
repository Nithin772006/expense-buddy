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
  Sparkles,
  X,
  PlusCircle,
  Upload,
  CreditCard,
  Zap,
  ExternalLink,
  Tv,
  Music,
  Wifi,
  ShoppingBag,
  Home,
  Check,
} from 'lucide-react';

export default function RecurringPayments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'mark_paid' | 'details' | 'upi_pay' | null
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

  const handleOpenUpiPay = (payment) => {
    setSelectedPayment(payment);
    setActiveModal('upi_pay');
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
          <p style={{ marginTop: '1rem', color: 'var(--text-2, #476856)', fontWeight: 600 }}>Analyzing recurring commitments &amp; subscriptions...</p>
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

  const allConfirmed = data?.recurring_payments || [];
  const possiblePatterns = data?.possible_patterns || [];

  // Categorize into Subscriptions vs Household & Utility Bills
  const isSubscription = (p) => {
    const name = (p.merchant || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    return (
      cat.includes('subscript') ||
      cat.includes('entertain') ||
      name.includes('spotify') ||
      name.includes('netflix') ||
      name.includes('prime') ||
      name.includes('hotstar') ||
      name.includes('youtube') ||
      name.includes('apple') ||
      name.includes('google') ||
      name.includes('chatgpt')
    );
  };

  const subscriptions = allConfirmed.filter(isSubscription);
  const recurringBills = allConfirmed.filter((p) => !isSubscription(p));

  // Helper for status badge rendering
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#d8f3dc', color: '#1b4332', border: '1px solid rgba(82, 183, 136, 0.4)' }}>
            <CheckCircle2 size={13} /> PAID
          </span>
        );
      case 'due_today':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#fee2e2', color: '#b91c1c', border: '1px solid rgba(248, 113, 113, 0.4)' }}>
            <AlertTriangle size={13} /> DUE TODAY
          </span>
        );
      case 'due_soon':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#fef3c7', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
            <Clock size={13} /> DUE SOON
          </span>
        );
      case 'overdue':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#fee2e2', color: '#b91c1c', border: '1px solid rgba(248, 113, 113, 0.4)' }}>
            <AlertTriangle size={13} /> OVERDUE
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: '#eaf5ee', color: '#2d6a4f', border: '1px solid rgba(82, 183, 136, 0.3)' }}>
            <Clock size={13} /> UPCOMING
          </span>
        );
    }
  };

  const getMerchantIcon = (merchant) => {
    const m = (merchant || '').toLowerCase();
    if (m.includes('spotify') || m.includes('music')) return Music;
    if (m.includes('netflix') || m.includes('prime') || m.includes('tv')) return Tv;
    if (m.includes('net') || m.includes('wifi') || m.includes('fibernet') || m.includes('airtel')) return Wifi;
    if (m.includes('rent') || m.includes('society')) return Home;
    if (m.includes('power') || m.includes('electr') || m.includes('tneb')) return Zap;
    return CreditCard;
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart Recurring Payments &amp; Subscriptions</h1>
          <p className="page-subtitle">
            Deterministic recurring commitment tracking with cycle detection, smart usage intelligence, and instant UPI bill pay.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing || actionLoading}
          className="btn-secondary"
        >
          <RefreshCw size={14} className={refreshing ? 'eb-spin' : ''} />
          <span>{refreshing ? 'Re-analyzing…' : 'Refresh Detection'}</span>
        </button>
      </div>

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Total Monthly Commitment
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#132e22', letterSpacing: '-0.5px' }}>
            {formatCurrency(summary.total_monthly_commitment)}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#2d6a4f', marginTop: '4px', display: 'block', fontWeight: 600 }}>
            {summary.active_count} Active Commitment{summary.active_count !== 1 ? 's' : ''}
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Due Soon (Next 7 Days)
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: summary.due_soon_count > 0 ? '#b45309' : '#132e22', letterSpacing: '-0.5px' }}>
            {summary.due_soon_count}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#688a77', marginTop: '4px', display: 'block' }}>
            Action required soon
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Due Today
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: summary.due_today_count > 0 ? '#b91c1c' : '#132e22', letterSpacing: '-0.5px' }}>
            {summary.due_today_count}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#688a77', marginTop: '4px', display: 'block' }}>
            Scheduled for today
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Overdue / Missed
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: summary.overdue_count > 0 ? '#b91c1c' : '#132e22', letterSpacing: '-0.5px' }}>
            {summary.overdue_count}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#688a77', marginTop: '4px', display: 'block' }}>
            Unmatched past cycles
          </span>
        </Card>

        <Card style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#688a77', fontWeight: 700 }}>
            Paid This Cycle
          </span>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#1b4332', letterSpacing: '-0.5px' }}>
            {summary.paid_count}
          </p>
          <span style={{ fontSize: '0.75rem', color: '#2d6a4f', marginTop: '4px', display: 'block', fontWeight: 600 }}>
            Reconciled successfully
          </span>
        </Card>
      </div>

      {/* ── SECTION 1: Subscriptions & Smart Usage Intelligence ── */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#132e22', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={20} color="#2d6a4f" />
              Subscriptions &amp; Smart Detector
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#476856', margin: '3px 0 0 0' }}>
              Intelligent subscription evaluation, value assessment, and potential annual savings calculation.
            </p>
          </div>
          <span style={{ fontSize: '0.8rem', background: '#d8f3dc', color: '#1b4332', padding: '3px 10px', borderRadius: '999px', fontWeight: 700 }}>
            {subscriptions.length} Tracked
          </span>
        </div>

        {subscriptions.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '32px 20px' }}>
            <p style={{ color: '#476856', margin: 0, fontSize: '0.95rem' }}>
              No subscriptions detected yet. When you pay for Spotify, Netflix, Amazon Prime, or cloud services, they will appear here automatically.
            </p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {subscriptions.map((p) => {
              const IconComp = getMerchantIcon(p.merchant);
              const annualAmount = (p.average_amount || 0) * (p.frequency === 'yearly' ? 1 : 12);
              const isPaused = p.status === 'paused';
              const isLowUsage = p.amount_stability === 'variable_but_periodic' || p.confidence_score < 70;

              return (
                <div
                  key={p.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(82, 183, 136, 0.28)',
                    borderRadius: '16px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 16px rgba(13, 38, 28, 0.04)',
                    opacity: isPaused ? 0.65 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    {/* Top Row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: '#eaf5ee',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2d6a4f',
                          }}
                        >
                          <IconComp size={20} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#132e22' }}>
                            {p.merchant}
                          </h3>
                          <span style={{ fontSize: '0.78rem', color: '#688a77' }}>
                            {p.category} • <span style={{ textTransform: 'capitalize' }}>{p.frequency}</span>
                          </span>
                        </div>
                      </div>

                      {renderStatusBadge(p.current_cycle_status)}
                    </div>

                    {/* Price & Cadence */}
                    <div style={{ margin: '14px 0', padding: '12px 14px', background: '#f8faf9', borderRadius: '12px', border: '1px solid rgba(82, 183, 136, 0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1b4332' }}>
                          {formatCurrency(p.average_amount)}
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#688a77', marginLeft: '4px' }}>
                            /{p.frequency === 'yearly' ? 'yr' : 'mo'}
                          </span>
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#476856', fontWeight: 600 }}>
                          {p.confidence_score}% Confidence
                        </span>
                      </div>

                      {/* Smart Usage Intelligence Banner */}
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(82, 183, 136, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: '#688a77' }}>Potential annual cost:</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#132e22' }}>
                          {formatCurrency(annualAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Next Due Date info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', marginBottom: '14px' }}>
                      <div style={{ background: '#f4faf6', padding: '8px 10px', borderRadius: '8px' }}>
                        <div style={{ color: '#688a77', fontSize: '0.7rem' }}>Last Paid</div>
                        <div style={{ fontWeight: 700, color: '#132e22', marginTop: '2px' }}>{p.last_paid_date || 'N/A'}</div>
                      </div>
                      <div style={{ background: '#f4faf6', padding: '8px 10px', borderRadius: '8px' }}>
                        <div style={{ color: '#688a77', fontSize: '0.7rem' }}>Next Expected</div>
                        <div style={{ fontWeight: 700, color: '#132e22', marginTop: '2px' }}>{p.next_expected_date || 'N/A'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(82, 183, 136, 0.15)', paddingTop: '12px' }}>
                    {!p.is_paid && (p.current_cycle_status === 'due_soon' || p.current_cycle_status === 'due_today' || p.current_cycle_status === 'overdue') && (
                      <button
                        onClick={() => handleOpenUpiPay(p)}
                        className="btn-primary"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem' }}
                      >
                        Pay Now
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenMarkPaid(p)}
                      disabled={actionLoading || p.is_paid}
                      className="btn-secondary"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem' }}
                    >
                      {p.is_paid ? 'Paid' : 'Mark Paid'}
                    </button>
                    <button
                      onClick={() => handleOpenDetails(p)}
                      className="btn-ghost"
                      style={{ fontSize: '0.82rem' }}
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 2: Smart Recurring Payment Reminders (Bills & Utilities) ── */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#132e22', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} color="#2d6a4f" />
              Household Bills &amp; Recurring Commitments
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#476856', margin: '3px 0 0 0' }}>
              Electricity, Wi-Fi, Gas cylinder, Milk vendor, Water, and Rent reminders with quick UPI settlement.
            </p>
          </div>
          <span style={{ fontSize: '0.8rem', background: '#d8f3dc', color: '#1b4332', padding: '3px 10px', borderRadius: '999px', fontWeight: 700 }}>
            {recurringBills.length} Active Bills
          </span>
        </div>

        {recurringBills.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '32px 20px' }}>
            <p style={{ color: '#476856', margin: 0, fontSize: '0.95rem' }}>
              No utility bills detected yet. Add or import your monthly bills to activate due date tracking.
            </p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {recurringBills.map((p) => {
              const IconComp = getMerchantIcon(p.merchant);
              const isDue = p.current_cycle_status === 'due_soon' || p.current_cycle_status === 'due_today' || p.current_cycle_status === 'overdue';

              return (
                <div
                  key={p.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(82, 183, 136, 0.28)',
                    borderRadius: '16px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 16px rgba(13, 38, 28, 0.04)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: '#eaf5ee',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2d6a4f',
                          }}
                        >
                          <IconComp size={20} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#132e22' }}>
                            {p.merchant}
                          </h3>
                          <span style={{ fontSize: '0.78rem', color: '#688a77' }}>
                            {p.category} • {p.frequency}
                          </span>
                        </div>
                      </div>
                      {renderStatusBadge(p.current_cycle_status)}
                    </div>

                    <div style={{ margin: '14px 0', padding: '12px 14px', background: '#f8faf9', borderRadius: '12px', border: '1px solid rgba(82, 183, 136, 0.15)' }}>
                      <div style={{ fontSize: '0.75rem', color: '#688a77', textTransform: 'uppercase', fontWeight: 700 }}>
                        Expected Amount
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1b4332', marginTop: '2px' }}>
                        {formatCurrency(p.average_amount)}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#476856', marginTop: '4px' }}>
                        Due on: <strong>{p.next_expected_date || 'This Month'}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(82, 183, 136, 0.15)', paddingTop: '12px' }}>
                    {isDue && !p.is_paid && (
                      <button
                        onClick={() => handleOpenUpiPay(p)}
                        className="btn-primary"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                      >
                        <ExternalLink size={14} /> Pay Now (UPI)
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenMarkPaid(p)}
                      disabled={actionLoading || p.is_paid}
                      className="btn-secondary"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                    >
                      {p.is_paid ? 'Paid' : 'Mark Paid'}
                    </button>
                    <button
                      onClick={() => handleOpenDetails(p)}
                      className="btn-ghost"
                      style={{ fontSize: '0.85rem' }}
                    >
                      History
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 3: Possible Recurring Patterns ── */}
      {possiblePatterns.length > 0 && (
        <div style={{ marginTop: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} />
                Possible Recurring Patterns Detected
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#476856', margin: '2px 0 0 0' }}>
                Repeated merchant activity detected with irregular cadence or discretionary context.
              </p>
            </div>
            <span style={{ fontSize: '0.8rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
              {possiblePatterns.length} Patterns
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {possiblePatterns.map((pattern, idx) => (
              <div
                key={pattern.id || idx}
                style={{
                  background: '#ffffff',
                  border: '1.5px dashed rgba(245, 158, 11, 0.4)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 8px rgba(13, 38, 28, 0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#132e22' }}>{pattern.merchant}</h4>
                    <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      {pattern.frequency}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.4rem 0', color: '#1b4332' }}>
                    {formatCurrency(pattern.average_amount || pattern.amount)}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#688a77', marginBottom: '8px' }}>
                    {pattern.occurrence_count || pattern.occurrences} transactions • {pattern.confidence_score}% score
                  </div>

                  <div style={{ background: '#fffbeb', padding: '8px 10px', borderRadius: '8px', fontSize: '0.78rem', color: '#b45309', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{pattern.rejection_reason || 'Irregular payment intervals; pending further transaction evidence.'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {pattern.id && (
                    <button
                      onClick={() => handleConfirm(pattern.id)}
                      disabled={actionLoading}
                      className="btn-secondary"
                      style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px' }}
                    >
                      Confirm Recurring
                    </button>
                  )}
                  {pattern.id && (
                    <button
                      onClick={() => handleDismiss(pattern.id)}
                      disabled={actionLoading}
                      className="btn-ghost"
                      style={{ color: '#dc2626', fontSize: '0.8rem' }}
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

      {/* ── Modal: UPI Payment Flow (Direct Redirection / Intent) ── */}
      {activeModal === 'upi_pay' && selectedPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13, 38, 28, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
          <div style={{ background: '#ffffff', border: '1px solid rgba(82, 183, 136, 0.35)', borderRadius: '20px', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 50px rgba(13, 38, 28, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#d8f3dc', color: '#1b4332', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ExternalLink size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#132e22' }}>
                    Pay via UPI
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#688a77' }}>Direct settlement for verified bill</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} style={{ background: 'transparent', border: 'none', color: '#688a77', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px', background: '#f8faf9', borderRadius: '14px', border: '1px solid var(--border)', textAlign: 'center', margin: '14px 0' }}>
              <span style={{ fontSize: '0.8rem', color: '#688a77', textTransform: 'uppercase', fontWeight: 700 }}>
                {selectedPayment.merchant}
              </span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1b4332', margin: '4px 0' }}>
                {formatCurrency(selectedPayment.average_amount)}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#476856', margin: 0 }}>
                Next due: {selectedPayment.next_expected_date || 'Immediate'}
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '0.85rem', color: '#476856', marginBottom: '10px' }}>
                Choose your preferred payment method:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a
                  href={`upi://pay?pa=bills@upi&pn=${encodeURIComponent(selectedPayment.merchant)}&am=${selectedPayment.average_amount}&cu=INR`}
                  className="btn-primary"
                  style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
                  onClick={() => {
                    setTimeout(() => handleOpenMarkPaid(selectedPayment), 1200);
                  }}
                >
                  <Zap size={16} /> Open UPI App (GPay / PhonePe / Paytm)
                </a>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleOpenMarkPaid(selectedPayment)}
                  style={{ width: '100%' }}
                >
                  <Check size={16} /> Already Paid? Record Payment
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'center', borderTop: '1px solid rgba(82, 183, 136, 0.15)', paddingTop: '10px' }}>
              <button type="button" onClick={() => setActiveModal(null)} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Mark As Paid ── */}
      {activeModal === 'mark_paid' && selectedPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13, 38, 28, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
          <div style={{ background: '#ffffff', border: '1px solid rgba(82, 183, 136, 0.35)', borderRadius: '20px', width: '100%', maxWidth: '440px', padding: '24px', boxShadow: '0 20px 50px rgba(13, 38, 28, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#132e22', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={20} color="#2d6a4f" />
                Mark Payment as Paid
              </h3>
              <button onClick={() => setActiveModal(null)} style={{ background: 'transparent', border: 'none', color: '#688a77', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#476856', marginBottom: '16px' }}>
              Confirm payment for <strong style={{ color: '#132e22' }}>{selectedPayment.merchant}</strong>. This records a verified cycle in your financial database.
            </p>

            <form onSubmit={handleSubmitMarkPaid} className="form">
              <div className="form-field">
                <label>Paid Date</label>
                <input
                  type="date"
                  required
                  value={paidForm.paid_date}
                  onChange={(e) => setPaidForm({ ...paidForm, paid_date: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Actual Amount Paid (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paidForm.actual_amount}
                  onChange={(e) => setPaidForm({ ...paidForm, actual_amount: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Optional Note</label>
                <input
                  type="text"
                  placeholder="e.g. Paid via UPI / GPay / NetBanking"
                  value={paidForm.notes}
                  onChange={(e) => setPaidForm({ ...paidForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setActiveModal(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary">
                  {actionLoading ? 'Recording…' : 'Confirm Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Payment Details & Evidence History ── */}
      {activeModal === 'details' && selectedPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13, 38, 28, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
          <div style={{ background: '#ffffff', border: '1px solid rgba(82, 183, 136, 0.35)', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(13, 38, 28, 0.15)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(82, 183, 136, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#132e22' }}>{selectedPayment.merchant}</h3>
                <span style={{ fontSize: '0.8rem', color: '#688a77' }}>
                  {selectedPayment.category} • {selectedPayment.confidence_score}% Detection Confidence
                </span>
              </div>
              <button onClick={() => setActiveModal(null)} style={{ background: 'transparent', border: 'none', color: '#688a77', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {/* Explainable Detection Evidence */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShieldCheck size={16} /> Explainable Evidence
                </h4>
                <div style={{ background: '#f8faf9', borderRadius: '12px', border: '1px solid var(--border)', padding: '14px' }}>
                  {selectedPayment.detection_evidence?.evidence_points?.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '6px', color: '#132e22' }}>
                      <span style={{ color: '#2d6a4f', fontWeight: 800 }}>✓</span>
                      <span>{pt}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(82, 183, 136, 0.15)', fontSize: '0.8rem', color: '#476856', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Average Interval: <strong>{selectedPayment.average_interval_days || 30} days</strong></span>
                    <span>Interval Std: <strong>±{selectedPayment.detection_evidence?.interval_std || 0}d</strong></span>
                  </div>
                </div>
              </div>

              {/* Billing Cycle History */}
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#688a77', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={16} /> Payment Cycle History
                </h4>
                {historyLoading ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem' }}><Spinner size={24} /></div>
                ) : paymentHistory.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: '#688a77', textAlign: 'center', padding: '1rem', background: '#f8faf9', borderRadius: '10px' }}>
                    No previous billing cycles recorded. New cycles are added as payments occur.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {paymentHistory.map((cycle) => (
                      <div
                        key={cycle.id}
                        style={{
                          background: '#ffffff',
                          border: '1px solid var(--border)',
                          padding: '12px 14px',
                          borderRadius: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#132e22' }}>
                            Cycle: {cycle.billing_cycle_key}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#688a77', marginTop: '2px' }}>
                            Expected: {cycle.expected_date} {cycle.paid_date ? `• Paid: ${cycle.paid_date}` : ''}
                          </div>
                          {cycle.notes && (
                            <div style={{ fontSize: '0.75rem', color: '#2d6a4f', marginTop: '2px', fontWeight: 500 }}>
                              Note: {cycle.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1b4332' }}>
                            {formatCurrency(cycle.actual_amount || cycle.expected_amount)}
                          </div>
                          <div style={{ marginTop: '3px' }}>
                            {renderStatusBadge(cycle.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(82, 183, 136, 0.15)', textAlign: 'right' }}>
              <button onClick={() => setActiveModal(null)} className="btn-secondary" style={{ padding: '8px 18px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
