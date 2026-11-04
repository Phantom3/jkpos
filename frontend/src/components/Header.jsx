import React from 'react';
import { DatabaseIcon, UtensilsIcon, ReceiptIcon, SlidersIcon, ActivityIcon, RefreshCwIcon } from '../icons';

export default function Header({ activeTab, setActiveTab, status, onRefresh, refreshing, currentUser, onLogout }) {
  const isConnected = status && status.status === 'connected';

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand-container">
          <div className="brand-logo">
            <UtensilsIcon size={24} />
          </div>
          <div className="brand-info">
            <div className="brand-title">
              <h1>JKRestaurant POS</h1>
              <span className="brand-badge">SQL Live Web Client</span>
            </div>
            <p className="brand-subtitle">{status?.storeName || 'Dunes Deli & Catering'}</p>
          </div>
        </div>

        <div className="header-actions">
          <div className={`db-status-pill ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <DatabaseIcon size={15} />
            <span className="status-text">
              {isConnected 
                ? `${status.server}\\${status.instance} (${status.database})` 
                : 'Connecting to MS SQL Server...'}
            </span>
          </div>

          <button 
            className={`btn-refresh ${refreshing ? 'spinning' : ''}`}
            onClick={onRefresh}
            title="Refresh Live Data"
            disabled={refreshing}
          >
            <RefreshCwIcon size={16} />
            <span>Sync</span>
          </button>

          {currentUser && (
            <button 
              className="btn-logout"
              onClick={onLogout}
              title="Lock POS & Sign Out"
            >
              <span>🔒 Lock / Sign Out ({currentUser})</span>
            </button>
          )}
        </div>
      </div>

      <nav className="header-nav">
        <button 
          className={`nav-btn ${activeTab === 'pos' ? 'active pos-highlight' : ''}`}
          onClick={() => setActiveTab('pos')}
        >
          <UtensilsIcon size={18} />
          <span>Take Orders (Tablet POS)</span>
        </button>

        <button 
          className={`nav-btn ${activeTab === 'sandwiches' ? 'active' : ''}`}
          onClick={() => setActiveTab('sandwiches')}
        >
          <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>🥪</span>
          <span>Top 5 Sandwiches</span>
        </button>

        <button 
          className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <ActivityIcon size={18} />
          <span>Dashboard</span>
        </button>

        <button 
          className={`nav-btn ${activeTab === 'menu' ? 'active' : ''}`}
          onClick={() => setActiveTab('menu')}
        >
          <UtensilsIcon size={18} />
          <span>Menu & Pricing</span>
        </button>

        <button 
          className={`nav-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <ReceiptIcon size={18} />
          <span>Orders & Receipts</span>
        </button>

        <button 
          className={`nav-btn ${activeTab === 'modifiers' ? 'active' : ''}`}
          onClick={() => setActiveTab('modifiers')}
        >
          <SlidersIcon size={18} />
          <span>Modifiers & Upcharges</span>
        </button>

        <button 
          className={`nav-btn ${activeTab === 'sql' ? 'active' : ''}`}
          onClick={() => setActiveTab('sql')}
        >
          <DatabaseIcon size={18} />
          <span>SQL Server Diagnostics</span>
        </button>
      </nav>
    </header>
  );
}
