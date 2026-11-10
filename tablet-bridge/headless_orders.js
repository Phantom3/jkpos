/**
 * Headless Delivery Order Sync Service
 * Runs Microsoft Edge headlessly in the background without any visible windows.
 * Continuously captures live orders from Uber Eats & Grubhub via the browser extension.
 */

const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE_DIR = 'C:\\Users\\Dunesuser\\AppData\\Local\\HeadlessDeliveryProfile';
const EXTENSION_DIR = 'C:\\Users\\Dunesuser\\jkrestaurant-web\\browser-extension';

const UBER_URL = 'https://merchants-beta.ubereats.com/orders/overview';
const GRUBHUB_URL = 'https://restaurant.grubhub.com';

let healthCheckTimer = null;
let consecutiveFailures = 0;
let logger = (msg) => console.log(`[Headless-Sync ${new Date().toISOString()}] ${msg}`);

function log(msg) {
  logger(msg);
}

function cleanLockFiles() {
  const lockFiles = [
    path.join(PROFILE_DIR, 'LOCK'),
    path.join(PROFILE_DIR, 'Default', 'LOCK'),
    path.join(PROFILE_DIR, 'SingletonLock'),
    path.join(PROFILE_DIR, 'SingletonCookie'),
    path.join(PROFILE_DIR, 'SingletonSocket')
  ];
  for (const f of lockFiles) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e) {}
  }
}

function checkBrowserHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:9222/json/version', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureTargetTabsOpen() {
  try {
    const listReq = http.get('http://localhost:9222/json/list', (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const hasUber = tabs.some(t => t.url && t.url.includes('ubereats.com'));
          const hasGrubhub = tabs.some(t => t.url && t.url.includes('grubhub.com'));

          if (!hasUber) {
            log('Opening Uber Eats tab in headless session...');
            const req = http.request({ hostname: 'localhost', port: 9222, path: `/json/new?${encodeURIComponent(UBER_URL)}`, method: 'PUT' });
            req.end();
          }
          if (!hasGrubhub) {
            log('Opening Grubhub tab in headless session...');
            const req = http.request({ hostname: 'localhost', port: 9222, path: `/json/new?${encodeURIComponent(GRUBHUB_URL)}`, method: 'PUT' });
            req.end();
          }
        } catch (e) {}
      });
    });
    listReq.on('error', () => {});
  } catch (e) {}
}

async function startHeadlessBrowser(customLog) {
  if (customLog) logger = customLog;

  const isAlive = await checkBrowserHealth();
  if (isAlive) {
    log('Headless Edge is already active and healthy (port 9222).');
    ensureTargetTabsOpen();
    startHealthMonitor();
    return;
  }

  if (!fs.existsSync(EDGE_PATH)) {
    log(`ERROR: Microsoft Edge not found at ${EDGE_PATH}`);
    return;
  }

  cleanLockFiles();
  log('Starting Microsoft Edge in 100% invisible headless mode...');

  const psCmd = `Start-Process "${EDGE_PATH}" -ArgumentList '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9222', '--user-data-dir="${PROFILE_DIR}"', '--load-extension="${EXTENSION_DIR}"', '${UBER_URL}', '${GRUBHUB_URL}'`;

  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], (err) => {
    if (err) {
      log(`Failed to launch headless Edge: ${err.message}`);
    } else {
      log('Headless Edge background process spawned.');
      setTimeout(() => {
        ensureTargetTabsOpen();
      }, 4000);
    }
  });

  startHealthMonitor();
}

function startHealthMonitor() {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(async () => {
    const healthy = await checkBrowserHealth();
    if (healthy) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        log('Headless Edge health check failed 3 times. Restarting...');
        consecutiveFailures = 0;
        cleanLockFiles();
        startHeadlessBrowser(logger);
      }
    }
  }, 25000);
}

function stopHeadlessBrowser() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

module.exports = {
  startHeadlessBrowser,
  stopHeadlessBrowser
};
