import React, { useState, useEffect, useMemo } from 'react';
import { UtensilsIcon, ReceiptIcon, SearchIcon, XIcon, CheckCircleIcon, AlertCircleIcon, PlusIcon, PrinterIcon } from '../icons';

export default function MobilePOS({ categories = [], items = [], onOrderCreated, showToast }) {
  // POS State
  const [openTickets, setOpenTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null); // If editing an existing open ticket
  const [tableNum, setTableNum] = useState('');
  const [guestName, setGuestName] = useState('');
  const [cart, setCart] = useState([]); // Array of { item, qty, notes }
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modifierModalItem, setModifierModalItem] = useState(null);
  const [customNote, setCustomNote] = useState('');
  const [testingPrinter, setTestingPrinter] = useState(false);

  useEffect(() => {
    fetchOpenTickets();
  }, []);

  const fetchOpenTickets = async () => {
    try {
      const res = await fetch('/api/pos/open-tickets');
      const data = await res.json();
      setOpenTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load open tickets:', err);
    }
  };

  // Filter menu items by category and search
  const visibleItems = useMemo(() => {
    return items.filter(item => {
      if (item.IsSoldOut) return false; // Don't show 86'd items on ordering screen
      if (selectedCategory && item.CategoryIDN !== selectedCategory) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return item.Name?.toLowerCase().includes(term);
      }
      return true;
    });
  }, [items, selectedCategory, searchTerm]);

  // Cart calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, line) => sum + (line.item.Price * line.qty), 0);
  }, [cart]);

  const cartTax = cartSubtotal * 0.08625;
  const cartTotal = cartSubtotal + cartTax;

  const handleAddItem = (item) => {
    // If item has modifiers or user might want notes, open quick note modal
    setModifierModalItem(item);
    setCustomNote('');
  };

  const confirmAddItem = (item, note = '') => {
    setCart(prev => {
      // Check if same item with same note already in cart
      const existingIdx = prev.findIndex(l => l.item.ItemIDN === item.ItemIDN && l.notes === note);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].qty += 1;
        return updated;
      }
      return [...prev, { item, qty: 1, notes: note }];
    });
    setModifierModalItem(null);
    setCustomNote('');
  };

  const handleUpdateQty = (idx, delta) => {
    setCart(prev => {
      const updated = [...prev];
      updated[idx].qty += delta;
      if (updated[idx].qty <= 0) {
        return updated.filter((_, i) => i !== idx);
      }
      return updated;
    });
  };

  const handleRemoveLine = (idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSelectOpenTicket = async (ticket) => {
    try {
      const res = await fetch(`/api/orders/${ticket.InvoiceIDN}`);
      const data = await res.json();
      setActiveTicket({
        ...ticket,
        existingItems: data.items || []
      });
      setTableNum(ticket.TableNum || '');
      setGuestName(ticket.GuestName || '');
      setCart([]);
      setShowTableModal(false);
    } catch (e) {
      console.error(e);
      alert('Could not load ticket details.');
    }
  };

  const handleStartNewTable = () => {
    setActiveTicket(null);
    setTableNum('');
    setGuestName('');
    setCart([]);
    setShowTableModal(false);
  };

  // Submit order to MS SQL and trigger Kitchen Printing
  const handleSendToKitchen = async () => {
    if (cart.length === 0) {
      alert('Cart is empty. Add items to send to the kitchen.');
      return;
    }

    setSubmitting(true);
    try {
      const formattedItems = cart.map(l => ({
        itemIdn: l.item.ItemIDN,
        name: l.item.Name,
        price: l.item.Price,
        qty: l.qty,
        notes: l.notes,
        kitchenPrinterNum: l.item.KitchenPrinterNum || 1
      }));

      let res, data;

      if (activeTicket) {
        // Adding items to an existing open ticket
        res = await fetch(`/api/pos/ticket/${activeTicket.InvoiceIDN}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: formattedItems,
            serverName: 'Mobile Tablet'
          })
        });
        data = await res.json();
      } else {
        // Creating a new ticket
        res = await fetch('/api/pos/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableNum: tableNum || 'Walk-in',
            guestName: guestName || '',
            items: formattedItems,
            serverName: 'Mobile Tablet'
          })
        });
        data = await res.json();
      }

      if (!res.ok) throw new Error(data.error || 'Failed to submit order');

      // Success feedback
      const printStatusText = data.printResults?.map(p => `${p.printer}: ${p.status}`).join(', ') || 'Printed';
      showToast({
        message: `Order #${data.orderNum || data.invoiceNumber} sent to kitchen! (${printStatusText})`,
        type: 'success'
      });

      // Reset cart and reload open tickets
      setCart([]);
      setActiveTicket(null);
      setTableNum('');
      setGuestName('');
      fetchOpenTickets();
      if (onOrderCreated) onOrderCreated();
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error sending order: ' + err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestPrint = async (printerId) => {
    setTestingPrinter(true);
    try {
      const res = await fetch('/api/pos/test-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId })
      });
      const data = await res.json();
      if (data.success) {
        showToast({ message: `Test slip sent to ${data.printer}!`, type: 'success' });
      } else {
        showToast({ message: 'Printer test failed: ' + data.error, type: 'error' });
      }
    } catch (e) {
      showToast({ message: 'Printer error: ' + e.message, type: 'error' });
    } finally {
      setTestingPrinter(false);
    }
  };

  return (
    <div className="mobile-pos-layout">
      {/* Top POS Action & Context Bar */}
      <div className="pos-top-bar">
        <div className="pos-table-selector">
          <button 
            className="btn-select-table" 
            onClick={() => setShowTableModal(true)}
          >
            <span className="table-chip-label">
              {activeTicket ? (
                <>Existing Ticket: <strong>#{activeTicket.InvoiceNumber} (Table: {activeTicket.TableNum || 'Counter'})</strong></>
              ) : tableNum ? (
                <>Table: <strong>{tableNum}</strong> {guestName ? `(${guestName})` : ''}</>
              ) : (
                <>Select Table / Open Tab</>
              )}
            </span>
            <span className="open-tickets-count-badge">{openTickets.length} Open</span>
          </button>
        </div>

        <div className="pos-top-actions">
          <button 
            className="btn-printer-test"
            onClick={() => handleTestPrint(1)}
            disabled={testingPrinter}
            title="Send test slip to Hot Kitchen Printer (192.168.2.246)"
          >
            <ReceiptIcon size={16} />
            <span>Test Hot Kitchen</span>
          </button>

          <button 
            className="btn-printer-test"
            onClick={() => handleTestPrint(2)}
            disabled={testingPrinter}
            title="Send test slip to Cold Kitchen Printer (192.168.2.146)"
          >
            <ReceiptIcon size={16} />
            <span>Test Cold Kitchen</span>
          </button>
        </div>
      </div>

      {/* Main Order Workspace: Categories & Menu on Left, Ticket Cart on Right */}
      <div className="pos-main-grid">
        {/* Left Side: Categories & Items */}
        <div className="pos-menu-section">
          {/* Category Selector (No Sideways Scrolling) */}
          <div className="pos-categories-container">
            <div className="pos-category-header">
              <span className="pos-category-label">Category:</span>
              <select
                className="pos-category-dropdown"
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All Categories ({items.length} items)</option>
                {categories.map(cat => (
                  <option key={cat.CategoryIDN} value={cat.CategoryIDN}>
                    {cat.Name} ({cat.ItemCount})
                  </option>
                ))}
              </select>
            </div>

            <div className="pos-category-pills-wrap">
              <button
                className={`pos-cat-pill ${selectedCategory === null ? 'active' : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.CategoryIDN}
                  className={`pos-cat-pill ${selectedCategory === cat.CategoryIDN ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.CategoryIDN)}
                >
                  {cat.Name}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <div className="pos-search-wrap">
            <SearchIcon size={18} className="pos-search-icon" />
            <input
              type="text"
              placeholder="Search dishes, drinks, sandwiches..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pos-search-input"
            />
            {searchTerm && (
              <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
                <XIcon size={16} />
              </button>
            )}
          </div>

          {/* Menu Items Touch Grid */}
          <div className="pos-items-grid">
            {visibleItems.length === 0 ? (
              <div className="empty-message">No available items match your search.</div>
            ) : (
              visibleItems.map(item => (
                <div 
                  key={item.ItemIDN} 
                  className="pos-item-touch-card"
                  onClick={() => handleAddItem(item)}
                >
                  <div className="pos-item-header">
                    <span className="pos-item-name">{item.Name}</span>
                    <span className={`pos-printer-indicator ${item.KitchenPrinterNum === 2 ? 'cold' : 'hot'}`}>
                      {item.KitchenPrinterNum === 2 ? 'Cold' : 'Hot'}
                    </span>
                  </div>
                  <div className="pos-item-price-row">
                    <span className="pos-item-price">${Number(item.Price || 0).toFixed(2)}</span>
                    <button className="pos-add-btn" tabIndex={-1}>
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Active Ticket / Cart Drawer */}
        <div className="pos-ticket-drawer">
          <div className="ticket-drawer-header">
            <div>
              <h3>
                {activeTicket ? `Ticket #${activeTicket.InvoiceNumber}` : 'New Order'}
              </h3>
              <span className="text-muted small">
                {activeTicket ? (
                  `Table: ${activeTicket.TableNum || 'None'} | Server: Tablet`
                ) : (
                  tableNum ? `Table: ${tableNum} ${guestName ? `| ${guestName}` : ''}` : 'Counter / To-Go'
                )}
              </span>
            </div>
            {cart.length > 0 && (
              <button className="btn-clear-cart" onClick={() => setCart([])}>
                Clear
              </button>
            )}
          </div>

          {/* Previously Ordered Items (if editing an open table) */}
          {activeTicket?.existingItems?.length > 0 && (
            <div className="existing-items-block">
              <div className="existing-items-title">Already Sent to Kitchen:</div>
              {activeTicket.existingItems.map((ex, i) => (
                <div key={i} className="existing-item-row">
                  <span>{ex.Qty}x {ex.ItemName}</span>
                  <span>${Number(ex.Total || 0).toFixed(2)}</span>
                </div>
              ))}
              <div className="existing-divider"></div>
            </div>
          )}

          {/* Current Unsent Items List */}
          <div className="ticket-items-list">
            <div className="unsent-items-title">
              {activeTicket ? 'New Items to Send:' : 'Items on Check:'}
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart-prompt">
                <UtensilsIcon size={32} />
                <p>Tap items from the menu to start order</p>
              </div>
            ) : (
              cart.map((line, idx) => (
                <div key={idx} className="ticket-line-item">
                  <div className="line-item-top">
                    <span className="line-item-name font-semibold">
                      {line.item.Name}
                    </span>
                    <span className="line-item-total font-semibold">
                      ${(line.item.Price * line.qty).toFixed(2)}
                    </span>
                  </div>

                  {line.notes && (
                    <div className="line-item-notes">
                      * {line.notes}
                    </div>
                  )}

                  <div className="line-item-actions">
                    <div className="qty-stepper">
                      <button onClick={() => handleUpdateQty(idx, -1)}>-</button>
                      <span>{line.qty}</span>
                      <button onClick={() => handleUpdateQty(idx, 1)}>+</button>
                    </div>

                    <button 
                      className="btn-remove-line"
                      onClick={() => handleRemoveLine(idx)}
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Ticket Totals & Send Button */}
          <div className="ticket-footer">
            <div className="ticket-summary-rows">
              <div className="summary-row">
                <span>New Items Subtotal:</span>
                <span>${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Estimated Tax (8.625%):</span>
                <span>${cartTax.toFixed(2)}</span>
              </div>
              <div className="summary-row total-row font-bold">
                <span>Order Total:</span>
                <span className="price-highlight">${cartTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              className="btn-send-kitchen"
              onClick={handleSendToKitchen}
              disabled={submitting || cart.length === 0}
            >
              <ReceiptIcon size={20} />
              <span>
                {submitting ? 'Sending to Kitchen & SQL...' : 'SEND TO KITCHEN'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Table & Tab Selection Modal */}
      {showTableModal && (
        <div className="modal-backdrop" onClick={() => setShowTableModal(false)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Table & Tab Manager</h3>
              <button className="modal-close-btn" onClick={() => setShowTableModal(false)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Start New Table Section */}
              <div className="new-table-form-card">
                <h4>Start New Table or Tab</h4>
                <div className="new-table-inputs">
                  <div className="form-group flex-1">
                    <label>Table #:</label>
                    <input
                      type="text"
                      placeholder="e.g. 4, 12, Patio 2"
                      value={tableNum}
                      onChange={(e) => setTableNum(e.target.value)}
                      className="table-input"
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label>Guest / Tab Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Smith, John D."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="table-input"
                    />
                  </div>
                </div>
                <button 
                  className="btn-primary mt-2" 
                  onClick={handleStartNewTable}
                >
                  Start New Order
                </button>
              </div>

              {/* Open Existing Tickets Section */}
              <div className="open-tickets-list-section">
                <h4>Currently Open Tables & Tabs ({openTickets.length})</h4>
                {openTickets.length === 0 ? (
                  <p className="text-muted small">No active open tables or tabs in the system.</p>
                ) : (
                  <div className="open-tickets-grid">
                    {openTickets.map(t => (
                      <div
                        key={t.InvoiceIDN}
                        className={`open-ticket-card ${activeTicket?.InvoiceIDN === t.InvoiceIDN ? 'selected' : ''}`}
                        onClick={() => handleSelectOpenTicket(t)}
                      >
                        <div className="ticket-card-top">
                          <span className="font-bold">Table: {t.TableNum || 'Counter'}</span>
                          <span className="ticket-badge">#{t.InvoiceNumber}</span>
                        </div>
                        <div className="ticket-card-guest">
                          {t.GuestName ? t.GuestName : 'Walk-in'}
                        </div>
                        <div className="ticket-card-footer">
                          <span>{t.ItemCount || 0} items</span>
                          <span className="font-bold">${Number(t.Total || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowTableModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Modifier / Note Modal */}
      {modifierModalItem && (
        <div className="modal-backdrop" onClick={() => confirmAddItem(modifierModalItem, '')}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Special Instructions: {modifierModalItem.Name}</h3>
              <button className="modal-close-btn" onClick={() => confirmAddItem(modifierModalItem, '')}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="small text-muted mb-2">
                Type any custom preparation notes or select quick modifiers to print directly on the kitchen ticket.
              </p>

              <div className="quick-notes-pills">
                {['NO ONION', 'EXTRA CHEESE', 'WELL DONE', 'DRESSING ON SIDE', 'TOASTED', 'EXTRA CRISPY', 'NO MAYO'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className="quick-note-pill"
                    onClick={() => {
                      setCustomNote(prev => prev ? `${prev}, ${preset}` : preset);
                    }}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              <div className="form-group mt-3">
                <label>Custom Kitchen Note:</label>
                <input
                  type="text"
                  placeholder="e.g. Sauce on side, allergic to nuts"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="table-input"
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn-secondary"
                onClick={() => confirmAddItem(modifierModalItem, '')}
              >
                No Notes (Add)
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => confirmAddItem(modifierModalItem, customNote)}
              >
                Add with Instructions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
