import React, { useState, useEffect } from 'react';
import { ReceiptIcon, SearchIcon, XIcon, CheckCircleIcon, AlertCircleIcon, DollarSignIcon } from '../icons';

export default function OrdersView({ selectedInvoiceId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [limit]);

  useEffect(() => {
    if (selectedInvoiceId && orders.length > 0) {
      const found = orders.find(o => o.InvoiceNumber === selectedInvoiceId || o.InvoiceIDN === selectedInvoiceId);
      if (found) {
        handleViewDetails(found);
      }
    }
  }, [selectedInvoiceId, orders]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orders?limit=${limit}`);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    try {
      setDetailsLoading(true);
      const res = await fetch(`/api/orders/${order.InvoiceIDN}`);
      const data = await res.json();
      setOrderDetails(data);
    } catch (err) {
      console.error('Failed to load order details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

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

  const filteredOrders = orders.filter(order => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const invoiceNumStr = String(order.InvoiceNumber || '');
    const guest = (order.GuestName || '').toLowerCase();
    return invoiceNumStr.includes(term) || guest.includes(term);
  });

  return (
    <div className="orders-container">
      {/* Top Filter and Controls */}
      <div className="filter-controls-row">
        <div className="search-input-wrap">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by Invoice # or Customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
              <XIcon size={16} />
            </button>
          )}
        </div>

        <div className="limit-selector">
          <label>Show:</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={20}>20 Orders</option>
            <option value={50}>50 Orders</option>
            <option value={100}>100 Orders</option>
          </select>
        </div>

        <div className="item-count-text">
          Showing <strong>{filteredOrders.length}</strong> recent transactions
        </div>
      </div>

      {/* Orders Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Order #</th>
                <th>Date & Time</th>
                <th>Customer / Table</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Total</th>
                <th className="text-center">Status</th>
                <th className="text-center">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="empty-message">Loading live orders from MS SQL Server...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-message">No orders found.</td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.InvoiceIDN}>
                    <td>
                      <span className="ticket-badge font-bold">#{order.InvoiceNumber}</span>
                    </td>
                    <td>
                      <span className="order-num-tag">{order.OrderNum || '-'}</span>
                    </td>
                    <td className="text-muted">{formatDate(order.CreateDate)}</td>
                    <td>
                      {order.GuestName ? (
                        <span className="font-semibold">{order.GuestName}</span>
                      ) : (
                        <span className="text-muted">Walk-in</span>
                      )}
                      {order.TableNum && <span className="table-tag">T-{order.TableNum}</span>}
                    </td>
                    <td className="text-right">{formatCurrency(order.Subtotal)}</td>
                    <td className="text-right text-muted">{formatCurrency(order.Tax)}</td>
                    <td className="text-right font-bold price-highlight">
                      {formatCurrency(order.Total)}
                    </td>
                    <td className="text-center">
                      {order.IsVoid ? (
                        <span className="badge-void">VOID</span>
                      ) : order.IsDone ? (
                        <span className="badge-done">Completed</span>
                      ) : (
                        <span className="badge-open">Open / Paid</span>
                      )}
                    </td>
                    <td className="text-center">
                      <button
                        className="btn-action-primary"
                        onClick={() => handleViewDetails(order)}
                      >
                        <ReceiptIcon size={14} />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Receipt Modal */}
      {selectedOrder && (
        <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="modal-card receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>POS Receipt #{selectedOrder.InvoiceNumber}</h3>
              <button className="modal-close-btn" onClick={() => setSelectedOrder(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body receipt-body">
              {detailsLoading ? (
                <div className="empty-message">Loading receipt line items...</div>
              ) : orderDetails ? (
                <div className="receipt-paper">
                  <div className="receipt-header">
                    <h4>DUNES DELI & CATERING</h4>
                    <p>300 Lido Blvd, Lido Beach, NY 11561</p>
                    <p>(516) 432-2736</p>
                    <div className="receipt-divider"></div>
                    <div className="receipt-meta">
                      <div>Invoice #: <strong>{orderDetails.order.InvoiceNumber}</strong></div>
                      <div>Date: {formatDate(orderDetails.order.CreateDate)}</div>
                      {orderDetails.order.GuestName && (
                        <div>Customer: <strong>{orderDetails.order.GuestName}</strong></div>
                      )}
                      <div>Station ID: {orderDetails.order.StationID || 1}</div>
                    </div>
                    <div className="receipt-divider"></div>
                  </div>

                  {/* Line Items */}
                  <table className="receipt-items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Price</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderDetails.items?.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted text-center py-2">No itemized lines recorded</td>
                        </tr>
                      ) : (
                        orderDetails.items?.map((item, idx) => (
                          <tr key={idx}>
                            <td className="item-name-cell">{item.ItemName}</td>
                            <td className="text-center">{item.Qty}</td>
                            <td className="text-right">${Number(item.Price || 0).toFixed(2)}</td>
                            <td className="text-right font-semibold">${Number(item.Total || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  <div className="receipt-divider"></div>

                  {/* Totals Breakdown */}
                  <div className="receipt-totals">
                    <div className="total-row">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(orderDetails.order.Subtotal)}</span>
                    </div>
                    {orderDetails.order.Discount > 0 && (
                      <div className="total-row text-success">
                        <span>Discount:</span>
                        <span>-{formatCurrency(orderDetails.order.Discount)}</span>
                      </div>
                    )}
                    <div className="total-row">
                      <span>Tax:</span>
                      <span>{formatCurrency(orderDetails.order.Tax)}</span>
                    </div>
                    <div className="total-row grand-total">
                      <span>TOTAL:</span>
                      <span>{formatCurrency(orderDetails.order.Total)}</span>
                    </div>
                    <div className="total-row paid-row">
                      <span>Paid ({orderDetails.order.PaymentType || 'Cash/Card'}):</span>
                      <span>{formatCurrency(orderDetails.order.Payment)}</span>
                    </div>
                    {orderDetails.order.ChangeGiven > 0 && (
                      <div className="total-row text-muted">
                        <span>Change Given:</span>
                        <span>{formatCurrency(orderDetails.order.ChangeGiven)}</span>
                      </div>
                    )}
                  </div>

                  <div className="receipt-footer">
                    <p>Thank you for choosing Dunes Deli & Catering!</p>
                  </div>
                </div>
              ) : (
                <div className="empty-message">Could not load details for this order.</div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedOrder(null)}
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
