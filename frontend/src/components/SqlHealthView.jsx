import React, { useState } from 'react';
import { DatabaseIcon, CheckCircleIcon, RefreshCwIcon, ServerIcon, ActivityIcon } from '../icons';

export default function SqlHealthView({ status, onRefresh }) {
  const [pingLatency, setPingLatency] = useState(null);
  const [testingPing, setTestingPing] = useState(false);

  const testPing = async () => {
    setTestingPing(true);
    const start = performance.now();
    try {
      await fetch('/api/status');
      const end = performance.now();
      setPingLatency(Math.round(end - start));
    } catch (e) {
      setPingLatency('Error');
    } finally {
      setTestingPing(false);
    }
  };

  const isConnected = status && status.status === 'connected';

  return (
    <div className="sql-health-container">
      {/* Connection Header Card */}
      <div className="card sql-hero-card">
        <div className="sql-hero-header">
          <div className="sql-hero-info">
            <div className="server-icon-wrap">
              <ServerIcon size={28} />
            </div>
            <div>
              <h2>MS SQL Server Connection</h2>
              <p className="card-desc">Connected to Dunes Deli & Catering POS instance</p>
            </div>
          </div>

          <div className="sql-hero-actions">
            <button 
              className="btn-primary"
              onClick={testPing}
              disabled={testingPing}
            >
              <ActivityIcon size={16} />
              <span>{testingPing ? 'Testing...' : 'Test Connection Latency'}</span>
            </button>
          </div>
        </div>

        {pingLatency !== null && (
          <div className="latency-banner">
            <CheckCircleIcon size={18} />
            <span>Connection round-trip latency to MS SQL Server: <strong>{pingLatency} ms</strong></span>
          </div>
        )}
      </div>

      {/* Grid: Server Config & Database Details */}
      <div className="sql-grid">
        {/* Left Column: Server Info */}
        <div className="card">
          <div className="card-header">
            <h3>Instance Parameters</h3>
          </div>
          <div className="spec-table">
            <div className="spec-row">
              <span className="spec-label">Server Host:</span>
              <span className="spec-val">DUNESSERVER</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">SQL Instance:</span>
              <span className="spec-val">JKSOFT</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Primary Database:</span>
              <span className="spec-val font-bold">JKRTDB (Restaurant Transaction DB)</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Master Database:</span>
              <span className="spec-val">JKRMDB (Master DB)</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Authentication:</span>
              <span className="spec-val">SQL Server Auth (sa)</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Connection State:</span>
              <span className="spec-val status-online">
                <CheckCircleIcon size={14} /> Active & Pool Ready
              </span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Backend API:</span>
              <span className="spec-val">Node.js Express + mssql driver (Port 5000)</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Frontend Web:</span>
              <span className="spec-val">React 18 + Vite (Port 3000)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Database Tables & Schema Overview */}
        <div className="card">
          <div className="card-header">
            <h3>Database Schema Highlights</h3>
          </div>
          <div className="schema-summary-list">
            <div className="schema-item">
              <div className="schema-table-name">rCategory</div>
              <div className="schema-table-desc">
                Menu categories (BYO Cold, Beverages, Custom Sandwich, Breakfast, Salads, Sides, etc.)
              </div>
            </div>

            <div className="schema-item">
              <div className="schema-table-name">rItem</div>
              <div className="schema-table-desc">
                Core menu items catalog with Pricing, Lunch Pricing, Kitchen Printer assignment, Sold Out status, and modifier links.
              </div>
            </div>

            <div className="schema-item">
              <div className="schema-table-name">rUpchargeGroup & rUpcharge</div>
              <div className="schema-table-desc">
                Modifiers, add-ons, preparation choices (Bread, Cheese, Style, Meat, Dressing) with upcharge prices.
              </div>
            </div>

            <div className="schema-item">
              <div className="schema-table-name">tInvoice & tItem</div>
              <div className="schema-table-desc">
                Sales transactions and itemized ticket receipts. Over 81,000 processed historical invoices.
              </div>
            </div>

            <div className="schema-item">
              <div className="schema-table-name">tPayment</div>
              <div className="schema-table-desc">
                Customer tenders (Cash, Credit Card, Giftcard, House Account) and batch settlement records.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
