import React, { useState, useMemo } from 'react';
import { SearchIcon, Edit2Icon, AlertCircleIcon, CheckCircleIcon, XIcon, SlidersIcon } from '../icons';

export default function MenuManagement({ 
  categories = [], 
  items = [], 
  selectedCategoryId, 
  setSelectedCategoryId, 
  onUpdatePrice, 
  onToggleSoldOut,
  loading 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [onlySoldOut, setOnlySoldOut] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [selectedItemDetail, setSelectedItemDetail] = useState(null);
  const [updatingPrice, setUpdatingPrice] = useState(false);

  // Filter items based on category, search, and sold out toggle
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter
      if (selectedCategoryId && item.CategoryIDN !== selectedCategoryId) {
        return false;
      }
      // Sold out filter
      if (onlySoldOut && !item.IsSoldOut) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = item.Name?.toLowerCase().includes(term);
        const matchesCat = item.CategoryName?.toLowerCase().includes(term);
        if (!matchesName && !matchesCat) return false;
      }
      return true;
    });
  }, [items, selectedCategoryId, onlySoldOut, searchTerm]);

  const handleEditClick = (item) => {
    setEditingItem(item);
    setNewPrice(item.Price?.toFixed(2) || '0.00');
  };

  const handleSavePrice = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      alert('Please enter a valid price.');
      return;
    }

    setUpdatingPrice(true);
    await onUpdatePrice(editingItem.ItemIDN, priceNum);
    setUpdatingPrice(false);
    setEditingItem(null);
  };

  return (
    <div className="menu-container">
      {/* Category Pills Bar */}
      <div className="category-bar">
        <button
          className={`category-pill ${selectedCategoryId === null ? 'active' : ''}`}
          onClick={() => setSelectedCategoryId(null)}
        >
          <span>All Items</span>
          <span className="pill-badge">{items.length}</span>
        </button>

        {categories.map(cat => (
          <button
            key={cat.CategoryIDN}
            className={`category-pill ${selectedCategoryId === cat.CategoryIDN ? 'active' : ''}`}
            onClick={() => setSelectedCategoryId(cat.CategoryIDN)}
          >
            <span>{cat.Name}</span>
            <span className="pill-badge">{cat.ItemCount}</span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-controls-row">
        <div className="search-input-wrap">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search items by name or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
              <XIcon size={16} />
            </button>
          )}
        </div>

        <div className="filter-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={onlySoldOut}
              onChange={(e) => setOnlySoldOut(e.target.checked)}
            />
            <span className="toggle-custom"></span>
            <span className="toggle-text">Only 86'd / Sold Out</span>
          </label>
        </div>

        <div className="item-count-text">
          Showing <strong>{filteredItems.length}</strong> of {items.length} items
        </div>
      </div>

      {/* Menu Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table menu-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th className="text-right">Price</th>
                <th className="text-center">Kitchen Printer</th>
                <th className="text-center">Availability (86)</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty-message">Loading menu items from MS SQL Server...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-message">No menu items match the selected filter.</td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.ItemIDN} className={item.IsSoldOut ? 'row-sold-out' : ''}>
                    <td>
                      <div className="item-primary-name font-semibold">
                        {item.Name}
                        {item.UpchargeRequiredCount > 0 && (
                          <span className="modifier-required-tag" title="Requires Modifiers">
                            Mods
                          </span>
                        )}
                      </div>
                      <span className="text-muted item-code">ID: {item.ItemIDN}</span>
                    </td>
                    <td>
                      <span className="category-tag">{item.CategoryName}</span>
                    </td>
                    <td className="text-right font-semibold">
                      <span className="price-display">${Number(item.Price || 0).toFixed(2)}</span>
                      {item.PriceLunch > 0 && (
                        <div className="text-muted small">Lunch: ${Number(item.PriceLunch).toFixed(2)}</div>
                      )}
                    </td>
                    <td className="text-center">
                      <span className={`printer-badge ${item.KitchenPrinterNum ? 'active' : ''}`}>
                        {item.KitchenPrinterNum ? `Printer #${item.KitchenPrinterNum}` : 'None'}
                      </span>
                    </td>
                    <td className="text-center">
                      <button
                        className={`btn-sold-out-toggle ${item.IsSoldOut ? 'is-86' : 'in-stock'}`}
                        onClick={() => onToggleSoldOut(item.ItemIDN, !item.IsSoldOut)}
                        title={item.IsSoldOut ? 'Click to mark Available' : 'Click to 86 / Mark Sold Out'}
                      >
                        {item.IsSoldOut ? (
                          <>
                            <AlertCircleIcon size={14} />
                            <span>86'd / Sold Out</span>
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon size={14} />
                            <span>In Stock</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="text-right">
                      <div className="action-buttons-cell">
                        <button
                          className="btn-action-primary"
                          onClick={() => handleEditClick(item)}
                          title="Edit Price in MS SQL"
                        >
                          <Edit2Icon size={14} />
                          <span>Edit Price</span>
                        </button>

                        <button
                          className="btn-action-ghost"
                          onClick={() => setSelectedItemDetail(item)}
                          title="View Details"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Price Modal */}
      {editingItem && (
        <div className="modal-backdrop" onClick={() => setEditingItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Update Item Price</h3>
              <button className="modal-close-btn" onClick={() => setEditingItem(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePrice}>
              <div className="modal-body">
                <p className="modal-lead">
                  Updating price for <strong>{editingItem.Name}</strong>
                </p>
                <div className="modal-notice">
                  This change updates <code>rItem.Price</code> directly on the <strong>DUNESSERVER\JKSOFT</strong> database.
                </div>

                <div className="form-group">
                  <label>New Price (USD):</label>
                  <div className="currency-input-wrap">
                    <span className="currency-symbol">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="price-input"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingItem(null)}
                  disabled={updatingPrice}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={updatingPrice}
                >
                  {updatingPrice ? 'Saving to SQL...' : 'Save to SQL Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Details Modal */}
      {selectedItemDetail && (
        <div className="modal-backdrop" onClick={() => setSelectedItemDetail(null)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Item SQL Metadata: {selectedItemDetail.Name}</h3>
              <button className="modal-close-btn" onClick={() => setSelectedItemDetail(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">ItemIDN (Primary Key):</span>
                  <span className="detail-value">{selectedItemDetail.ItemIDN}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Category:</span>
                  <span className="detail-value">{selectedItemDetail.CategoryName}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">CategoryIDN:</span>
                  <span className="detail-value">{selectedItemDetail.CategoryIDN}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Price:</span>
                  <span className="detail-value font-bold">${Number(selectedItemDetail.Price || 0).toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Lunch Price:</span>
                  <span className="detail-value">${Number(selectedItemDetail.PriceLunch || 0).toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Item Order:</span>
                  <span className="detail-value">{selectedItemDetail.ItemOrder}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Kitchen Printer:</span>
                  <span className="detail-value">
                    {selectedItemDetail.KitchenPrinterNum ? `Printer #${selectedItemDetail.KitchenPrinterNum}` : 'None'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Required Upcharges / Mods:</span>
                  <span className="detail-value">{selectedItemDetail.UpchargeRequiredCount || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Is Active:</span>
                  <span className="detail-value">{selectedItemDetail.IsActive ? 'Yes' : 'No'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Is Sold Out (86):</span>
                  <span className="detail-value">{selectedItemDetail.IsSoldOut ? 'Yes (86)' : 'No (In Stock)'}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedItemDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
