import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  BarChart3,
  TrendingUp,
  CalendarClock,
  Upload,
  Settings,
  LogOut,
  Bell,
  Sparkles,
  CheckCircle2,
  XCircle,
  Menu,
  X,
  ChevronDown,
  AlertTriangle,
  User,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { purgeAllLocalTransactionCaches } from '../utils/storage';
import { healthCheck, processUserMl, getRecurringPayments } from '../services/api';
import { fetchTransactions } from '../services/transactionService';
import { formatCurrency } from '../utils/constants';
import './TopNavigation.css';

const NAV_ITEMS = [
  { to: '/',                    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/add-expense',         icon: PlusCircle,      label: 'Add Expense' },
  { to: '/import-transactions', icon: Upload,           label: 'Import' },
  { to: '/spending-analysis',   icon: BarChart3,        label: 'Analysis' },
  { to: '/forecast',            icon: TrendingUp,       label: 'Forecast' },
  { to: '/recurring-payments',  icon: CalendarClock,    label: 'Recurring' },
];

export default function TopNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const [userEmail, setUserEmail] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const [aiRunning, setAiRunning] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dropdowns
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const profileRef = useRef(null);
  const notifRef = useRef(null);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Auth & Data for Notifications & Backend Health
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '');
    });

    // Check backend health
    healthCheck()
      .then((res) => {
        setIsOnline(res.data?.status === 'healthy');
      })
      .catch(() => setIsOnline(false))
      .finally(() => setCheckingHealth(false));

    // Load smart notifications
    loadNotifications();

    return () => subscription.unsubscribe();
  }, []);

  const loadNotifications = async () => {
    try {
      const [txs, recRes] = await Promise.all([
        fetchTransactions({ limit: 100 }).catch(() => []),
        getRecurringPayments().catch(() => ({ data: null })),
      ]);

      const items = [];
      const recPayments = recRes?.data?.recurring_payments || [];

      // Due soon or overdue bills
      recPayments.forEach((p) => {
        if (p.current_cycle_status === 'due_soon' || p.current_cycle_status === 'due_today') {
          items.push({
            id: `rec-${p.id}`,
            type: 'bill_due',
            icon: CalendarClock,
            title: `${p.merchant} payment due soon`,
            desc: `${formatCurrency(p.average_amount)} expected by ${p.next_expected_date || 'this week'}`,
            to: '/recurring-payments',
            badge: 'Due Soon',
            badgeColor: 'amber',
          });
        } else if (p.current_cycle_status === 'overdue') {
          items.push({
            id: `rec-overdue-${p.id}`,
            type: 'bill_overdue',
            icon: AlertTriangle,
            title: `${p.merchant} is overdue`,
            desc: `Action needed for ${formatCurrency(p.average_amount)}`,
            to: '/recurring-payments',
            badge: 'Overdue',
            badgeColor: 'red',
          });
        }
      });

      // Anomalies detected
      const anomalies = (txs || []).filter((t) => t.is_anomaly);
      if (anomalies.length > 0) {
        items.push({
          id: 'anomalies',
          type: 'anomaly',
          icon: ShieldCheck,
          title: `${anomalies.length} unusual expense${anomalies.length > 1 ? 's' : ''} flagged`,
          desc: 'Isolation Forest detected spending deviations. Review transactions on Dashboard.',
          to: '/',
          badge: 'Review',
          badgeColor: 'red',
        });
      }

      // Default notification if empty
      if (items.length === 0) {
        items.push({
          id: 'ai-ready',
          type: 'info',
          icon: Sparkles,
          title: 'AI Intelligence active',
          desc: 'Expense categorization, anomaly detection, and clustering models are ready.',
          to: '/',
          badge: 'Active',
          badgeColor: 'green',
        });
      }

      setNotifications(items);
    } catch {
      // Graceful fallback
    }
  };

  const handleRunAi = async () => {
    setAiRunning(true);
    try {
      await processUserMl(false);
      await loadNotifications();
      // Dispatch a custom event so the current active page can refresh if needed
      window.dispatchEvent(new CustomEvent('eb:ml-completed'));
    } catch (err) {
      console.error('AI analysis trigger error:', err);
    } finally {
      setAiRunning(false);
    }
  };

  const handleSignOut = async () => {
    purgeAllLocalTransactionCaches();
    await supabase.auth.signOut();
    navigate('/login');
  };

  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';

  return (
    <header className="eb-top-nav">
      <div className="eb-top-nav-inner">
        {/* LEFT: Expense Buddy Logo Brand */}
        <Link to="/" className="eb-nav-brand" title="Expense Buddy Home">
          <div className="eb-nav-logo-mark">
            <img
              src="/assets/expense-buddy/wallet-3d.svg"
              alt="Expense Buddy"
              className="eb-nav-logo-img"
              width="36"
              height="36"
            />
          </div>
          <div className="eb-nav-brand-text">
            <span className="eb-brand-expense">Expense</span>
            <span className="eb-brand-buddy">Buddy</span>
          </div>
          <span className="eb-nav-badge">AI</span>
        </Link>

        {/* CENTER: Navigation Links */}
        <nav className="eb-nav-links">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `eb-nav-link${isActive ? ' eb-nav-link--active' : ''}`
              }
            >
              <Icon size={16} className="eb-nav-link-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* RIGHT: Status, AI Action, Notifications & Profile */}
        <div className="eb-nav-right">
          {/* Backend Status Pill */}
          <div
            className={`eb-status-chip ${
              isOnline ? 'eb-status-chip--ok' : 'eb-status-chip--err'
            }`}
            title={
              checkingHealth
                ? 'Checking backend status...'
                : isOnline
                ? 'FastAPI ML Backend Connected'
                : 'FastAPI ML Backend Offline'
            }
          >
            <span className="eb-status-dot" />
            <span className="eb-status-text">
              {checkingHealth ? 'Checking…' : isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* AI Run Analysis Button */}
          <button
            className="eb-nav-ai-btn"
            onClick={handleRunAi}
            disabled={aiRunning}
            title="Run AI models across your transactions"
          >
            <Sparkles size={14} className={aiRunning ? 'eb-spin' : ''} />
            <span className="eb-nav-ai-btn-text">
              {aiRunning ? 'Analyzing…' : 'AI Analysis'}
            </span>
          </button>

          {/* Notifications Dropdown */}
          <div className="eb-dropdown-wrap" ref={notifRef}>
            <button
              className={`eb-icon-btn ${notifOpen ? 'eb-icon-btn--active' : ''}`}
              onClick={() => setNotifOpen(!notifOpen)}
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {notifications.some((n) => n.badgeColor === 'amber' || n.badgeColor === 'red') && (
                <span className="eb-notif-dot" />
              )}
            </button>

            {notifOpen && (
              <div className="eb-dropdown-menu eb-notif-menu">
                <div className="eb-dropdown-header">
                  <div>
                    <h4 className="eb-dropdown-title">Notifications</h4>
                    <p className="eb-dropdown-subtitle">Smart alerts &amp; reminders</p>
                  </div>
                  <span className="eb-notif-count-pill">{notifications.length}</span>
                </div>

                <div className="eb-notif-list">
                  {notifications.map((n) => (
                    <Link
                      key={n.id}
                      to={n.to}
                      className="eb-notif-item"
                      onClick={() => setNotifOpen(false)}
                    >
                      <div className={`eb-notif-icon-wrap eb-notif-icon--${n.badgeColor}`}>
                        <n.icon size={16} />
                      </div>
                      <div className="eb-notif-body">
                        <div className="eb-notif-row">
                          <span className="eb-notif-title">{n.title}</span>
                          <span className={`eb-notif-badge eb-notif-badge--${n.badgeColor}`}>
                            {n.badge}
                          </span>
                        </div>
                        <p className="eb-notif-desc">{n.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="eb-dropdown-wrap" ref={profileRef}>
            <button
              className="eb-profile-btn"
              onClick={() => setProfileOpen(!profileOpen)}
              title="Account Menu"
              aria-label="Account Menu"
            >
              <div className="eb-avatar-circle">{userInitial}</div>
              <ChevronDown size={14} className={`eb-chevron ${profileOpen ? 'eb-chevron--open' : ''}`} />
            </button>

            {profileOpen && (
              <div className="eb-dropdown-menu eb-profile-menu">
                <div className="eb-profile-header">
                  <div className="eb-avatar-large">{userInitial}</div>
                  <div className="eb-profile-info">
                    <span className="eb-profile-name">Expense Buddy User</span>
                    <span className="eb-profile-email" title={userEmail}>
                      {userEmail || 'user@expensebuddy.app'}
                    </span>
                  </div>
                </div>

                <div className="eb-dropdown-divider" />

                <Link
                  to="/settings"
                  className="eb-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={15} />
                  <span>Account &amp; Settings</span>
                </Link>

                <Link
                  to="/recurring-payments"
                  className="eb-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <CreditCard size={15} />
                  <span>Manage Subscriptions</span>
                </Link>

                <div className="eb-dropdown-divider" />

                <button
                  className="eb-dropdown-item eb-dropdown-item--danger"
                  onClick={handleSignOut}
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            className="eb-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="eb-mobile-drawer">
          <nav className="eb-mobile-nav">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `eb-mobile-nav-link${isActive ? ' eb-mobile-nav-link--active' : ''}`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
            <div className="eb-mobile-divider" />
            <Link to="/settings" className="eb-mobile-nav-link">
              <Settings size={18} />
              <span>Settings</span>
            </Link>
            <button className="eb-mobile-nav-link eb-mobile-signout" onClick={handleSignOut}>
              <LogOut size={18} />
              <span>Sign Out ({userEmail})</span>
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
