import React, { useState } from 'react';
import { UtensilsIcon, CheckCircleIcon, AlertCircleIcon } from '../icons';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('dunes2026');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      // Store token in localStorage
      localStorage.setItem('jkpos_auth_token', data.token);
      localStorage.setItem('jkpos_username', data.username);

      onLoginSuccess(data.token, data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-brand-logo">
            <UtensilsIcon size={32} />
          </div>
          <h2>JKRestaurant POS</h2>
          <span className="brand-badge">DUNES DELI & CATERING</span>
          <p className="login-subtext">Enter your master credentials to unlock POS and utilities</p>
        </div>

        {error && (
          <div className="login-error-alert">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Master Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              placeholder="e.g. admin"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Master Password:</label>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                placeholder="Enter password..."
                required
              />
              <button
                type="button"
                className="btn-show-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-login-submit"
            disabled={loading}
          >
            {loading ? 'Verifying Credentials...' : 'UNLOCK POS & UTILITIES'}
          </button>
        </form>

        <div className="login-footer">
          <span>🔒 Secured connection to <strong>DUNESSERVER\JKSOFT</strong></span>
        </div>
      </div>
    </div>
  );
}
