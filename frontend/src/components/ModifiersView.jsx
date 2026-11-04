import React, { useState, useEffect } from 'react';
import { SlidersIcon, SearchIcon, XIcon } from '../icons';

export default function ModifiersView() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchModifiers();
  }, []);

  const fetchModifiers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/modifiers');
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load modifiers:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredGroups = groups.map(g => {
    if (!searchTerm.trim()) return g;
    const term = searchTerm.toLowerCase();
    const groupMatches = g.Name?.toLowerCase().includes(term);
    const matchedModifiers = g.modifiers?.filter(m => m.Name?.toLowerCase().includes(term)) || [];
    
    if (groupMatches) return g;
    if (matchedModifiers.length > 0) {
      return { ...g, modifiers: matchedModifiers };
    }
    return null;
  }).filter(Boolean);

  return (
    <div className="modifiers-container">
      {/* Header and Search */}
      <div className="filter-controls-row">
        <div className="search-input-wrap">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search modifier groups or options (e.g. Cheese, Roll, Dressing)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
              <XIcon size={16} />
            </button>
          )}
        </div>

        <div className="item-count-text">
          Showing <strong>{filteredGroups.length}</strong> Modifier Groups from MS SQL <code>rUpchargeGroup</code>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-message">Loading modifiers & upcharges from MS SQL Server...</div>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="card">
          <div className="empty-message">No modifier groups found matching your search.</div>
        </div>
      ) : (
        <div className="modifier-groups-grid">
          {filteredGroups.map(group => (
            <div key={group.UpchargeGroupIDN} className="card modifier-group-card">
              <div className="modifier-group-header">
                <div>
                  <h4 className="modifier-group-title">{group.Name}</h4>
                  <span className="text-muted small">Group ID: {group.UpchargeGroupIDN}</span>
                </div>
                <div className="modifier-qty-badges">
                  <span className="qty-rule-badge">Min: {group.MinQty}</span>
                  <span className="qty-rule-badge">Max: {group.MaxQty}</span>
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table modifier-table">
                  <thead>
                    <tr>
                      <th>Option / Modifier Name</th>
                      <th className="text-right">Upcharge Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.modifiers?.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="text-muted text-center py-2">No active options in this group</td>
                      </tr>
                    ) : (
                      group.modifiers?.map(mod => (
                        <tr key={mod.UpchargeIDN}>
                          <td>
                            <span className="font-semibold">{mod.Name}</span>
                          </td>
                          <td className="text-right">
                            {Number(mod.Price || 0) === 0 ? (
                              <span className="badge-free">Free / Included</span>
                            ) : (
                              <span className="price-upcharge">+${Number(mod.Price).toFixed(2)}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
