/**
 * Content script for JKRestaurant Delivery Order Grabber
 * Runs in browser on merchants-beta.ubereats.com & restaurant.grubhub.com
 */

const BRIDGE_ENDPOINT = 'http://localhost:8080/api/direct-order';
const processedOrderIds = new Set();

// 1. Inject hook script into page context
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
} catch (e) {
  console.error('[JK-Grabber] Failed to inject hook:', e);
}

// 2. Display Status Badge in Browser Corner
function createStatusBadge() {
  if (document.getElementById('jk-pos-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'jk-pos-badge';
  badge.innerHTML = '🟢 JK POS Synced';
  badge.style.position = 'fixed';
  badge.style.bottom = '12px';
  badge.style.right = '12px';
  badge.style.zIndex = '999999';
  badge.style.backgroundColor = '#10b981';
  badge.style.color = '#ffffff';
  badge.style.padding = '6px 14px';
  badge.style.borderRadius = '20px';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = 'bold';
  badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  badge.style.fontFamily = 'system-ui, sans-serif';
  badge.style.pointerEvents = 'none';
  document.body.appendChild(badge);
}

if (document.body) createStatusBadge();
else window.addEventListener('DOMContentLoaded', createStatusBadge);

// 3. Send Order to Local Bridge
async function dispatchOrderToBridge(order) {
  if (!order || !order.orderId || processedOrderIds.has(order.orderId)) {
    return;
  }

  processedOrderIds.add(order.orderId);
  console.log('[JK-Grabber] Sending order to POS Bridge:', order);

  try {
    const res = await fetch(BRIDGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    const result = await res.json();
    console.log('[JK-Grabber] Bridge response:', result);

    // Flash badge
    const badge = document.getElementById('jk-pos-badge');
    if (badge) {
      badge.innerHTML = `🔔 Order Sent: #${order.orderId.slice(-4)}`;
      badge.style.backgroundColor = '#3b82f6';
      setTimeout(() => {
        badge.innerHTML = '🟢 JK POS Synced';
        badge.style.backgroundColor = '#10b981';
      }, 4000);
    }
  } catch (err) {
    console.error('[JK-Grabber] Failed to dispatch to bridge:', err);
  }
}

// 4. Parse Uber Eats JSON API Payloads
function extractOrdersFromUberJson(data) {
  if (!data || typeof data !== 'object') return [];
  const found = [];

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;

    // Check for Uber Eats Order structure
    if ((obj.id || obj.order_id || obj.orderId) && (obj.cart || obj.items || obj.lines || obj.orderItems)) {
      const id = obj.id || obj.order_id || obj.orderId;
      const displayId = obj.display_id || obj.displayId || obj.code || id;

      // Customer Name
      let customerName = 'Uber Customer';
      if (obj.customer) {
        customerName = `${obj.customer.first_name || obj.customer.firstName || ''} ${obj.customer.last_name || obj.customer.lastName || ''}`.trim() || obj.customer.name || customerName;
      } else if (obj.eater) {
        customerName = `${obj.eater.first_name || obj.eater.firstName || ''} ${obj.eater.last_name || obj.eater.lastName || ''}`.trim() || obj.eater.name || customerName;
      }

      // Items
      const rawItems = obj.cart ? (obj.cart.items || obj.cart.lines) : (obj.items || obj.lines || obj.orderItems || []);
      const items = [];

      for (const item of rawItems) {
        const name = item.title || item.name || (item.item && (item.item.title || item.item.name)) || 'Item';
        const qty = item.quantity || item.qty || item.count || 1;

        // Modifiers / Customizations
        const notesList = [];
        if (item.special_instructions || item.specialInstructions) {
          notesList.push(item.special_instructions || item.specialInstructions);
        }
        if (item.customizations || item.selected_modifier_groups || item.modifier_groups || item.modifiers) {
          const groups = item.customizations || item.selected_modifier_groups || item.modifier_groups || item.modifiers || [];
          for (const g of groups) {
            const opts = g.options || g.selected_options || g.items || (Array.isArray(g) ? g : [g]);
            for (const o of opts) {
              const optName = o.title || o.name || (typeof o === 'string' ? o : '');
              if (optName && optName !== name) {
                notesList.push(optName);
              }
            }
          }
        }

        items.push({
          name: name.trim(),
          qty: qty,
          notes: notesList.join(', ')
        });
      }

      if (items.length > 0) {
        found.push({
          platform: 'Uber Eats',
          orderId: String(displayId),
          customerName: customerName,
          items: items,
          subtotal: 0,
          tax: 0,
          total: 0
        });
      }
    }

    // Traverse arrays and nested objects
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        walk(obj[key]);
      }
    }
  }

  walk(data);
  return found;
}

