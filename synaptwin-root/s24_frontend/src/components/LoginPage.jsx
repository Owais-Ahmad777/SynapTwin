import React, { useState } from 'react';
import {
  Shield, Building2, Lock, Eye, EyeOff, Sun, Moon, LogIn,
} from 'lucide-react';

// UI-ONLY login gate (Addendum 4): password-only demo auth, client-side.
// Admin "000" -> admin session; Supervisor + building "111" -> building session.
// No backend, token, or data logic lives here.
export default function LoginPage({ buildings = [], theme = 'dark', onToggleTheme, onLogin }) {
  const [role, setRole] = useState(null); // 'admin' | 'supervisor' | null
  const [building, setBuilding] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [shakeKey, setShakeKey] = useState(0);

  const pickRole = (r) => {
    setRole(r);
    setError('');
    if (r === 'admin') setBuilding('');
  };

  const canSubmit = Boolean(role) && password.length > 0 && (role === 'admin' || Boolean(building));

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    const ok = role === 'admin' ? password === '000' : password === '111';
    if (ok) {
      setError('');
      if (onLogin) onLogin(role === 'admin' ? { role: 'admin' } : { role: building });
    } else {
      setError('Incorrect password — try again');
      setShakeKey((k) => k + 1);
    }
  };

  return (
    <div className="st-login">
      <div className="st-login-glow" aria-hidden="true" />
      <button
        type="button"
        className="st-login-theme"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="st-login-card" key={shakeKey} data-shake={error ? '1' : '0'}>
        <h1 className="st-login-title">
          <span className="st-login-title-top">Welcome back to</span>
          <span className="st-login-brand">Synap<span>Twin</span></span>
        </h1>
        <p className="st-login-sub">Campus energy flexibility, in real time.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="st-login-label">Sign in as</div>
          <div className="st-login-roles">
            <button
              type="button"
              className={`st-login-role${role === 'admin' ? ' selected' : ''}`}
              onClick={() => pickRole('admin')}
              aria-pressed={role === 'admin'}
            >
              <span className="st-login-radio" aria-hidden="true" />
              <span className="st-login-role-icon"><Shield size={18} /></span>
              <b>Admin</b>
              <span>Full campus visibility &amp; controls.</span>
            </button>
            <button
              type="button"
              className={`st-login-role${role === 'supervisor' ? ' selected' : ''}`}
              onClick={() => pickRole('supervisor')}
              aria-pressed={role === 'supervisor'}
            >
              <span className="st-login-radio" aria-hidden="true" />
              <span className="st-login-role-icon"><Building2 size={18} /></span>
              <b>Building Supervisor</b>
              <span>Manage your own building&apos;s data.</span>
            </button>
          </div>

          {role === 'supervisor' && (
            <div className="st-login-field">
              <div className="st-login-label">Select your building</div>
              <select
                className="st-login-input"
                value={building}
                onChange={(e) => { setBuilding(e.target.value); setError(''); }}
                aria-label="Select your building"
              >
                <option value="" disabled>Choose a building…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="st-login-field">
            <div className="st-login-label">Password</div>
            <div className={`st-login-pw${error ? ' error' : ''}`}>
              <Lock size={15} className="st-login-pw-icon" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                placeholder="Enter Password"
                aria-label="Password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="st-login-eye"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && <div className="st-login-error">{error}</div>}
          </div>

          <button
            type="submit"
            className="st-login-cta"
            disabled={!canSubmit}
          >
            <LogIn size={15} />
            <span>Log In</span>
          </button>
        </form>

        <p className="st-login-foot">Contact your campus admin for access.</p>
      </div>
    </div>
  );
}
