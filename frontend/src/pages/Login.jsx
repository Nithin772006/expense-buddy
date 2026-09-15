import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import LoginBrand from '../components/login/LoginBrand';
import LoginCard from '../components/login/LoginCard';
import FloatingFinanceElements from '../components/login/FloatingFinanceElements';
import VideoShowcase from '../components/login/VideoShowcase';
import './Login.css';

/**
 * Login Page
 * Completely redesigned 3D Green FinTech experience matching the 3D Expense Buddy
 * animated video and character visual universe.
 * 
 * Preserves all Supabase authentication logic, validation, error handling,
 * and routing intact.
 */
export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });
  
  const navigate = useNavigate();
  const rafRef = useRef(null);

  // Smooth mousemove parallax tracking for background/decorative elements
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        // Calculate normalized offset from center of screen (-1 to 1)
        const { innerWidth, innerHeight } = window;
        const normX = (e.clientX - innerWidth / 2) / (innerWidth / 2);
        const normY = (e.clientY - innerHeight / 2) / (innerHeight / 2);

        setParallaxOffset({
          x: Math.max(-1, Math.min(1, normX)),
          y: Math.max(-1, Math.min(1, normY)),
        });
        rafRef.current = null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.email.trim() || !form.password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

      if (authError) throw authError;
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="eb-login-page">
      {/* Ambient background glow & subtle grid */}
      <div className="eb-ambient-blob eb-blob-1" aria-hidden="true" />
      <div className="eb-ambient-blob eb-blob-2" aria-hidden="true" />
      <div className="eb-bg-grid-overlay" aria-hidden="true" />

      {/* Main Two-Column Layout */}
      <div className="eb-login-wrapper">
        {/* LEFT 70% — Primary Login Experience & 3D Ecosystem */}
        <section className="eb-main-panel" aria-label="Sign In Section">
          {/* Brand header */}
          <LoginBrand />

          {/* Central Stage: Login Card framed by 3D Floating Ecosystem */}
          <div className="eb-center-stage">
            <FloatingFinanceElements parallaxOffset={parallaxOffset} />
            <LoginCard
              form={form}
              loading={loading}
              error={error}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Footer note / copyright */}
          <footer className="eb-panel-footer">
            <span style={{ fontSize: '11.5px', color: 'var(--eb-text-subtle)', opacity: 0.8 }}>
              © {new Date().getFullYear()} Expense Buddy. All rights reserved.
            </span>
          </footer>
        </section>

        {/* RIGHT 30% — Animated Video Showcase with Perimeter Light */}
        <VideoShowcase />
      </div>
    </main>
  );
}