// 5. Listen for Intercepted Messages from injected.js
window.addEventListener('message', (event) => {
  if (event.data && event.data.source === 'JK_DELIVERY_GRABBER' && event.data.type === 'API_DATA') {
    const orders = extractOrdersFromUberJson(event.data.payload);
    for (const ord of orders) {
      dispatchOrderToBridge(ord);
    }
  }
});

// 6. DOM Observer Backup for Uber Eats Merchant Beta UI
function observeDomOrders() {
  const observer = new MutationObserver(() => {
    // Look for active order cards on merchants-beta.ubereats.com
    const orderElements = document.querySelectorAll('[data-testid="order-card"], [data-testid="order-detail"], div[class*="orderCard"], div[class*="OrderCard"]');
    orderElements.forEach(el => {
      try {
        const text = el.innerText || '';
        // Extract order ID
        const idMatch = text.match(/#([A-Za-z0-9]{4,8})/);
        if (!idMatch) return;
        const orderId = idMatch[1];
        if (processedOrderIds.has(orderId)) return;

        // Customer name is usually in a prominent header or heading
        const nameEl = el.querySelector('h2, h3, h4, [data-testid*="customer"], span[class*="customer"]');
        const customerName = nameEl ? nameEl.innerText.trim() : 'Uber Customer';

        // Extract items
        const itemRows = el.querySelectorAll('li, [data-testid*="item"], div[class*="itemRow"]');
        const items = [];
        itemRows.forEach(row => {
          const rowText = (row.innerText || '').trim();
          const itemMatch = rowText.match(/^(\d+)\s*(?:x|\*|\.)?\s+(.+)/i);
          if (itemMatch) {
            const qty = parseInt(itemMatch[1], 10) || 1;
            const lines = itemMatch[2].split('\n').map(l => l.trim()).filter(Boolean);
            const name = lines[0] || 'Item';
            const notes = lines.slice(1).join(', ');
            items.push({ name, qty, notes });
          }
        });

        if (items.length > 0) {
          dispatchOrderToBridge({
            platform: 'Uber Eats',
            orderId: orderId,
            customerName: customerName,
            items: items,
            subtotal: 0,
            tax: 0,
            total: 0
          });
        }
      } catch (e) {}
    });
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
}

if (document.body) observeDomOrders();
else window.addEventListener('DOMContentLoaded', observeDomOrders);

// 7. Grubhub Daily Financials Scraper & Auto-Printer (Today's Totals Only)
if (window.location.hostname.includes('grubhub.com') && window.location.pathname.includes('/financials/transactions')) {
  console.log('[JK-Financials] Active on Grubhub Financials Transactions page');

  async function selectTodayDateRange() {
    console.log('[JK-Financials] Checking date range selector for "Today"...');
    
    // Look for date dropdown or filter trigger button
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], select, div[class*="select"], div[class*="picker"], [data-testid*="date"], [class*="DateRange"]'));
    const trigger = buttons.find(el => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return t.includes('date') || t.includes('range') || t.includes('days') || t.includes('today') || t.includes('week') || t.includes('month');
    });

    if (trigger) {
      const triggerText = (trigger.innerText || '').trim();
      if (/^today$/i.test(triggerText)) {
        console.log('[JK-Financials] "Today" is already selected');
        return true;
      }

      console.log('[JK-Financials] Opening date dropdown:', triggerText);
      trigger.click();
      await new Promise(r => setTimeout(r, 700));

      // Look for "Today" option in dropdown/menu
      const options = Array.from(document.querySelectorAll('li, option, [role="option"], [role="menuitem"], button, span, div[class*="option"], div[class*="item"]'));
      const todayOption = options.find(el => {
        const t = (el.innerText || el.textContent || '').trim();
        return /^today$/i.test(t);
      });

      if (todayOption) {
        console.log('[JK-Financials] Selecting "Today" preset...');
        todayOption.click();
        await new Promise(r => setTimeout(r, 1200));

        // Click Apply if present
        const applyBtn = Array.from(document.querySelectorAll('button')).find(b => /apply|update|done/i.test(b.innerText || ''));
        if (applyBtn) {
          applyBtn.click();
          await new Promise(r => setTimeout(r, 1200));
        }
        return true;
      }
    }
    return false;
  }

  async function scrapeAndPrintGrubhubFinancials() {
    // 1. Initial wait for React page render
    await new Promise(r => setTimeout(r, 3500));

    // 2. Automatically switch date range selector to "Today"
    try {
      await selectTodayDateRange();
    } catch (e) {
      console.warn('[JK-Financials] Could not toggle date picker:', e);
    }

    // 3. Wait for transactions data to reload with Today's numbers
    await new Promise(r => setTimeout(r, 3000));

    try {
      const summaryLines = [];
      const cardElements = document.querySelectorAll('[class*="summary"], [class*="card"], [class*="stat"], [class*="metric"], [class*="total"], [class*="Row"], tr');
      
      cardElements.forEach(el => {
        const text = (el.innerText || '').trim();
        if (/\$[\d\.]+/.test(text) && text.length < 80) {
          const cleanText = text.replace(/\s+/g, ' ');
          if (!summaryLines.includes(cleanText)) {
            summaryLines.push(cleanText);
          }
        }
      });

      console.log("[JK-Financials] Extracted Today's summary lines:", summaryLines);

      // Post to local bridge
      const res = await fetch('http://localhost:8080/api/print-daily-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'Grubhub',
          storeId: '1945073',
          range: 'Today',
          date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          lines: summaryLines.slice(0, 15)
        })
      });

      console.log('[JK-Financials] Print response status:', res.status);

      // If auto-triggered at 3 PM, close tab after 4 seconds
      if (window.location.search.includes('auto_print=true')) {
        setTimeout(() => {
          window.close();
        }, 4000);
      }
    } catch (e) {
      console.error('[JK-Financials Error]', e);
    }
  }

  if (document.readyState === 'complete') {
    scrapeAndPrintGrubhubFinancials();
  } else {
    window.addEventListener('load', scrapeAndPrintGrubhubFinancials);
  }
}

