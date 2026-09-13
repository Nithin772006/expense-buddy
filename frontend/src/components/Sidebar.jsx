import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  BarChart3,
  TrendingUp,
  Settings,
  Wallet,
  Upload,
  User,
  LogOut,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { purgeAllLocalTransactionCaches } from '../utils/storage';

const navItems = [
  { to: '/',                    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/add-expense',         icon: PlusCircle,      label: 'Add Expense' },
  { to: '/import-transactions', icon: Upload,           label: 'Import Transactions' },
  { to: '/spending-analysis',   icon: BarChart3,        label: 'Spending Analysis' },
  { to: '/forecast',            icon: TrendingUp,       label: 'Forecast' },
  { to: '/settings',            icon: Settings,         label: 'Settings' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = React.useState('');

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '');
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    purgeAllLocalTransactionCaches();
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Wallet size={22} />
        </div>
        <span className="sidebar-brand-name">Expense Buddy</span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {userEmail && (
          <div className="sidebar-user-chip" title={userEmail} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', fontSize: '0.78rem', color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: '0.5rem' }}>
            <User size={13} style={{ flexShrink: 0, color: '#38bdf8' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</span>
          </div>
        )}
        <button className="sidebar-signout" onClick={handleSignOut} title="Sign out">
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
        <span className="sidebar-badge">AI-Powered</span>
      </div>
    </aside>
  );
}
