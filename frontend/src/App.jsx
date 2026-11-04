import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import MenuManagement from './components/MenuManagement';
import OrdersView from './components/OrdersView';
import ModifiersView from './components/ModifiersView';
import SqlHealthView from './components/SqlHealthView';
import MobilePOS from './components/MobilePOS';
import TopSandwichesView from './components/TopSandwichesView';
import LoginView from './components/LoginView';
import Toast from './components/Toast';
import './App.css';

export default function App() {
  const [authToken, setAuthToken] = useState(localStorage.getItem('jkpos_auth_token'));
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('jkpos_username') || '');
  const [activeTab, setActiveTab] = useState('pos');
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Authenticated fetch wrapper
  const authFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      'Authorization': `Bearer ${authToken}`
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // Token expired or invalid
      handleLogout();
      throw new Error('Session expired. Please log in again.');
    }
    return res;
  };

  useEffect(() => {
    if (authToken) {
      loadAllData();
    }
  }, [authToken]);

  const loadAllData = async () => {
    if (!authToken) return;
    try {
      setRefreshing(true);
      const [statusRes, statsRes, catRes, itemsRes] = await Promise.all([
        authFetch('/api/status'),
        authFetch('/api/stats'),
        authFetch('/api/categories'),
        authFetch('/api/items')
      ]);

      const [statusData, statsData, catData, itemsData] = await Promise.all([
        statusRes.json(),
        statsRes.json(),
        catRes.json(),
        itemsRes.json()
      ]);

      setStatus(statusData);
      setStats(statsData);
      setCategories(Array.isArray(catData) ? catData : []);
      setItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (err) {
      console.error('Failed to load initial POS data:', err);
      if (authToken) {
        setToast({ message: 'Data loading error: ' + err.message, type: 'error' });
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const handleLoginSuccess = (token, user) => {
    setAuthToken(token);
    setCurrentUser(user);
    setToast({ message: `Welcome back, ${user}! System unlocked.`, type: 'success' });
  };

  const handleLogout = () => {
    localStorage.removeItem('jkpos_auth_token');
    localStorage.removeItem('jkpos_username');
    setAuthToken(null);
    setCurrentUser('');
    setStatus(null);
    setStats(null);
    setToast({ message: 'POS Locked. You have been signed out.', type: 'info' });
  };

  const handleUpdatePrice = async (itemId, newPrice) => {
    try {
      const res = await authFetch(`/api/items/${itemId}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: newPrice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update price');

      setItems(prev => prev.map(item => 
        item.ItemIDN === itemId ? { ...item, Price: newPrice } : item
      ));

      setToast({ 
        message: `Successfully updated price to $${newPrice.toFixed(2)} in MS SQL Server (rItem)`,
        type: 'success'
      });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to update price: ' + err.message, type: 'error' });
    }
  };

  const handleToggleSoldOut = async (itemId, isSoldOut) => {
    try {
      setItems(prev => prev.map(item => 
        item.ItemIDN === itemId ? { ...item, IsSoldOut: isSoldOut } : item
      ));

      const res = await authFetch(`/api/items/${itemId}/soldout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSoldOut })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update 86 status');

      const statsRes = await authFetch('/api/stats');
      const statsData = await statsRes.json();
      setStats(statsData);

      setToast({ 
        message: isSoldOut ? 'Item marked 86 / Sold Out' : 'Item marked In Stock',
        type: isSoldOut ? 'warning' : 'success'
      });
    } catch (err) {
      console.error(err);
      setItems(prev => prev.map(item => 
        item.ItemIDN === itemId ? { ...item, IsSoldOut: !isSoldOut } : item
      ));
      setToast({ message: 'Failed to update status: ' + err.message, type: 'error' });
    }
  };

  const handleNavigate = (tab, invoiceId = null, filterSoldOut = false) => {
    setActiveTab(tab);
    if (invoiceId) {
      setSelectedInvoiceId(invoiceId);
    }
  };

  // If not authenticated, render Login Screen
  if (!authToken) {
    return (
      <div className="app-shell">
        <LoginView onLoginSuccess={handleLoginSuccess} />
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        status={status}
        onRefresh={loadAllData}
        refreshing={refreshing}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {activeTab === 'pos' && (
          <MobilePOS
            categories={categories}
            items={items}
            onOrderCreated={loadAllData}
            showToast={setToast}
          />
        )}

        {activeTab === 'sandwiches' && (
          <TopSandwichesView />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard
            stats={stats}
            onSelectCategory={(catId) => {
              setSelectedCategoryId(catId);
              setActiveTab('menu');
            }}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'menu' && (
          <MenuManagement
            categories={categories}
            items={items}
            selectedCategoryId={selectedCategoryId}
            setSelectedCategoryId={setSelectedCategoryId}
            onUpdatePrice={handleUpdatePrice}
            onToggleSoldOut={handleToggleSoldOut}
            loading={loading}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersView
            selectedInvoiceId={selectedInvoiceId}
          />
        )}

        {activeTab === 'modifiers' && (
          <ModifiersView />
        )}

        {activeTab === 'sql' && (
          <SqlHealthView
            status={status}
            onRefresh={loadAllData}
          />
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