// 8. Uber Eats Order History Daily Sales Scraper & Auto-Printer (Today's Totals Only)
if (window.location.hostname.includes('ubereats.com') && window.location.pathname.includes('/order-history')) {
  console.log('[JK-Financials] Active on Uber Eats Order History page');

  async function selectTodayUberDateRange() {
    console.log('[JK-Financials] Checking Uber date filter for "Today"...');
    
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], select, div[class*="select"], div[class*="picker"], [data-testid*="date"]'));
    const trigger = buttons.find(el => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return t.includes('date') || t.includes('today') || t.includes('days') || t.includes('range') || t.includes('week') || t.includes('month');
    });

    if (trigger) {
      const triggerText = (trigger.innerText || '').trim();
      if (/^today$/i.test(triggerText)) {
        console.log('[JK-Financials] Uber date is already "Today"');
        return true;
      }

      console.log('[JK-Financials] Opening Uber date dropdown:', triggerText);
      trigger.click();
      await new Promise(r => setTimeout(r, 700));

      const options = Array.from(document.querySelectorAll('li, option, [role="option"], [role="menuitem"], button, span, div[class*="option"], div[class*="item"]'));
      const todayOption = options.find(el => {
        const t = (el.innerText || el.textContent || '').trim();
        return /^today$/i.test(t);
      });

      if (todayOption) {
        console.log('[JK-Financials] Selecting Uber "Today" preset...');
        todayOption.click();
        await new Promise(r => setTimeout(r, 1200));

        const applyBtn = Array.from(document.querySelectorAll('button')).find(b => /apply|update|done/i.test(b.innerText || ''));
        if (applyBtn) {
          applyBtn.click();
          await new Promise(r => setTimeout(r, 1200));
        }
        return true;
      }
    }
    return false;
  }

  async function scrapeAndPrintUberFinancials() {
    // 1. Initial wait for React page render
    await new Promise(r => setTimeout(r, 3500));

    // 2. Select "Today"
    try {
      await selectTodayUberDateRange();
    } catch (e) {
      console.warn('[JK-Financials] Could not toggle Uber date picker:', e);
    }

    // 3. Wait for data to reload
    await new Promise(r => setTimeout(r, 3000));

    try {
      const summaryLines = [];
      const cardElements = document.querySelectorAll('[class*="summary"], [class*="card"], [class*="stat"], [class*="metric"], [class*="total"], [class*="Row"], [data-testid*="stat"], [data-testid*="card"], tr');

      cardElements.forEach(el => {
        const text = (el.innerText || '').trim();
        if (/\$[\d\.]+/.test(text) && text.length < 80) {
          const cleanText = text.replace(/\s+/g, ' ');
          if (!summaryLines.includes(cleanText)) {
            summaryLines.push(cleanText);
          }
        }
      });

      console.log("[JK-Financials] Extracted Uber Today's summary lines:", summaryLines);

      // Post to local bridge
      const res = await fetch('http://localhost:8080/api/print-daily-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'Uber Eats',
          range: 'Today',
          date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          lines: summaryLines.slice(0, 15)
        })
      });

      console.log('[JK-Financials] Uber print response status:', res.status);

      // If auto-triggered at 3 PM, close tab after 4 seconds
      if (window.location.search.includes('auto_print=true')) {
        setTimeout(() => {
          window.close();
        }, 4000);
      }
    } catch (e) {
      console.error('[JK-Financials Error]', e);
    }
  }

  if (document.readyState === 'complete') {
    scrapeAndPrintUberFinancials();
  } else {
    window.addEventListener('load', scrapeAndPrintUberFinancials);
  }
}
