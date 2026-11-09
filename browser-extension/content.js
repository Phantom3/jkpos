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
