/**
 * Injected script into merchants-beta.ubereats.com & restaurant.grubhub.com
 * Hooks fetch and XMLHttpRequest to extract pure JSON order objects
 */

(function() {
  console.log('[JK-Grabber] Page hook active on', window.location.hostname);

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
      
      // Match active orders / order overview / graphql calls
      if (url.includes('orders') || url.includes('active') || url.includes('graphql') || url.includes('eats')) {
        const clone = response.clone();
        clone.json().then(data => {
          window.postMessage({
            source: 'JK_DELIVERY_GRABBER',
            type: 'API_DATA',
            url: url,
            payload: data
          }, '*');
        }).catch(() => {});
      }
    } catch (e) {}
    return response;
  };

  // 2. Hook XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._jkUrl = url;
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      try {
        const url = this._jkUrl || '';
        if (url.includes('orders') || url.includes('active') || url.includes('graphql')) {
          const data = JSON.parse(this.responseText);
          window.postMessage({
            source: 'JK_DELIVERY_GRABBER',
            type: 'API_DATA',
            url: url,
            payload: data
          }, '*');
        }
      } catch (e) {}
    });
    return originalXhrSend.apply(this, arguments);
  };
})();
