import React, { useState, useEffect } from 'react';
import { UtensilsIcon, RefreshCwIcon, DollarSignIcon, ReceiptIcon } from '../icons';

export default function TopSandwichesView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchTopSandwiches(days);
  }, [days]);

  const fetchTopSandwiches = async (selectedDays) => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/utilities/top-sandwiches?days=${selectedDays}&limit=5`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load top sandwiches:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val || 0);
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getRankBadge = (rank) => {
    switch (rank) {
      case 1:
        return <span className="rank-badge gold">🥇 #1</span>;
      case 2:
        return <span className="rank-badge silver">🥈 #2</span>;
      case 3:
        return <span className="rank-badge bronze">🥉 #3</span>;
      default:
        return <span className="rank-badge normal">#{rank}</span>;
    }
  };

  const sandwiches = data?.sandwiches || [];
  const grandTotalQty = data?.grandTotalQty || 0;
  const grandTotalRevenue = data?.grandTotalRevenue || 0;
  const top5TotalQty = sandwiches.reduce((sum, s) => sum + s.TotalQuantity, 0);
  const top5Share = grandTotalQty > 0 ? ((top5TotalQty / grandTotalQty) * 100).toFixed(1) : 0;

  return (
    <div className="top-sandwiches-utility-container">
      {/* Utility Header */}
      <div className="utility-hero-header">
        <div className="utility-title-block">
          <div className="utility-icon-wrap">
            <UtensilsIcon size={26} />
          </div>
          <div>
            <h2>Top 5 Ordered Sandwiches</h2>
            <p className="card-desc">
              Sales performance & popularity breakdown for Dunes Deli & Catering ({formatDate(data?.startDate)} – {formatDate(data?.endDate)})
            </p>
          </div>
        </div>

        <div className="utility-actions">
          {/* Days Filter Pills */}
          <div className="days-selector-pills">
            <button
              className={`pill-btn ${days === 7 ? 'active' : ''}`}
              onClick={() => setDays(7)}
            >
              Past 7 Days (Week)
            </button>
            <button
              className={`pill-btn ${days === 14 ? 'active' : ''}`}
              onClick={() => setDays(14)}
            >
              Past 14 Days
            </button>
            <button
              className={`pill-btn ${days === 30 ? 'active' : ''}`}
              onClick={() => setDays(30)}
            >
              Past 30 Days
            </button>
          </div>

          <button 
            className="btn-print-utility"
            onClick={() => window.print()}
            title="Print or Save PDF"
          >
            <ReceiptIcon size={16} />
            <span>Print Report</span>
          </button>

          <button
            className={`btn-refresh ${refreshing ? 'spinning' : ''}`}
            onClick={() => fetchTopSandwiches(days)}
            disabled={refreshing}
            title="Refresh Data"
          >
            <RefreshCwIcon size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card highlight-blue">
          <div className="kpi-icon-wrap">
            <UtensilsIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Total Sandwiches Sold</span>
            <span className="kpi-value">{grandTotalQty.toLocaleString()}</span>
            <span className="kpi-subtext">Across all sandwich categories</span>
          </div>
        </div>

        <div className="kpi-card highlight-emerald">
          <div className="kpi-icon-wrap">
            <DollarSignIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Total Sandwich Sales</span>
            <span className="kpi-value">{formatCurrency(grandTotalRevenue)}</span>
            <span className="kpi-subtext">Gross revenue for selected timeframe</span>
          </div>
        </div>

        <div className="kpi-card highlight-purple">
          <div className="kpi-icon-wrap">
            <ReceiptIcon size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Top 5 Concentration</span>
            <span className="kpi-value">{top5Share}%</span>
            <span className="kpi-subtext">{top5TotalQty} of {grandTotalQty} sandwiches sold</span>
          </div>
        </div>

        <div className="kpi-card highlight-amber">
          <div className="kpi-icon-wrap">
            <span style={{ fontSize: '1.4rem' }}>🏆</span>
          </div>
          <div className="kpi-details">
            <span className="kpi-label">#1 Best Seller</span>
            <span className="kpi-value" style={{ fontSize: '1.25rem' }}>
              {sandwiches[0]?.Name || 'None'}
            </span>
            <span className="kpi-subtext">
              {sandwiches[0] ? `${sandwiches[0].TotalQuantity} ordered (${formatCurrency(sandwiches[0].TotalRevenue)})` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main Leaderboard Cards */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Leaderboard Rankings (Past {days} Days)</h3>
            <p className="card-desc">Ranked by total quantity sold directly from MS SQL <code>tItem</code> & <code>tInvoice</code></p>
          </div>
        </div>

        {loading ? (
          <div className="empty-message">Calculating top sandwich sales from MS SQL Server...</div>
        ) : sandwiches.length === 0 ? (
          <div className="empty-message">No sandwich orders found in the selected timeframe.</div>
        ) : (
          <div className="top-sandwiches-list">
            {sandwiches.map((sandwich) => (
              <div key={sandwich.ItemIDN} className={`sandwich-rank-row rank-${sandwich.rank}`}>
                <div className="rank-col">
                  {getRankBadge(sandwich.rank)}
                </div>

                <div className="sandwich-info-col">
                  <div className="sandwich-name-row">
                    <span className="sandwich-title font-bold">{sandwich.Name}</span>
                    <span className="category-tag">{sandwich.Category}</span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="sales-progress-bar-container">
                    <div 
                      className="sales-progress-bar-fill" 
                      style={{ width: `${Math.min(100, Math.max(8, sandwich.sharePercent * 1.5))}%` }}
                    ></div>
                  </div>
                  <span className="text-muted small">
                    Represents <strong>{sandwich.sharePercent}%</strong> of all sandwiches sold
                  </span>
                </div>

                <div className="sandwich-metrics-col">
                  <div className="metric-box">
                    <span className="metric-value font-bold text-highlight">
                      {sandwich.TotalQuantity}
                    </span>
                    <span className="metric-label">Units Sold</span>
                  </div>

                  <div className="metric-box">
                    <span className="metric-value font-bold">
                      {formatCurrency(sandwich.TotalRevenue)}
                    </span>
                    <span className="metric-label">Revenue</span>
                  </div>

                  <div className="metric-box">
                    <span className="metric-value text-muted font-semibold">
                      ${Number(sandwich.AvgPrice || 0).toFixed(2)}
                    </span>
                    <span className="metric-label">Avg Price</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparative Data Table */}
      <div className="card">
        <div className="card-header">
          <h3>Detailed Metrics Breakdown</h3>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Rank</th>
                <th>Sandwich Name</th>
                <th>Category</th>
                <th className="text-center">Units Sold</th>
                <th className="text-right">Avg Price</th>
                <th className="text-right">Total Revenue</th>
                <th className="text-right">% of Sandwiches</th>
              </tr>
            </thead>
            <tbody>
              {sandwiches.map((s) => (
                <tr key={s.ItemIDN}>
                  <td>
                    <span className="ticket-badge font-bold">#{s.rank}</span>
                  </td>
                  <td>
                    <span className="font-semibold">{s.Name}</span>
                  </td>
                  <td>
                    <span className="category-tag">{s.Category}</span>
                  </td>
                  <td className="text-center font-bold" style={{ fontSize: '1.05rem', color: '#60a5fa' }}>
                    {s.TotalQuantity}
                  </td>
                  <td className="text-right text-muted font-semibold">
                    ${Number(s.AvgPrice || 0).toFixed(2)}
                  </td>
                  <td className="text-right font-bold price-highlight">
                    {formatCurrency(s.TotalRevenue)}
                  </td>
                  <td className="text-right font-semibold">
                    {s.sharePercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
