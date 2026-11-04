import React from 'react';
import { UtensilsIcon, ReceiptIcon, DollarSignIcon, DatabaseIcon, AlertCircleIcon } from '../icons';

export default function Dashboard({ stats, onSelectCategory, onNavigate, onSearchItem }) {
  const overview = stats?.overview || {};
  const recentOrders = stats?.recentOrders || [];

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString();
  };

  return (
    <div className="dashboard-container">
      {/* KPI Stats Row */}
      <div className="kpi-grid">
        <div className="kpi-card highlight-blue" onClick={() => onNavigate('menu')}>
          <div className="kpi-icon-wrap">
            <UtensilsIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Active Menu Items</span>
            <span className="kpi-value">{overview.totalItems?.toLocaleString() || '0'}</span>
            <span className="kpi-subtext">Across {overview.totalCategories || 0} categories</span>
          </div>
        </div>

        <div className="kpi-card highlight-emerald" onClick={() => onNavigate('orders')}>
          <div className="kpi-icon-wrap">
            <DollarSignIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Lifetime POS Sales</span>
            <span className="kpi-value">{formatCurrency(overview.lifetimeRevenue)}</span>
            <span className="kpi-subtext">{overview.totalOrders?.toLocaleString() || 0} total invoices</span>
          </div>
        </div>

        <div className="kpi-card highlight-amber" onClick={() => onNavigate('orders')}>
          <div className="kpi-icon-wrap">
            <ReceiptIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Processed Invoices</span>
            <span className="kpi-value">{overview.totalOrders?.toLocaleString() || '0'}</span>
            <span className="kpi-subtext">MS SQL `tInvoice` records</span>
          </div>
        </div>

        <div className="kpi-card highlight-purple" onClick={() => onNavigate('menu')}>
          <div className="kpi-icon-wrap">
            <AlertCircleIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Sold Out (86'd)</span>
            <span className="kpi-value">{overview.soldOutItems || 0}</span>
            <span className="kpi-subtext">Instant sync with POS</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Tickets & Quick Actions */}
      <div className="dashboard-grid">
        {/* Left Column: Recent Orders */}
        <div className="card dashboard-card">
          <div className="card-header">
            <div>
              <h3>Recent POS Transactions</h3>
              <p className="card-desc">Latest customer orders queried directly from MS SQL Server</p>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => onNavigate('orders')}>
              View All Orders
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Customer / Table</th>
                  <th>Date & Time</th>
                  <th className="text-right">Total</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-message">No recent orders loaded.</td>
                  </tr>
                ) : (
                  recentOrders.map((order, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="ticket-badge">#{order.InvoiceNumber}</span>
                      </td>
                      <td>
                        <span className="guest-name">
                          {order.GuestName ? order.GuestName : <span className="text-muted">Walk-in</span>}
                        </span>
                      </td>
                      <td className="text-muted">{formatDate(order.CreateDate)}</td>
                      <td className="text-right font-semibold">{formatCurrency(order.Total)}</td>
                      <td className="text-center">
                        <button 
                          className="btn-action-sm"
                          onClick={() => onNavigate('orders', order.InvoiceNumber)}
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Quick POS Controls & Server Info */}
        <div className="dashboard-side-col">
          <div className="card dashboard-card">
            <div className="card-header">
              <h3>Quick Controls</h3>
            </div>
            <div className="quick-actions-list">
              <button className="quick-action-item" onClick={() => onNavigate('menu')}>
                <div className="action-icon">
                  <UtensilsIcon size={20} />
                </div>
                <div className="action-info">
                  <div className="action-title">Update Menu Prices</div>
                  <div className="action-desc">Edit prices directly on MS SQL `rItem` table</div>
                </div>
              </button>

              <button className="quick-action-item" onClick={() => onNavigate('menu', null, true)}>
                <div className="action-icon warning">
                  <AlertCircleIcon size={20} />
                </div>
                <div className="action-info">
                  <div className="action-title">Manage 86 / Sold Out</div>
                  <div className="action-desc">Toggle availability of kitchen ingredients & drinks</div>
                </div>
              </button>

              <button className="quick-action-item" onClick={() => onNavigate('modifiers')}>
                <div className="action-icon purple">
                  <ReceiptIcon size={20} />
                </div>
                <div className="action-info">
                  <div className="action-title">Modifiers & Upcharges</div>
                  <div className="action-desc">Inspect bread, cheese, dressings & add-on pricing</div>
                </div>
              </button>

              <button className="quick-action-item" onClick={() => onNavigate('sql')}>
                <div className="action-icon emerald">
                  <DatabaseIcon size={20} />
                </div>
                <div className="action-info">
                  <div className="action-title">MS SQL Health & Schema</div>
                  <div className="action-desc">Check DUNESSERVER connection latency & tables</div>
                </div>
              </button>
            </div>
          </div>

          <div className="card server-summary-card">
            <h4>Live Database Engine</h4>
            <div className="server-specs">
              <div className="spec-row">
                <span className="spec-label">Host Server:</span>
                <span className="spec-val">DUNESSERVER</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Instance:</span>
                <span className="spec-val">JKSOFT</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Primary DB:</span>
                <span className="spec-val">JKRTDB (Transactional)</span>
              </div>
              <div className="spec-row">
                <span className="spec-label">Status:</span>
                <span className="spec-val status-online">Connected & Querying</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
