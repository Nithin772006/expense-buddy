import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

/**
 * LoginCard
 * Premium 3D glass-like cream/green login card preserving all authentication logic,
 * error presentation, and password visibility toggle.
 */
export default function LoginCard({
  form,
  loading,
  error,
  onChange,
  onSubmit,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="eb-card-container">
      {/* 3D Card Surface */}
      <div className="eb-card">
        {/* Header */}
        <div className="eb-card-header">
          <h1 className="eb-card-title">Welcome back</h1>
          <p className="eb-card-subtitle">
            Sign in to access your financial dashboard.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="eb-alert eb-alert-error" role="alert" aria-live="assertive">
            <AlertCircle size={16} className="eb-alert-icon" />
            <span className="eb-alert-text">{error}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form className="eb-form" onSubmit={onSubmit} noValidate>
          {/* Email Field */}
          <div className="eb-field">
            <label htmlFor="login-email" className="eb-label">
              EMAIL
            </label>
            <div className="eb-input-wrapper">
              <span className="eb-input-icon-left" aria-hidden="true">
                <Mail size={17} />
              </span>
              <input
                id="login-email"
                name="email"
                type="email"
                className="eb-input"
                placeholder="Enter your email address"
                value={form.email}
                onChange={onChange}
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="eb-field">
            <div className="eb-label-row">
              <label htmlFor="login-password" className="eb-label">
                PASSWORD
              </label>
              <Link
                to="/forgot-password"
                className="eb-forgot-link"
                tabIndex={0}
              >
                Forgot password?
              </Link>
            </div>
            <div className="eb-input-wrapper">
              <span className="eb-input-icon-left" aria-hidden="true">
                <Lock size={17} />
              </span>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="eb-input eb-input-password"
                placeholder="Enter your password"
                value={form.password}
                onChange={onChange}
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="eb-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 3D Green Sign In Button */}
          <button
            type="submit"
            className={`eb-btn-submit ${loading ? 'is-loading' : ''}`}
            disabled={loading}
          >
            <span className="eb-btn-content">
              {loading ? (
                <>
                  <Loader2 size={18} className="eb-spinner" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={17} className="eb-btn-arrow" />
                </>
              )}
            </span>
            <span className="eb-btn-glare" aria-hidden="true" />
          </button>
        </form>

        {/* Footer / Create Account */}
        <div className="eb-card-footer">
          <p className="eb-switch-text">
            Don't have an account?{' '}
            <Link to="/register" className="eb-register-link">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
