import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, Lock, KeyRound, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function ResetPassword() {
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if there is an active session (set when clicking the Supabase recovery link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsRecoverySession(true);
      }
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setIsRecoverySession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.password) {
      setError('Please enter your new password.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: form.password,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon" style={{ background: '#eaf5ee', border: '1px solid rgba(82, 183, 136, 0.35)', padding: '4px' }}>
            <img src="/assets/expense-buddy/wallet-3d.svg" alt="" width="26" height="26" />
          </div>
          <span className="auth-brand-name">
            <span style={{ color: 'var(--eb-forest)' }}>Expense</span>{' '}
            <span style={{ color: 'var(--eb-emerald)' }}>Buddy</span>
          </span>
        </div>

        <h1 className="auth-title">Set new password</h1>
        <p className="auth-sub">Choose a secure password for your account.</p>

        {error && (
          <div className="auth-error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="auth-success">
            <CheckCircle2 size={40} className="auth-success-icon" />
            <h2 className="auth-title">Password updated!</h2>
            <p className="auth-sub">
              Your password has been changed successfully. You can now sign in with your new credentials.
            </p>
            <Link
              to="/login"
              className="btn-primary auth-submit"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}
            >
              <ArrowLeft size={16} /> Proceed to Sign In
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="reset-new-password" className="auth-label">New Password</label>
              <div className="auth-input-wrap">
                <Lock size={15} className="auth-input-icon" />
                <input
                  id="reset-new-password"
                  name="password"
                  type="password"
                  className="auth-input"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reset-confirm-password" className="auth-label">Confirm New Password</label>
              <div className="auth-input-wrap">
                <Lock size={15} className="auth-input-icon" />
                <input
                  id="reset-confirm-password"
                  name="confirm"
                  type="password"
                  className="auth-input"
                  placeholder="Repeat new password"
                  value={form.confirm}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Updating…' : (
                <><KeyRound size={16} /> Update Password</>
              )}
            </button>
          </form>
        )}

        <p className="auth-switch">
          Remember your old password?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
